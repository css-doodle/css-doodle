import { isInvalidNumber, removeParens } from '../lib/type.js';
import { tidyNumber } from '../lib/math.js';
import { scan, NAME_CHAR } from '../parser/tokenizer.js';
import parseCompoundValue from '../parser/parse-compound-value.js';

const MATH = Object.create(null);
for (let name of Object.getOwnPropertyNames(Math)) {
    MATH[name] = Math[name];
}
const EPS = 1e-9;
MATH.sign = x => Math.abs(x) < EPS ? 0 : Math.sign(x);
MATH.mod = (a, b) => a - b * Math.floor(a / b);
MATH.fract = x => x - Math.floor(x);
MATH.clamp = (x, lo, hi) => Math.min(Math.max(x, lo), hi);
MATH.mix = (a, b, t) => a + (b - a) * t;
MATH.step = (edge, x) => x < edge - EPS ? 0 : 1;
MATH.smoothstep = (e0, e1, x) => {
    let t = MATH.clamp((x - e0) / (e1 - e0), 0, 1);
    return t * t * (3 - 2 * t);
};
MATH.radians = d => d * Math.PI / 180;
MATH.degrees = r => r * 180 / Math.PI;
MATH.atan = (y, x) => x === undefined ? Math.atan(y) : Math.atan2(y, x);

export function pickIndex(k, n) {
    return ((Math.round(k) - 1) % n + n) % n;
}

let draw = Math.random;

export function useRandom(fn) {
    let prev = draw;
    draw = fn;
    return prev;
}

export const defaultContext = {
    __proto__: MATH,

    'π': Math.PI,
    random: () => draw(),
    gcd(a, b) {
        while (b) [a, b] = [b, a % b];
        return Math.abs(a);
    },
    match(...args) {
        for (let i = 0; i + 1 < args.length; i += 2) {
            if (args[i]) return args[i + 1];
        }
        return args.length % 2 ? args.at(-1) : 0;
    }
};

const live = v => typeof v === 'string';
const text = v => live(v) ? v : tidyNumber(+v || 0);
const neg = v => live(v) ? `(${v} * -1)` : -v;
const not = v => `(1 - ${v})`;
const truthy = v => `abs(sign(${v}))`;
const gt = (a, b) => `max(0,sign(${a} - ${b}))`;
const angle = (name, args) => `(${name}(${args}) / 1rad)`;

const LOWER = {
    __proto__: null,
    '%': (a, b) => `rem(${a},${b})`,
    '^': (a, b) => `pow(${a},${b})`,
    '>': gt,
    '<': (a, b) => gt(b, a),
    '>=': (a, b) => not(gt(b, a)),
    '<=': (a, b) => not(gt(a, b)),
    '==': (a, b) => not(truthy(a + ' - ' + b)),
    '!=': (a, b) => truthy(a + ' - ' + b),
    round: a => `round(${a},1)`,
    floor: a => `round(down,${a},1)`,
    ceil: a => `round(up,${a},1)`,
    trunc: a => `round(to-zero,${a},1)`,
    fract: a => `mod(${a},1)`,
    clamp: (x, lo, hi) => `clamp(${lo},${x},${hi})`,
    mix: (a, b, t) => `(${a} + (${b} - ${a}) * ${t})`,
    step: (edge, x) => not(gt(edge, x)),
    smoothstep: (e0, e1, x) => {
        let t = `clamp(0,(${x} - ${e0}) / (${e1} - ${e0}),1)`;
        return `(${t} * ${t} * (3 - 2 * ${t}))`;
    },
    radians: d => `(${d} * pi / 180)`,
    degrees: r => `(${r} * 180 / pi)`,
    atan: (...args) => angle(args.length > 1 ? 'atan2' : 'atan', args),
};
for (let sym of '+-*/') {
    LOWER[sym] = (a, b) => `(${a} ${sym} ${b})`;
}
for (let name of 'sin cos tan sqrt exp log abs sign pow hypot min max mod'.split(' ')) {
    LOWER[name] = (...args) => `${name}(${args})`;
}
for (let name of 'asin acos atan2'.split(' ')) {
    LOWER[name] = (...args) => angle(name, args);
}

