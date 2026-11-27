import { scan } from '../parser/tokenizer.js';
import { fillStops } from '../lib/math.js';
import { glsl } from '../lib/tagged-template.js';

const PREC = {
    __proto__: null,
    '**': 15,
    '*': 14, '/': 14, '%': 14,
    '+': 13, '-': 13,
    '<<': 12, '>>': 12,
    '&': 11,
    '|': 10,
    '<': 9, '<=': 9, '>': 9, '>=': 9,
    '==': 8, '!=': 8,
    '&&': 6,
    '||': 5
};

const PREFIX = {
    __proto__: null,
    '-': Infinity, '+': Infinity, '!': Infinity, '~': Infinity,
    'not': PREC['&&'] + 1
};

// `^` is power, as in $()
const ALIAS = {
    __proto__: null,
    '^': '**', '=': '==', '≤': '<=', '≥': '>=', '≠': '!=',
    'and': '&&', 'or': '||', 'not': 'not'
};

const RELATIONAL_OPS = new Set(['<', '<=', '>', '>=']);
const GLSL_NAMES = new Set(['PI', 'true', 'false']);
// angles in radians, unless a variable of the name hides them: `rot(p, 45deg)`
const CONSTANTS = { __proto__: null, deg: glsl`(PI / 180.0)`, turn: glsl`(2.0 * PI)` };
const COLOR_CALL = /^(rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)$/i;
const INT_OPS = new Set(['&', '|', '<<', '>>']);
const VEC_COMPARE = {
    __proto__: null,
    '<': 'lessThan', '<=': 'lessThanEqual', '>': 'greaterThan', '>=': 'greaterThanEqual',
    '==': 'equal', '!=': 'notEqual'
};

const CALL_TYPES = { __proto__: null };
for (const [type, names] of Object.entries({
    float: 'rand noise fbm voronoi segment arc g_shape escape dither length distance dot determinant angle circle rect g_stroke g_union g_intersect g_subtract',
    vec2: 'rotate',
    vec3: 'hsl',
    vec4: 'texture',
    bool: 'any all',
    bvec: 'isnan isinf lessThan lessThanEqual greaterThan greaterThanEqual equal notEqual',
})) {
    for (const name of names.split(' ')) CALL_TYPES[name] = type;
}

const POINTS = new Set('rand noise fbm voronoi rotate escape dither segment arc length angle circle rect'.split(' '));

const CALLS = { __proto__: null, random: 'rand', rot: 'rotate', ramp: 'gradient', shape: 'g_shape', stroke: 'g_stroke', smin: 'g_union', union: 'g_union', intersect: 'g_intersect', subtract: 'g_subtract' };

const RANK = 'bool int float mat2 mat3 mat4 bvec2 bvec3 bvec4 vec2 vec3 vec4'.split(' ');

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

export const float = v => /^0x/i.test(v) ? Number(v) + '.0' : /[.e]/i.test(v) ? v : v + '.0';

function hexColors(code) {
    return code.replace(/#([0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})\b/gi, (_, hex) => {
        if (hex.length < 6) hex = hex.replace(/./g, '$&$&');
        const channels = hex.match(/../g).map(h => parseInt(h, 16) / 255);
        return `vec${channels.length}(${channels.join(', ')})`;
    });
}

function joinsName(last, t) {
    if (last.isWord()) {
        return t.value === '_' || t.isNumber() && !ALIAS[last.value.toLowerCase()] || t.isWord() && /[\d_.]$/.test(last.value);
    }
    return last.value === '_' && (t.isWord() || t.isNumber());
}

