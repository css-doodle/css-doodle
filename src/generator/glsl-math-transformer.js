import { scan } from '../parser/tokenizer.js';

const PREC = {
    __proto__: null,
    '**': 15,
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

const PREFIX = {
    __proto__: null,
    '-': Infinity, '!': Infinity, '~': Infinity,
    'not': PREC['&&'] + 1
};

const ALIAS = {
    __proto__: null,
    '=': '==', '≤': '<=', '≥': '>=', '≠': '!=',
    'and': '&&', 'or': '||', 'not': 'not'
};

const RELATIONAL_OPS = new Set(['<', '<=', '>', '>=']);
const COMPARISON_OPS = new Set([...RELATIONAL_OPS, '==', '!=']);
const INT_OPS = new Set(['&', '^', '|', '<<', '>>']);
const VEC_COMPARE = {
    __proto__: null,
    '<': 'lessThan', '<=': 'lessThanEqual', '>': 'greaterThan', '>=': 'greaterThanEqual',
    '==': 'equal', '!=': 'notEqual'
};

const CALL_TYPES = { __proto__: null };
const typeList = Object.entries({
    float: 'rand noise fbm voronoi ngon box segment shape escape spiral dither length distance dot determinant',
    vec2: 'rot',
    vec3: 'hsl hsv',
    vec4: 'texture',
    bool: 'any all',
    bvec: 'isnan isinf lessThan lessThanEqual greaterThan greaterThanEqual equal notEqual',

});
for (const [type, names] of typeList) {
    for (const name of names.split(' ')) {
        CALL_TYPES[name] = type;
    }
}

const RANK = [
    'bool', 'int', 'float', 'mat2', 'mat3', 'mat4', 'bvec2', 'bvec3', 'bvec4', 'vec2', 'vec3', 'vec4'
];

const ZERO = { type: 'Lit', val: '0' };

const valueOf = stop => stop.type === 'Stop' ? stop.left : stop;
const isVector = type => /^(vec|mat)/.test(type);
const isFactor = t => t && !t.spaced && !PREC[t.value] && (t.isWord() || t.value === '(' || t.value === 'π');
const isValue = t => t && !PREC[t.value] && !PREFIX[t.value] && (t.isWord() || t.isNumber() || t.value === '(' || t.value === 'π');
// the type of a swizzle: `.xy` is a vec2, `.x` a float
const swizzle = s => (s = s.slice(s.lastIndexOf('.'))).length > 2 ? `vec${s.length - 1}` : 'float';

// wrap `out` of type `res` in a constructor when `exp` wants another type;
// vectors and samplers pass where a float is wanted
function cast(out, res, exp) {
    if (!exp || exp === res || exp === 'float' && /vec|mat|sampler/.test(res)) return out;
    if (exp === 'bool' && /^b?vec/.test(res)) return `any(${res[0] === 'b' ? out : `b${res}(${out})`})`;
    return `${exp}(${out})`;
}

export const float = v => /[.e]/i.test(v) ? v : v + '.0';

function hexColors(code) {
    return code.replace(/#([0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})\b/gi, (_, hex) => {
        if (hex.length < 6) hex = hex.replace(/./g, '$&$&');
        const channels = hex.match(/../g).map(h => parseInt(h, 16) / 255);
        return `vec${channels.length}(${channels.join(', ')})`;
    });
}

function joinsName(last, t) {
    if (last.isWord()) {
        return t.value === '_' || t.isNumber() && !ALIAS[last.value.toLowerCase()] || t.isWord() && /[_.]$/.test(last.value);
    }
    return last.value === '_' && (t.isWord() || t.isNumber());
}

function lex(code) {
    const tokens = [];
    let touching = false;
    for (const t of scan(hexColors(code))) {
        const last = tokens[tokens.length - 1];
        if (t.isSpace()) {
            touching = false;
        } else if (touching && (PREC[last.value + t.value] || joinsName(last, t))) {
            last.value += t.value;
            if (!PREC[last.value]) last.type = 'Word';
        } else {
            t.spaced = !touching;
            tokens.push(t);
            touching = true;
        }
    }
    for (const t of tokens) t.value = ALIAS[t.value.toLowerCase()] || t.value;
    return tokens;
}