function lower(name, args, history, fn) {
    let to = LOWER[name];
    return to && fn === defaultContext[name] ? to(...args.map(text)) : miss(history);
}

export const operators = {
    __proto__: null,

    '!': 10,
    '^': 9, '**': 9,
    '*': 8, '/': 8, '÷': 8, '%': 8,
    '+': 7, '-': 7,
    '<<': 6, '>>': 6,
    '&': 5,
    '|': 4,
    '<': 3, '>': 3,
    '=': 3, '==': 3,
    '≤': 3, '<=': 3,
    '≥': 3, '>=': 3,
    '≠': 3, '!=': 3,
    '∧': 2, '&&': 2,
    '∨': 1, '||': 1,
    '(': 0, ')': 0,
};

const PREC = { __proto__: operators, '-u': 8.5, '·': 8.75 };

// spellings that share an implementation
const spelling = {
    __proto__: null,
    '**': '^', '÷': '/', '=': '==', '≤': '<=', '≥': '>=', '≠': '!=', '∧': '&&', '∨': '||',
};

export const binary = {
    __proto__: null,

    '+': (a, b) => a + b,
    '-': (a, b) => a - b,
    '*': (a, b) => a * b,
    '%': (a, b) => a % b,
    '|': (a, b) => a | b,
    '&': (a, b) => a & b,
    '<': (a, b) => a < b - EPS,
    '>': (a, b) => a > b + EPS,
    '^': (a, b) => a ** b,
    '/': (a, b) => a / b,
    '==': (a, b) => a === b || Math.abs(a - b) < EPS ? 1 : 0,
    '<=': (a, b) => a <= b + EPS,
    '>=': (a, b) => a >= b - EPS,
    '!=': (a, b) => a === b || Math.abs(a - b) < EPS ? 0 : 1,
    '<<': (a, b) => a << b,
    '>>': (a, b) => a >> b,
};

// infix token types
const VALUE = 'value';
const OPERATOR = 'operator';
const COMMA = 'comma';
// postfix node types, values split into these
const NUMBER = 'number';
const VARIABLE = 'variable';
const FUNCTION = 'function';

const RE_NUMBER = /^([+-]?(\d+(?:\.\d*)?|\.\d+)(e[+-]?\d+)?|0x[\da-f]+)$/i;

function tk(type, value) {
    return { type, value };
}

function op(value) {
    return tk(OPERATOR, spelling[value] || value);
}

function isOperator(value) {
    return value in operators;
}

function isUnary(prev) {
    return !prev || prev.type === COMMA || (prev.type === OPERATOR && prev.value !== ')');
}

// Push a value, resolving adjacency with the previous token:
// "2x" → 2*x, "2sin(1)" → 2*sin(1); after a space there is no
// product, so "2 x" leaves two values and reads as 2
const ANGLES = { deg: String(Math.PI / 180), turn: String(2 * Math.PI) };
const ANGLE_TAKERS = new Set(['sin', 'cos', 'tan', 'degrees']);

function pushValue(tokens, value, spaced) {
    const prev = tokens.at(-1);
    if (!spaced && prev && (prev.type === VALUE || prev.value === ')')) {
        tokens.push(tk(OPERATOR, '·'));
    }
    tokens.push(tk(VALUE, value));
}

