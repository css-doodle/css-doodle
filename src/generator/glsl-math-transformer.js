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

const TWO_CHAR_OPS = new Set(['<<', '>>', '==', '!=', '<=', '>=', '&&', '||']);
const RELATIONAL_OPS = new Set(['<', '<=', '>', '>=']);
const COMPARISON_OPS = new Set([...RELATIONAL_OPS, '==', '!=']);
const INT_OPS = new Set(['&', '^', '|', '<<', '>>']);

const ZERO = { type: 'Lit', val: '0' };

const isFactor = t => t && !PREC[t.value] && (t.isWord() || t.value === '(' || t.value === 'π');

function cast(out, res, exp) {
    return (exp && exp !== res) ? `${exp}(${out})` : out;
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
        } else if (touching && (TWO_CHAR_OPS.has(last.value + t.value)
                || last.isWord() && t.isNumber() && !ALIAS.has(last.value.toLowerCase()))) {
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

export default function transform(code, { expect = null } = {}) {
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
            return cast(n.val, 'float', exp);
        }
        if (n.type === 'Member') {
            return cast(gen(n.left) + n.val, 'float', exp);
        }
        if (n.type === 'Pre') {
            if (!n.right) return gen(ZERO, exp);
            if (n.val === '!') return cast(`!${gen(n.right, 'bool')}`, 'bool', exp);
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
            const args = n.args.map(a => gen(a, 'float')).join(', ');
            if (n.val === 'float') return cast(args, 'float', exp);
            return cast(`${n.val}(${args})`, n.val === 'int' ? 'int' : 'float', exp);
        }

        const op = n.val;

        // a < b < c reads as a < b && b < c
        if (RELATIONAL_OPS.has(op) && n.left.type === 'Bin' && RELATIONAL_OPS.has(n.left.val)) {
            const out = `(${gen(n.left, 'bool')} && (${gen(n.left.right, 'float')} ${op} ${gen(n.right, 'float')}))`;
            return cast(out, 'bool', exp);
        }

        // the type an operator yields and the type it wants its operands in
        let res = 'float', arg = 'float';
        if (INT_OPS.has(op)) res = arg = 'int';
        else if (op === '&&' || op === '||') res = arg = 'bool';
        else if (COMPARISON_OPS.has(op)) res = 'bool';

        const l = gen(n.left, arg);
        const r = gen(n.right, arg);
        return cast(op === '%' ? `mod(${l}, ${r})` : `(${l} ${op} ${r})`, res, exp);
    }

    try { return gen(parse(), expect); }
    catch (e) { console.error(e); return code; }
}
