import { scan } from '../parser/tokenizer.js';

const PREC = {
    __proto__: null,
    '*': 14, '/': 14, '%': 14,
    '+': 13, '-': 13,
    '<<': 12, '>>': 12,
    '<': 11, '<=': 11, '>': 11, '>=': 11,
    '==': 10, '!=': 10,
    '&': 9,
    '^': 8,
    '|': 7,
    '&&': 6,
    '||': 5
};

// the spellings the DSL takes on top of GLSL's own; `not` only folds its case
const ALIAS = new Map([
    ['=', '=='], ['≤', '<='], ['≥', '>='], ['≠', '!='],
    ['and', '&&'], ['or', '||'], ['not', 'not']
]);

const RELATIONAL_OPS = new Set(['<', '<=', '>', '>=']);
const COMPARISON_OPS = new Set([...RELATIONAL_OPS, '==', '!=']);
const INT_OPS = new Set(['&', '^', '|', '<<', '>>']);

const ZERO = { type: 'Lit', val: '0' };

const CALL_TYPES = new Map();
const typeList = {
    float: 'rand noise fbm voronoi ngon escape spiral dither length distance dot determinant',
    vec2: 'rot',
    vec3: 'hsl hsv',
    bool: 'any all',
    bvec: 'isnan isinf lessThan lessThanEqual greaterThan greaterThanEqual equal notEqual',
};
for (const [type, names] of Object.entries(typeList)) {
    for (const name of names.split(' ')) CALL_TYPES.set(name, type);
}

const RANK = [
    'bool', 'int', 'float', 'mat2', 'bvec2', 'bvec3', 'bvec4', 'vec2', 'vec3', 'vec4'
];

const isVector = type => /^(vec|mat)/.test(type);
const isFactor = t => t && !PREC[t.value] && (t.isWord() || t.value === '(' || t.value === 'π');

function cast(out, res, exp) {
    return !exp || exp === res || exp === 'float' && /^b?vec|^mat/.test(res) ? out : `${exp}(${out})`;
}

// #rgb and #rrggbb are vec3 literals
function hexColors(code) {
    return code.replace(/#([0-9a-f]{3}|[0-9a-f]{6})\b/gi, (_, hex) => {
        if (hex.length === 3) hex = hex.replace(/./g, '$&$&');
        return `vec3(${[0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).join(', ')})`;
    });
}

function lex(code) {
    const tokens = [];
    let touching = false;
    for (const t of scan(hexColors(code))) {
        const last = tokens[tokens.length - 1];
        if (t.isSpace()) {
            touching = false;
        } else if (touching && (PREC[last.value + t.value] || last.isWord() && t.isNumber() && !ALIAS.has(last.value.toLowerCase()))) {
            last.value += t.value;
        } else {
            tokens.push(t);
            touching = true;
        }
    }
    for (const t of tokens) {
        t.value = ALIAS.get(t.value.toLowerCase()) || t.value;
    }
    return tokens;
}