// Rewrite scanner tokens into calc tokens: values (numbers and names),
// operators and commas. `spans` maps the source index of a dashed name
// the context defines to that name, so its tokens collapse into one word
function transformTokens(input, spans) {
    const raw = [];
    let end = 0, spaced = false;
    for (const token of scan(input)) {
        if (token.type === 'Space') spaced = true;
        if (token.type === 'Space' || token.index < end) continue;
        const name = spans && spans.get(token.index);
        if (name) {
            end = token.index + name.length;
            raw.push({ type: 'Word', value: name, index: token.index, spaced });
        } else {
            token.spaced = spaced;
            raw.push(token);
        }
        spaced = false;
    }

    const tokens = [], calls = [];

    for (let i = 0; i < raw.length; i++) {
        const { type, value, index, spaced } = raw[i];
        const next = raw[i + 1];
        if (value === '(') calls.push(raw[i - 1]?.type === 'Word' && !spaced && raw[i - 1].value);
        else if (value === ')') calls.pop();

        if (type === 'Number') {
            let number = value;
            if (number[0] === '-') {
                tokens.push(tk(OPERATOR, isUnary(tokens.at(-1)) ? '-u' : '-'));
                number = number.slice(1);
            }
            pushValue(tokens, number, spaced);
            continue;
        }

        if (type === 'Word') {
            if (ANGLES[value] && raw[i - 1]?.type === 'Number' && !spaced && calls.some(Boolean)) {
                if (!calls.some(name => ANGLE_TAKERS.has(name))) tokens.angle = true;
                pushValue(tokens, ANGLES[value], false);
                continue;
            }
            // ÷ ∧ ∨ are not scanner symbols, so they arrive as words
            if (isOperator(value)) {
                tokens.push(op(value));
                continue;
            }
            // var(…) is live, kept as CSS text; calc(…) reads as a group
            if ((value === 'var' || value === 'calc') && next && next.value === '(') {
                let depth = 0;
                let j = i + 1;
                for (; j < raw.length; j++) {
                    if (raw[j].value === '(') depth++;
                    else if (raw[j].value === ')' && !--depth) break;
                }
                let css = input.slice(value === 'var' ? index : next.index, raw[j] && raw[j].index + 1);
                pushValue(tokens, css, spaced);
                tokens.at(-1).live = true;
                i = j;
                continue;
            }
            // "x1" is one name, not x*1
            if (next && next.type === 'Number' && next.index === index + value.length) {
                pushValue(tokens, value + next.value, spaced);
                i++;
            } else {
                pushValue(tokens, value, spaced);
            }
            continue;
        }

        // the colon of pick(k: a, b, …) separates as a comma does
        if (value === ',' || value === ':') {
            tokens.push(tk(COMMA, value));
            continue;
        }

        if (value === '%' && !spaced && raw[i - 1]?.type === 'Number'
                && !(next && (next.type === 'Number' ? next.value[0] !== '-'
                    : next.type === 'Word' ? !isOperator(next.value)
                    : next.value === '(' || next.value === 'π'))) {
            continue;
        }

        if (next && next.type === 'Symbol' && isOperator(value + next.value)) {
            tokens.push(op(value + next.value));
            i++;
            continue;
        }

        if (value === '+' || value === '-') {
            if (isUnary(tokens.at(-1))) {
                // a run of unary signs is one prefix operator
                let negative = value === '-';
                while (raw[i + 1] && (raw[i + 1].value === '+' || raw[i + 1].value === '-')) {
                    if (raw[++i].value === '-') negative = !negative;
                }
                if (negative) tokens.push(tk(OPERATOR, '-u'));
                continue;
            }
        }

        if (value === '(') {
            // "2(3+4)" → "2*(3+4)", "(1+2)(3+4)" → "(1+2)*(3+4)", but not "fn("
            const prev = tokens.at(-1);
            if (prev && !spaced && (prev.value === ')' || (prev.type === VALUE && RE_NUMBER.test(prev.value)))) {
                tokens.push(tk(OPERATOR, '·'));
            }
        }

        if (isOperator(value)) {
            tokens.push(op(value));
        } else {
            // π, and stray symbols that read as misses
            pushValue(tokens, value, spaced);
        }
    }

    return tokens;
}