export function compile(code, { types = { __proto__: null }, names = null, unknown = null, warn = null, rand = null } = {}) {
    const tokens = lex(code);

    let pos = 0;
    let inArgs = false;
    const peek = () => tokens[pos];
    const consume = () => tokens[pos++];

    function variable(val) {
        const dot = val.indexOf('.');
        const head = dot > 0 ? val.slice(0, dot) : val;
        const id = names?.[head];
        const rgba = !id && !types[head] && unknown?.(head);
        const n = rgba
            ? { type: 'Call', val: `vec${rgba.length}`, args: rgba.map(v => ({ type: 'Lit', val: String(v) })) }
            : { type: 'Var', val: id || head };
        return dot > 0 ? { type: 'Member', val: val.slice(dot), left: n } : n;
    }

    function primary() {
        const t = consume();
        if (!t) return null;

        let n;
        if (t.isNumber()) {
            n = { type: 'Lit', val: t.value };
        } else if (t.value === '(') {
            const outer = inArgs;
            inArgs = false;
            n = parse();
            inArgs = outer;
            consume();
        } else if (PREFIX[t.value]) {
            n = { type: 'Pre', val: t.value === 'not' ? '!' : t.value, right: parse(PREFIX[t.value]) };
        } else if (t.value === 'π') {
            n = { type: 'Var', val: 'PI' };
        } else if (t.isWord()) {
            n = peek()?.value === '(' ? call(t.value) : variable(t.value);
        } else {
            report(`unexpected ${t.value}`);
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
        // a number or π touching a name, a call or a group multiplies: 2t, 2πt, 2sin(t), 2(t + 1)
        if (n.type === 'Lit' || n.type === 'Var' && n.val === 'PI') {
            while (isFactor(peek())) {
                n = { type: 'Bin', val: '*', left: n, right: primary() };
            }
        }
        while (peek()?.value === 'π' && !peek().spaced) {
            n = { type: 'Bin', val: '*', left: n, right: primary() };
        }
        while (peek()) {
            const op = peek().value;
            const p = PREC[op];
            if (!p || p < min) break;
            consume();
            const right = parse(op === '**' ? p : p + 1);
            if (!right) {
                report(`${op} needs a value after it`);
                break;
            }
            n = { type: 'Bin', val: op, left: n, right };
        }
        // a token the grammar cannot place: 2 t, r 9, (a)(b), a ? b : c
        const t = peek();
        if (t && !PREC[t.value] && t.value !== ')' && t.value !== ',' && !(inArgs && isValue(t))) {
            const word = t.value.toLowerCase();
            report(word === 'xor' ? 'there is no xor; write != between the two conditions'
                : word === '?' ? 'there is no ?:; write match(test, a, b)'
                : isValue(t) ? 'values side by side do not multiply; write * between them'
                : `unexpected ${t.value}`);
        }
        return n;
    }

    function report(message) {
        if (warn) warn(`"${code.trim()}": ${message}`);
        warn = null;
    }

    function call(name) {
        consume();
        const args = [];
        const outer = inArgs;
        inArgs = true;
        let comma = true;
        while (peek() && peek().value !== ')') {
            const arg = parse();
            // in ramp() a stop's position follows its value after a space: #f80 .5
            if (name === 'ramp' && !comma && args.length > 1) {
                if (args[args.length - 1].type === 'Stop') report('a ramp() stop takes one position');
                else args.push({ type: 'Stop', left: args.pop(), right: arg });
            } else {
                args.push(arg);
            }
            comma = peek()?.value === ',';
            if (comma) consume();
        }
        inArgs = outer;
        consume();
        if (name === 'rand' && !args.length && rand) return { type: 'Var', val: rand() };
        return { type: 'Call', val: name, args };
    }

    function gen(n, exp) {
        if (!n) return '';
        if (n.type === 'Lit') {
            if (exp === 'int') return String(Math.floor(n.val));
            return cast(float(n.val), 'float', exp);
        }
        if (n.type === 'Var') {
            return cast(n.val, infer(n), exp);
        }
        if (n.type === 'Member') {
            return cast(gen(n.left) + n.val, infer(n), exp);
        }
        if (n.type === 'Pre') {
            if (!n.right) return gen(ZERO, exp);
            if (n.val === '-') {
                // minus keeps the type of its operand, and a bool has no minus
                if (exp === 'bool') return `bool(-${gen(n.right, 'float')})`;
                return `-${gen(n.right, exp)}`;
            }
            // ! and ~ take a bool and an int; a bvec is negated with not()
            const type = infer(n);
            const right = gen(n.right, type);
            return cast(type.startsWith('bvec') ? `not(${right})` : n.val + right, type, exp);
        }
        if (n.type === 'Call' && n.val === 'match') {
            // match(t1, v1, t2, v2, …, else): the value after the first test that holds
            const a = n.args;
            let out = gen(a.length % 2 ? a[a.length - 1] : ZERO, exp);
            for (let i = a.length - 2 - a.length % 2; i >= 0; i -= 2) {
                out = `(${gen(a[i], 'bool')} ? ${gen(a[i + 1], exp)} : ${out})`;
            }
            return out;
        }
        if (n.type === 'Call' && n.val === 'ramp') {
            return cast(ramp(n.args, infer(n)), infer(n), exp);
        }
        if (n.type === 'Call') {
            // arguments are numbers unless the function yields a bool or bvec
            const res = infer(n);
            const args = n.args.map(a => gen(a, /^b/.test(res) ? null : 'float')).join(', ');
            if (n.val === 'float' && n.args.length === 1 && !isVector(infer(n.args[0]))) {
                return cast(args, 'float', exp);
            }
            if (n.val === 'shape') return cast(`cssd_shape(${args}${n.args.length === 1 ? ', 1.0' : ''})`, res, exp);
            return cast(`${n.val}(${args})`, res, exp);
        }

        const op = n.val;

        // a < b < c reads as a < b && b < c
        if (RELATIONAL_OPS.has(op) && n.left.type === 'Bin' && RELATIONAL_OPS.has(n.left.val)) {
            const second = { type: 'Bin', val: op, left: n.left.right, right: n.right };
            return cast(`(${gen(n.left, 'bool')} && ${gen(second, 'bool')})`, 'bool', exp);
        }

        const res = infer(n);
        if (op === '**') {
            const arg = isVector(res) ? res : 'float';
            const l = gen(n.left, arg);
            const k = n.right.type === 'Lit' ? Number(n.right.val) : 0;
            if (Number.isInteger(k) && k > 1 && k < 5) return cast(`(${Array(k).fill(l).join(' * ')})`, res, exp);
            return cast(`pow(${l}, ${gen(n.right, arg)})`, res, exp);
        }
        const lt = infer(n.left), rt = infer(n.right);
        const vec = COMPARISON_OPS.has(op) && (/^vec/.test(lt) ? lt : /^vec/.test(rt) ? rt : '');
        const arg = vec || (COMPARISON_OPS.has(op) || isVector(res) ? 'float' : res);
        const l = gen(n.left, arg);
        const r = gen(n.right, arg);
        if (vec) return cast(`${op === '!=' ? 'any' : 'all'}(${VEC_COMPARE[op]}(${l}, ${r}))`, 'bool', exp);
        return cast(op === '%' ? `mod(${l}, ${r})` : `(${l} ${op} ${r})`, res, exp);
    }

    function ramp([t, ...stops], type) {
        if (!stops.length) return gen(ZERO, type);
        const at = stops.map(s => {
            if (s.type !== 'Stop') return NaN;
            if (s.right.type !== 'Lit') report('ramp() positions must be numbers');
            return +s.right.val;
        });
        const n = at.length - 1;
        at[0] ||= 0;
        if (isNaN(at[n])) at[n] = 1;
        for (let i = 1, j = 0; i <= n; i++) {
            if (j <= i) for (j = i; isNaN(at[j]); j++);
            const next = isNaN(at[i]) ? at[i - 1] + (at[j] - at[i - 1]) / (j - i + 1) : at[i];
            at[i] = Math.max(at[i - 1], next);
        }
        const v = gen(t, 'float');
        let out = gen(valueOf(stops[0]), type);
        for (let i = 1; i <= n; i++) {
            const a = float(String(at[i - 1])), b = float(String(at[i]));
            out = `mix(${out}, ${gen(valueOf(stops[i]), type)}, clamp((${v} - ${a}) / max(${b} - ${a}, fwidth(${v}) + 1e-5), 0.0, 1.0))`;
        }
        return out;
    }

    // the GLSL type of a node, computed once
    function infer(n) {
        return n ? n.t || (n.t = inferType(n)) : 'float';
    }
    function inferType(n) {
        if (n.type === 'Lit') return 'float';
        if (n.type === 'Var') {
            if (n.val === 'true' || n.val === 'false') return 'bool';
            return types[n.val] || (n.val === 'uv' || n.val === 'pos' ? 'vec2' : 'float');
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
            const known = CALL_TYPES[n.val];
            if (known === 'bvec') return infer(n.args[0]).replace(/^vec/, 'bvec').replace('float', 'bool');
            if (known) return known;
            if (/^(b?vec[234]|mat[234]|float|int|bool)$/.test(n.val)) return n.val;
            // match(t1, v1, …, else) yields one of its values
            if (n.val === 'match') return widest(n.args.filter((_, i) => i % 2 || i === n.args.length - 1).map(infer));
            // ramp(t, stops…) yields the widest of its stop values
            if (n.val === 'ramp') return widest(n.args.slice(1).map(a => infer(valueOf(a))), true);
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

    const tree = parse();
    if (peek()) report(`unexpected ${peek().value}`);
    return { type: infer(tree), code: exp => gen(tree, exp) };
}

export default function transform(code, { expect = null, type = false, ...opts } = {}) {
    try {
        const e = compile(code, opts);
        return type ? e.type : e.code(expect);
    }
    catch (e) { console.error(e); return code; }
}