export default function transform(code, { expect = null, type = false, types = { __proto__: null } } = {}) {
    const tokens = lex(code);

    let pos = 0;
    const peek = () => tokens[pos];
    const consume = () => tokens[pos++];

    function primary() {
        const t = consume();
        if (!t) return null;

        let n;
        if (t.isNumber()) {
            n = { type: 'Lit', val: t.value };
        } else if (t.value === '(') {
            n = parse();
            consume();
        } else if (t.value === '!' || t.value === '~' || t.value === '-') {
            n = { type: 'Pre', val: t.value, right: parse(Infinity) };
        } else if (t.value === 'not') {
            // `not` covers a whole comparison, as in media queries
            n = { type: 'Pre', val: '!', right: parse(PREC['&&'] + 1) };
        } else if (t.isWord()) {
            n = peek()?.value === '(' ? call(t.value) : { type: 'Var', val: t.value };
        } else if (t.value === 'π') {
            n = { type: 'Var', val: 'PI' };
        } else {
            n = ZERO;
        }
        // a swizzle after a call or a parenthesized value: vec2(a, b).x, (z).xy
        while (peek()?.isWord() && peek().value[0] === '.') {
            n = { type: 'Member', val: consume().value, left: n };
        }
        return n;
    }

    function parse(min = 0) {
        let n = primary();
        if (!n) return null;
        // a number or π followed by a name, a call or a group multiplies: 2t, 2πt, 2sin(t), 2(t + 1)
        if (n.type === 'Lit' || n.type === 'Var' && n.val === 'PI') {
            while (isFactor(peek())) {
                const right = primary();
                if (!right) break;
                n = { type: 'Bin', val: '*', left: n, right };
            }
        }
        while (peek()) {
            const op = peek().value;
            const p = PREC[op];
            if (!p || p < min) break;
            consume();
            const right = parse(p + 1);
            if (!right) break;
            n = { type: 'Bin', val: op, left: n, right };
        }
        return n;
    }

    function call(name) {
        consume();
        const args = [];
        while (peek() && peek().value !== ')') {
            args.push(parse());
            if (peek()?.value === ',') consume();
        }
        consume();
        return { type: 'Call', val: name, args };
    }

    function gen(n, exp) {
        if (!n) return '';
        if (n.type === 'Lit') {
            if (exp === 'int') return String(Math.floor(n.val));
            return cast(n.val.includes('.') ? n.val : n.val + '.0', 'float', exp);
        }
        if (n.type === 'Var') {
            return cast(n.val, infer(n), exp);
        }
        if (n.type === 'Member') {
            return cast(gen(n.left) + n.val, infer(n), exp);
        }
        if (n.type === 'Pre') {
            if (!n.right) return gen(ZERO, exp);
            if (n.val === '!') {
                const type = infer(n);
                if (type.startsWith('bvec')) return cast(`not(${gen(n.right, type)})`, type, exp);
                return cast(`!${gen(n.right, 'bool')}`, 'bool', exp);
            }
            if (n.val === '~') return cast(`~${gen(n.right, 'int')}`, 'int', exp);
            // minus keeps the type of its operand, and a bool has no minus
            if (exp === 'bool') return `bool(-${gen(n.right, 'float')})`;
            return `-${gen(n.right, exp)}`;
        }
        if (n.type === 'Call' && n.val === 'cond') {
            // cond(t1, v1, t2, v2, …, else): the value after the first test that holds
            const a = n.args;
            let out = gen(a.length % 2 ? a[a.length - 1] : ZERO, exp);
            for (let i = a.length - 2 - a.length % 2; i >= 0; i -= 2) {
                out = `(${gen(a[i], 'bool')} ? ${gen(a[i + 1], exp)} : ${out})`;
            }
            return out;
        }
        if (n.type === 'Call') {
            const arg = /^b/.test(infer(n)) ? null : 'float';
            const args = n.args.map(a => gen(a, arg)).join(', ');
            if (n.val === 'float') return cast(args, 'float', exp);
            return cast(`${n.val}(${args})`, infer(n), exp);
        }

        const op = n.val;

        // a < b < c reads as a < b && b < c
        if (RELATIONAL_OPS.has(op) && n.left.type === 'Bin' && RELATIONAL_OPS.has(n.left.val)) {
            const out = `(${gen(n.left, 'bool')} && (${gen(n.left.right, 'float')} ${op} ${gen(n.right, 'float')}))`;
            return cast(out, 'bool', exp);
        }

        const res = infer(n);
        const arg = COMPARISON_OPS.has(op) || isVector(res) ? 'float' : res;
        const l = gen(n.left, arg);
        const r = gen(n.right, arg);
        return cast(op === '%' ? `mod(${l}, ${r})` : `(${l} ${op} ${r})`, res, exp);
    }

    // the GLSL type of a node; `.xy` is a vec2, `.x` a float
    const swizzle = s => s.length > 2 ? `vec${s.length - 1}` : 'float';
    function infer(n) {
        return n ? n.t || (n.t = inferType(n)) : 'float';
    }
    function inferType(n) {
        if (n.type === 'Lit') return 'float';
        if (n.type === 'Var') {
            if (n.val === 'true' || n.val === 'false') return 'bool';
            const dot = n.val.indexOf('.');
            if (dot > 0) return swizzle(n.val.slice(dot));
            return types[n.val] || (n.val === 'uv' ? 'vec2' : 'float');
        }
        if (n.type === 'Member') return swizzle(n.val);
        if (n.type === 'Pre') {
            if (n.val === '~') return 'int';
            const right = infer(n.right);
            // `not` of a bvec is a bvec, of anything else a bool
            if (n.val === '!') return right.startsWith('bvec') ? right : 'bool';
            return right;
        }
        if (n.type === 'Call') {
            const known = CALL_TYPES.get(n.val);
            if (known === 'bvec') return infer(n.args[0]).replace(/^vec/, 'bvec').replace('float', 'bool');
            if (known) return known;
            if (/^(b?vec[234]|mat2|float|int|bool)$/.test(n.val)) return n.val;
            // cond(t1, v1, …, else) yields one of its values
            if (n.val === 'cond') return widest(n.args.filter((_, i) => i % 2 || i === n.args.length - 1).map(infer));
            // any other function returns the type of its widest argument, a number at least
            return widest(n.args.map(infer), true);
        }
        if (COMPARISON_OPS.has(n.val) || n.val === '&&' || n.val === '||') return 'bool';
        if (INT_OPS.has(n.val)) return 'int';
        // arithmetic is done in floats unless a vector is involved
        return widest([infer(n.left), infer(n.right)], true);
    }

    // the widest of the types; `number` settles for a float unless a vector is among them
    function widest(values, number) {
        const res = values.reduce((a, b) => RANK.indexOf(b) > RANK.indexOf(a) ? b : a, values[0] || 'float');
        return number && !isVector(res) ? 'float' : res;
    }

    try {
        const tree = parse();
        return type ? infer(tree) : gen(tree, expect);
    }
    catch (e) { console.error(e); return code; }
}