// Convert infix tokens to postfix (RPN)
function toPostfix(tokens) {
    const opStack = [];
    const expr = [];
    const pop = () => {
        const top = opStack.pop();
        expr.push(tk(OPERATOR, top === '·' ? '*' : top));
    };

    for (let i = 0; i < tokens.length; i++) {
        const { type, value } = tokens[i];

        if (type === VALUE) {
            const next = tokens[i + 1];
            if (tokens[i].live) {
                expr.push(tk(NUMBER, value));
            } else if (RE_NUMBER.test(value)) {
                expr.push(tk(NUMBER, Number(value)));
            } else if (next && next.value === '(') {
                const { args, endIndex, at } = parseFunctionArgs(tokens, i + 1, value === 'pick');
                expr.push({ type: FUNCTION, name: value, value: args, at });
                i = endIndex;
            } else {
                expr.push(tk(VARIABLE, value));
            }
        } else if (type === OPERATOR) {
            if (value === '(') {
                opStack.push(value);
            } else if (value === ')') {
                while (opStack.length && opStack.at(-1) !== '(') {
                    pop();
                }
                opStack.pop();
            } else if (value === '!' || value === '-u') {
                opStack.push(value);
            } else {
                const prev = tokens[i - 1], next = tokens[i + 1];
                if (!prev || prev.type === OPERATOR && prev.value !== ')') expr.push(tk(NUMBER, 0));
                const prec = PREC[value];
                // && and || nest to the right so a chain lowers to CSS
                // text that grows with its length, not exponentially
                const rightAssoc = ['^', '&&', '||'].includes(value);
                while (opStack.length) {
                    const topPrec = PREC[opStack.at(-1)];
                    if (rightAssoc ? topPrec > prec : topPrec >= prec) {
                        pop();
                    } else {
                        break;
                    }
                }
                opStack.push(value);
                if (!next || next.value === ')') expr.push(tk(NUMBER, 0));
            }
        }
    }

    while (opStack.length) {
        pop();
    }

    return expr;
}

// Split the token stream of "(a, b, …)" into per-argument postfix lists;
// in pick(k: a, b, …) the index ends at the colon
function parseFunctionArgs(tokens, startIndex, indexed) {
    const args = [];
    let current = [];
    let depth = 1;
    let at = false;

    let i = startIndex + 1;
    for (; i < tokens.length; i++) {
        const token = tokens[i];
        const { value } = token;

        if (value === '(') {
            depth++;
            current.push(token);
        } else if (value === ')') {
            depth--;
            if (depth === 0) {
                if (current.length) {
                    args.push(toPostfix(current));
                }
                break;
            }
            current.push(token);
        } else if (depth === 1 && (value === ',' || value === ':' && indexed && !at && !args.length)) {
            at ||= value === ':';
            if (current.length || value === ':') {
                args.push(toPostfix(current));
            }
            current = [];
        } else {
            current.push(token);
        }
    }

    return { args, endIndex: i, at };
}

function miss(history) {
    history.misses = (history.misses || 0) + 1;
    return 0;
}

function readDimension(value, ctx) {
    const { value: num, unit } = parseCompoundValue(String(value));
    if (!isInvalidNumber(num) && unit !== undefined && ctx[unit] === undefined) {
        return num;
    }
}

function evaluateValue(value, ctx, history) {
    const plain = toPlainNumber(value);
    if (plain !== null) {
        return plain;
    }
    const num = readDimension(value, ctx);
    if (num !== undefined) {
        return num;
    }
    // history holds the values being expanded; one already there refers to itself
    if (history.length > 50 || history.includes(value)) {
        return 0;
    }
    history.push(value);
    const result = compileInput(value, ctx)(ctx, history);
    history.pop();
    return result;
}

// A name reads from the context
function compileVariable(name) {
    return (ctx, history) => {
        let result = ctx[name];
        if (typeof result === 'number' && !Number.isNaN(result)) {
            return result;
        }
        if (isInvalidNumber(result)) {
            return miss(history);
        }
        if (typeof result === 'function') {
            // only a function that takes no arguments reads bare
            result = result.length ? miss(history) : result();
        }
        return typeof result === 'number' ? result : evaluateValue(result, ctx, history);
    };
}