function lex(source) {
    const tokens = [];
    let touching = false;
    for (const t of scan(source)) {
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

export function compile(code, { types = { __proto__: null }, names, unknown, warn, rand } = {}) {
    const source = hexColors(code);
    const tokens = lex(source);

    let pos = 0;
    const peek = () => tokens[pos];
    const consume = () => tokens[pos++];

    function report(message) {
        if (warn) warn(message);
        warn = null;
    }

    function stray(end) {
        const t = peek();
        if (t && t.value !== end) report(`unexpected ${t.value}`);
    }

    function variable(val) {
        const dot = val.indexOf('.');
        const head = dot > 0 ? val.slice(0, dot) : val;
        const id = names?.[head] || CONSTANTS[head];
        const v = !id && !types[head] && !GLSL_NAMES.has(head) && unknown?.(head);
        const lits = v && v.map(c => ({ type: 'Lit', val: String(c) }));
        if (v?.length === 1) return dot > 0 ? { type: 'Call', val: swizzle(val), args: lits } : lits[0];
        const n = v ? { type: 'Call', val: `vec${v.length}`, args: lits } : { type: 'Var', val: id || head };
        return dot > 0 ? { type: 'Member', val: val.slice(dot), left: n } : n;
    }

    function primary() {
        const t = consume();
        if (!t) return null;

        let n;
        if (t.isNumber()) {
            n = { type: 'Lit', val: t.value };
        } else if (t.value === '(') {
            n = parse();
            if (n?.type === 'Bin') n.group = true;
            stray(')');
            consume();
        } else if (PREFIX[t.value]) {
            n = { type: 'Pre', val: t.value === 'not' ? '!' : t.value, right: parse(PREFIX[t.value]) };
        } else if (t.value === 'π') {
            n = { type: 'Var', val: 'PI' };
        } else if (t.isWord()) {
            n = peek()?.value === '(' && !peek().spaced ? color(t) || call(t.value) : variable(t.value);
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

    function power(n) {
        if (!n || peek()?.value !== '**') return n;
        if (n.type === 'Lit' && n.val[0] === '-' && tokens[pos - 1].isNumber()) {
            return { type: 'Pre', val: '-', right: power({ type: 'Lit', val: n.val.slice(1) }) };
        }
        consume();
        const right = power(primary());
        if (!right) {
            report('trailing **');
            return n;
        }
        return { type: 'Bin', val: '**', left: n, right };
    }

    function parse(min = 0) {
        let n = primary();
        if (!n) return null;
        const product = n.type === 'Lit' || n.type === 'Var' && n.val === 'PI';
        n = power(n);
        while (isFactor(peek()) && (product || peek().value === 'π')) {
            n = { type: 'Bin', val: '*', left: n, right: power(primary()) };
        }
        while (peek()) {
            const op = peek().value;
            const p = PREC[op];
            if (!p || p < min) break;
            consume();
            const right = parse(p + 1);
            if (!right) {
                report(`trailing ${op}`);
                break;
            }
            n = { type: 'Bin', val: op, left: n, right };
        }
        return n;
    }

    function color(t) {
        if (!COLOR_CALL.test(t.value)) return null;
        let end = pos, depth = 0;
        while (end < tokens.length && (tokens[end].value === '(' ? ++depth : tokens[end].value !== ')' || --depth)) end++;
        const v = end < tokens.length && unknown?.(source.slice(t.index, tokens[end].index + 1));
        if (!v) return null;
        pos = end + 1;
        return { type: 'Call', val: `vec${v.length}`, args: v.map(c => ({ type: 'Lit', val: String(c) })) };
    }

    function call(name) {
        name = CALLS[name] || name;
        consume();
        const args = [];
        let comma = true, at = false;
        while (peek() && peek().value !== ')') {
            const arg = parse();
            // in gradient() a stop's position follows its value after a space: #f80 .5
            if (name === 'gradient' && !comma && args.length > 1) {
                if (args[args.length - 1].type === 'Stop') report('extra position');
                else args.push({ type: 'Stop', left: args.pop(), right: arg });
            } else if (at && !comma) {
                let last = args.pop(), { items = [last] } = last;
                items.push(arg);
                args.push({ type: 'Call', val: 'vec' + items.length, args: items, items });
            } else {
                args.push(arg);
            }
            comma = peek()?.value === ',';
            // pick(k: a, b, …): a colon ends the index; match(t: v, …): a colon ends a test
            if (name === 'pick' && args.length === 1 && peek()?.value === ':') comma = at = true;
            if (name === 'match' && args.length % 2 && peek()?.value === ':') comma = true;
            if (comma) consume();
            else if (!isValue(peek())) stray(')');
        }
        consume();
        if (name === 'rand' && !args.length && rand) return { type: 'Var', val: rand() };
        if (name === 'pow' && args.length === 2) return { type: 'Bin', val: '**', left: args[0], right: args[1], group: true };
        return { type: 'Call', val: name, args, at };
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
            if (n.val === '+') return gen(n.right, exp);
            const type = infer(n);
            let right = gen(n.right, type);
            if (right[0] === '-') right = ' ' + right;
            return cast(n.val === '!' && type.startsWith('bvec') ? `not(${right})` : n.val + right, type, exp);
        }
        if (n.type === 'Call') {
            const a = n.args;
            if (n.val === 'match') {
                const res = infer(n), type = isVector(res) ? res : exp;
                let out = gen(a.length % 2 ? a[a.length - 1] : ZERO, type);
                for (let i = a.length - 2 - a.length % 2; i >= 0; i -= 2) {
                    out = `(${gen(a[i], 'bool')} ? ${gen(a[i + 1], type)} : ${out})`;
                }
                return cast(out, type, exp);
            }
            const res = infer(n);
            if (n.at) {
                // pick(k: a, b, …): item k from 1, wrapping around
                if (a.length < 2) return gen(ZERO, exp);
                const items = a.slice(1).map(v => gen(v, res));
                const out = items.length > 1 ? `${res}[](${items.join(', ')})[g_pick(${gen(a[0], 'float')}, ${items.length})]` : items[0];
                return cast(out, res, exp);
            }
            if (n.val === 'gradient') return cast(gradient(a, res), res, exp);
            let args = a.map(v => gen(v, res[0] === 'b' ? null : 'float'));
            if (POINTS.has(n.val) && a.length > 1 && !isVector(infer(a[0]))) {
                args = args.flatMap((v, i) => i % 2 ? [] : i + 1 < args.length ? `vec2(${v}, ${args[i + 1]})` : v);
            }
            args = args.join(', ');
            if (n.val === 'float' && a.length === 1 && !isVector(infer(a[0]))) return cast(args, 'float', exp);
            return cast(`${n.val}(${args})`, res, exp);
        }

        const op = n.val;

        // a < b < c reads as a < b && b < c
        if (RELATIONAL_OPS.has(op) && n.left.type === 'Bin' && !n.left.group && RELATIONAL_OPS.has(n.left.val)) {
            const second = { type: 'Bin', val: op, left: n.left.right, right: n.right };
            return cast(`(${gen(n.left, 'bool')} && ${gen(second, 'bool')})`, 'bool', exp);
        }

        const res = infer(n);
        if (op === '**') {
            const arg = isVector(res) ? res : 'float';
            const l = gen(n.left, arg);
            const k = n.right.type === 'Lit' ? Number(n.right.val) : NaN;
            const whole = Number.isInteger(k);
            const signed = n.left.type !== 'Lit' || n.left.val[0] === '-';
            const power = `pow(${!signed ? l : whole ? `abs(${l})` : `max(${l}, 0.0)`}, ${gen(n.right, arg)})`;
            return cast(whole && k > 1 && k < 5 && l.length * k < 200 ? `(${Array(k).fill(l).join(' * ')})`
                : signed && whole && k % 2 ? `(sign(${l}) * ${power})` : power, res, exp);
        }
        const lt = infer(n.left), rt = infer(n.right);
        const vec = VEC_COMPARE[op] && (/^vec/.test(lt) ? lt : /^vec/.test(rt) ? rt : '');
        const arg = vec || (VEC_COMPARE[op] || isVector(res) ? 'float' : res);
        const l = gen(n.left, arg);
        const r = gen(n.right, arg);
        if (vec) return cast(`${op === '!=' ? 'any' : 'all'}(${VEC_COMPARE[op]}(${l}, ${r}))`, 'bool', exp);
        return cast(op === '%' ? `(${l} - ${r} * trunc(${l} / ${r}))` : `(${l} ${op} ${r})`, res, exp);
    }

    function gradient([t, ...stops], type) {
        if (!stops.length) return gen(ZERO, type);
        const at = fillStops(stops.map(s => {
            if (s.type !== 'Stop') return NaN;
            if (s.right.type !== 'Lit') report('gradient needs numbers');
            return +s.right.val;
        }));
        const n = at.length - 1;
        const v = gen(t, 'float');
        const lab = n > 0 && /^vec[34]$/.test(type);
        const stop = i => lab ? `g_lab(${gen(valueOf(stops[i]), type)})` : gen(valueOf(stops[i]), type);
        let out = stop(0);
        for (let i = 1; i <= n; i++) {
            const a = float(at[i - 1]), b = float(at[i]);
            out = glsl`mix(${out}, ${stop(i)}, g_seg(${v}, ${a}, ${b}))`;
        }
        return lab ? `g_rgb(${out})` : out;
    }

    // the GLSL type of a node, computed once
    function infer(n) {
        return n ? n.t || (n.t = inferType(n)) : 'float';
    }
    function inferType(n) {
        if (n.type === 'Lit') return 'float';
        if (n.type === 'Var') {
            if (n.val === 'true' || n.val === 'false') return 'bool';
            return types[n.val] || 'float';
        }
        if (n.type === 'Member') return swizzle(n.val);
        if (n.type === 'Pre') {
            if (n.val === '~') return 'int';
            const right = infer(n.right);
            if (n.val === '!') return right.startsWith('bvec') ? right : 'bool';
            return n.val === '-' && right === 'bool' ? 'float' : right;
        }
        if (n.type === 'Call') {
            const known = CALL_TYPES[n.val];
            if (known === 'bvec') return infer(n.args[0]).replace(/^vec/, 'bvec').replace('float', 'bool');
            if (known) return known;
            if (/^(b?vec[234]|mat[234]|float|int|bool)$/.test(n.val)) return n.val;
            if (n.val === 'match') return widest(n.args.filter((_, i) => i % 2 || i === n.args.length - 1).map(infer));
            if (n.at) return widest(n.args.slice(1).map(infer));
            if (n.val === 'gradient') return widest(n.args.slice(1).map(a => infer(valueOf(a))), true);
            return widest(n.args.map(infer), true);
        }
        if (VEC_COMPARE[n.val] || n.val === '&&' || n.val === '||') return 'bool';
        if (INT_OPS.has(n.val)) return 'int';
        return widest([infer(n.left), infer(n.right)], true);
    }

    function widest(values, number) {
        const res = values.reduce((a, b) => RANK.indexOf(b) > RANK.indexOf(a) ? b : a, values[0] || 'float');
        return number && !isVector(res) ? 'float' : res;
    }

    const tree = parse();
    stray();
    return { type: infer(tree), code: exp => gen(tree, exp) };
}