function compileFunction(node) {
    const name = node.name;
    const chain = name.split('.');
    const argFns = node.value.map(compile);

    // match(t1, v1, t2, v2, …, else) evaluates only the taken branch,
    // unless a context value shadows the built-in
    if (name === 'match' && argFns.length >= 2) {
        const choose = (i, ctx, history) => {
            if (i + 1 >= argFns.length) return i < argFns.length ? argFns[i](ctx, history) : 0;
            const cond = argFns[i](ctx, history);
            // a live condition takes both branches, weighted by its truthiness
            return live(cond)
                ? `(${text(argFns[i + 1](ctx, history))} * ${truthy(cond)} + ${text(choose(i + 2, ctx, history))} * ${not(truthy(cond))})`
                : cond ? argFns[i + 1](ctx, history) : choose(i + 2, ctx, history);
        };
        return (ctx, history) => {
            const fn = ctx[name];
            if (fn === defaultContext.match) {
                return choose(0, ctx, history);
            }
            return typeof fn === 'function' ? fn(...argFns.map(f => f(ctx, history))) : miss(history);
        };
    }

    if (node.at) {
        const items = argFns.slice(1);
        const n = items.length;
        return (ctx, history) => {
            const k = argFns[0](ctx, history);
            if (n && live(k)) {
                const at = `mod(round(${k},1) - 1,${n})`;
                return `(${items.map((f, j) => `${text(f(ctx, history))} * ${not(truthy(`${at} - ${j}`))}`).join(' + ')})`;
            }
            return n && Number.isFinite(+k) ? items[pickIndex(+k, n)](ctx, history) : 0;
        };
    }

    if (chain.length === 1) {
        const [a, b] = argFns;
        if (argFns.length === 1) {
            return (ctx, history) => {
                const fn = ctx[name];
                if (typeof fn !== 'function') return miss(history);
                const x = a(ctx, history);
                return live(x) ? lower(name, [x], history, fn) : fn(x);
            };
        }
        if (argFns.length === 2) {
            return (ctx, history) => {
                const fn = ctx[name];
                if (typeof fn !== 'function') return miss(history);
                const x = a(ctx, history);
                const y = b(ctx, history);
                return live(x) || live(y) ? lower(name, [x, y], history, fn) : fn(x, y);
            };
        }
        return (ctx, history) => {
            const fn = ctx[name];
            if (typeof fn !== 'function') return miss(history);
            const args = argFns.map(f => f(ctx, history));
            return args.some(live) ? lower(name, args, history, fn) : fn(...args);
        };
    }

    // "sqrt.abs(x)" applies right to left
    return (ctx, history) => {
        let output = argFns.map(f => f(ctx, history));
        for (let i = chain.length - 1; i >= 0; i--) {
            if (!chain[i]) break;
            const fn = ctx[chain[i]];
            if (typeof fn !== 'function') {
                output = miss(history);
                continue;
            }
            const args = [].concat(output);
            output = args.some(live) ? lower(chain[i], args, history, fn) : fn(...args);
        }
        return output;
    };
}

// Compile a postfix expression into a closure of (context, history)
function compile(expr) {
    const stack = [];

    for (let i = 0; i < expr.length; i++) {
        const node = expr[i];
        const { type, value } = node;

        if (type === NUMBER) {
            // a live value is kept as CSS text only where CSS math is wanted
            stack.push(live(value) ? (ctx, history) => history.css ? value : miss(history) : () => value);
        } else if (type === VARIABLE) {
            stack.push(compileVariable(value));
        } else if (type === FUNCTION) {
            stack.push(compileFunction(node));
        } else if (value === '!' || value === '-u') {
            const operand = stack.pop() || (() => NaN);
            stack.push(value === '-u'
                ? (ctx, history) => neg(operand(ctx, history))
                : (ctx, history) => {
                    const a = operand(ctx, history);
                    return live(a) ? not(truthy(a)) : Number(a) ? 0 : 1;
                });
        } else {
            const right = stack.pop();
            const left = stack.pop();
            const l = left || (() => NaN);
            const r = right || (() => NaN);
            if (value === '&&') {
                // short-circuit: the right side only runs when needed. A live
                // a writes out both sides; a falsy a is 0, so it isn't repeated
                stack.push((ctx, history) => {
                    const a = l(ctx, history);
                    return live(a) ? `(${truthy(a)} * ${text(r(ctx, history))})` : +a && r(ctx, history);
                });
            } else if (value === '||') {
                stack.push((ctx, history) => {
                    const a = l(ctx, history);
                    return live(a) ? `(${a} + ${not(truthy(a))} * ${text(r(ctx, history))})` : +a || r(ctx, history);
                });
            } else {
                const op = binary[value] || (() => 0);
                stack.push((ctx, history) => {
                    const a = l(ctx, history);
                    const b = r(ctx, history);
                    return live(a) || live(b) ? lower(value, [a, b], history) : op(Number(a), Number(b));
                });
            }
        }
    }

    const root = stack[0] || (() => 0);
    // a value left over, as in "10px solid red", makes a list, not a number
    if (stack.length > 1) return (ctx, history) => (miss(history), Number(root(ctx, history)) || 0);
    return (ctx, history) => {
        const output = root(ctx, history);
        return live(output) ? output : Number(output) || 0;
    };
}

const RE_DASHED = /(^|[^\p{L}_])([\p{L}_][\p{L}\p{N}_]*(?:-[\p{L}\p{N}_]+)+)/gu;

// Every dashed name in the input with the names it could be read as,
// longest first: "a-b-c" → a-b-c, a-b
function dashedCandidates(input) {
    let candidates = null;
    for (let m of input.matchAll(RE_DASHED)) {
        let name = m[2];
        let names = [name];
        for (let k = name.lastIndexOf('-'); k > name.indexOf('-'); k = name.lastIndexOf('-', k - 1)) {
            names.push(name.slice(0, k));
        }
        (candidates ??= []).push({ index: m.index + m[1].length, names });
    }
    return candidates;
}

function compileWith(input, spans) {
    const tokens = transformTokens(input, spans);
    const compiled = compile(toPostfix(tokens));
    compiled.angle = tokens.angle === true;
    return compiled;
}

const compiledCache = new Map();

function compileInput(input, ctx) {
    input = String(input);
    let entry = compiledCache.get(input);
    if (entry === undefined) {
        if (compiledCache.size >= 512) {
            compiledCache.clear();
        }
        let candidates = dashedCandidates(input);
        entry = candidates ? { candidates, variants: new Map() } : compileWith(input, null);
        compiledCache.set(input, entry);
    }
    if (typeof entry === 'function') {
        return entry;
    }
    // the dashed names this context defines select the variant
    let key = '';
    for (let { names } of entry.candidates) {
        key += (names.find(name => ctx[name] !== undefined) || '') + ',';
    }
    let compiled = entry.variants.get(key);
    if (compiled === undefined) {
        let chosen = key.split(',');
        let spans = null;
        entry.candidates.forEach(({ index }, i) => {
            if (chosen[i]) {
                (spans ??= new Map()).set(index, chosen[i]);
            }
        });
        compiled = compileWith(input, spans);
        entry.variants.set(key, compiled);
    }
    return compiled;
}

const RE_NAME = new RegExp(`^(?![\\d-])${NAME_CHAR}+$`);

// A $ expression that is just the name of a variable acts as a
// generation-time var(): values that read as math evaluate once, here,
// anything else — colors, transforms, dimensioned literals — passes
// through verbatim. Returns undefined when the numeric path applies.
export function deref(input, context) {
    let name = String(input).trim();
    if (!RE_NAME.test(name)) return;
    // only user variables count, not the built-ins behind them
    const own = key => Object.hasOwn(context, key) ? context[key] : undefined;
    let value = own(name);
    // Follow single-name chains: --a: b; --b: tomato
    for (let i = 0; typeof value === 'string' && i < 50; i++) {
        let next = value.trim();
        if (!RE_NAME.test(next) || next === name) break;
        let found = own(next);
        if (found === undefined) break;
        name = next;
        value = found;
    }
    if (value === undefined || typeof value === 'number') return;
    value = String(value).trim();
    const plain = toPlainNumber(value);
    if (plain !== null) {
        return plain;
    }
    const vars = Object.assign(Object.create(defaultContext), context);
    if (readDimension(value, vars) !== undefined) {
        return value;
    }
    const compiled = compileInput(value, vars);
    if (compiled.angle) return value;
    const history = [value];
    const result = compiled(vars, history);
    return history.misses ? value : result;
}

const RE_SAFE_AFTER = /^[),+\-*/%^!<>=&|≤≥≠]/;
const RE_OPERATOR_TAIL = /[(,*/%^!<>=&|≤≥≠]$/;
const RE_VALUE_TAIL = /[0-9]$/;

export function toPlainNumber(v) {
    if (typeof v === 'number') {
        return Number.isFinite(v) ? v : null;
    }
    if (typeof v === 'string') {
        let t = v.trim();
        if (t && RE_NUMBER.test(t)) return Number(t);
    }
    return null;
}

export function isSignLeading(v) {
    if (typeof v === 'number') {
        return v < 0;
    }
    return /^[+-]/.test(String(v).trim());
}

export function operand(v, after) {
    return isSignLeading(v) && /^\s*(\^|\*\*)/.test(after) ? `(${v})` : v;
}

export function compileTemplate(segments) {
    let n = segments.length - 1;
    if (n < 1 || n > 26) return null;
    for (let s of segments) {
        if (s.includes('·')) return null;
    }
    if (RE_NAME.test(segments.join('0').trim())) return null;
    let despaced = segments.map(s => s.replace(/\s+/g, ''));
    let names = [];
    let signSensitive = [];
    let template = segments[0];
    for (let i = 0; i < n; i++) {
        let before = despaced[i];
        let after = despaced[i + 1];
        if (after === '' ? i < n - 1 : !RE_SAFE_AFTER.test(after)) return null;
        if (/%$/.test(segments[i]) || segments[i + 1][0] === '%') return null;
        let sensitive = false;
        if (before === '') {
            if (i > 0) return null;
        } else {
            let run = before.match(/[+-]*$/)[0].length;
            if (run >= 2) {
                return null;
            }
            if (run === 1) {
                if (/[0-9.][eE][+-]$/.test(before)) return null;
                sensitive = true;
            } else if (before.endsWith(')')) {
                sensitive = true;
            } else if (RE_VALUE_TAIL.test(before)) {
                if (!/\s$/.test(segments[i])) return null;
                sensitive = true;
            } else if (!RE_OPERATOR_TAIL.test(before)) {
                return null;
            }
        }
        signSensitive.push(sensitive);
        let name = '·' + String.fromCharCode(97 + i);
        names.push(name);
        template += name + segments[i + 1];
    }
    return { template, names, signSensitive };
}

function scope(context) {
    return context && Object.prototype.isPrototypeOf.call(defaultContext, context)
        ? context
        : Object.assign(Object.create(defaultContext), context);
}

export function evaluate(value, context) {
    return evaluateValue(value, scope(context), []);
}

const RE_CALC_HEAD = /^calc\(/;

// A unit after lowered math multiplies in: calc(…) + deg → calc((…) * 1deg)
export function withUnit(value, unit) {
    return unit && RE_CALC_HEAD.test(value) ? `calc(${value.slice(4)} * 1${unit})` : value + unit;
}

// A number; with `css`, CSS math for an expression that reads a live
// value, which otherwise counts as a miss
export default function(input, context, css) {
    if (typeof input === 'number' && Number.isFinite(input)) {
        return input;
    }
    context = scope(context);
    const history = [];
    history.css = css;
    const output = compileInput(input, context)(context, history);
    // the outermost group is the calc() itself
    return live(output) ? `calc(${removeParens(output)})` : output;
}
