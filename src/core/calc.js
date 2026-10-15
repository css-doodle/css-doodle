import { isInvalidNumber, removeParens } from '../lib/type.js';
import { last } from '../lib/list.js';
import { tidyNumber } from '../lib/math.js';
import { scan } from '../parser/tokenizer.js';
import parseCompoundValue from '../parser/parse-compound-value.js';

const MATH = Object.create(null);
for (let name of Object.getOwnPropertyNames(Math)) {
    MATH[name] = Math[name];
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
        return a;
    },
    match(c, a, b) {
        return c ? a : b
    }
};

// A live value is CSS text: a var() such as time or the pointer, or a
// calc() already lowered. It has no number at generation time, so the
// math around it lowers to CSS math for the browser to evaluate
const live = v => typeof v === 'string';
const text = v => live(v) ? v : tidyNumber(+v || 0);
const neg = v => live(v) ? `(${v} * -1)` : -v;
const not = v => `(1 - ${v})`;
// 0 or 1 for a value's truthiness
const truthy = v => `abs(sign(${v}))`;
const gt = (a, b) => `max(0,sign(${a} - ${b}))`;

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
};
for (let sym of '+-*/') {
    LOWER[sym] = (a, b) => `(${a} ${sym} ${b})`;
}
for (let name of 'sin cos tan asin acos atan atan2 sqrt exp log abs sign pow hypot min max'.split(' ')) {
    LOWER[name] = (...args) => `${name}(${args})`;
}

// Operators, and the built-in Math functions the context doesn't
// shadow, lower by name; the rest have no CSS form and miss
function lower(name, args, history, fn) {
    let to = LOWER[name];
    return to && fn === MATH[name] ? to(...args.map(text)) : miss(history);
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
    '<': (a, b) => a < b,
    '>': (a, b) => a > b,
    '^': (a, b) => a ** b,
    '/': (a, b) => a / b,
    '==': (a, b) => a === b ? 1 : 0,
    '<=': (a, b) => a <= b,
    '>=': (a, b) => a >= b,
    '!=': (a, b) => a !== b ? 1 : 0,
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

const RE_NUMBER = /^([+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?|0x[\da-f]+)$/i;
const RE_NEGATIVE_VAR = /^-\D/;

function tk(type, value) {
    return { type, value };
}

function op(value) {
    return tk(OPERATOR, spelling[value] || value);
}

function isOperator(value) {
    return value in operators;
}

// Push a value, resolving adjacency with the previous token:
// "2x" → 2*x, "2sin(1)" → 2*sin(1), "k -1" → k-1; after a space
// there is no product, so "2 x" leaves two values and reads as 2
function pushValue(tokens, value, spaced) {
    const prev = last(tokens);
    if (prev && (prev.type === VALUE || prev.value === ')')) {
        if (value[0] === '-') {
            tokens.push(tk(OPERATOR, '-'));
            value = value.slice(1);
        } else if (!spaced) {
            tokens.push(tk(OPERATOR, '*'));
        }
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

    const tokens = [];
    // a unary sign waiting for the number or name it applies to
    let sign = '';

    for (let i = 0; i < raw.length; i++) {
        const { type, value, index, spaced } = raw[i];
        const next = raw[i + 1];

        if (type === 'Number') {
            pushValue(tokens, sign && value[0] === '-' ? value.slice(1) : sign + value, spaced);
            sign = '';
            continue;
        }

        if (type === 'Word') {
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
                pushValue(tokens, sign ? neg(css) : css, spaced);
                last(tokens).live = true;
                sign = '';
                i = j;
                continue;
            }
            // "x1" is one name, not x*1
            if (next && next.type === 'Number' && next.index === index + value.length) {
                pushValue(tokens, sign + value + next.value, spaced);
                i++;
            } else {
                pushValue(tokens, sign + value, spaced);
            }
            sign = '';
            continue;
        }

        if (value === ',') {
            tokens.push(tk(COMMA, value));
            continue;
        }

        if (value === '%' && !spaced && raw[i - 1]?.type === 'Number'
                && !(next && (next.type === 'Number' ? !/^[+-]/.test(next.value)
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
            const prev = last(tokens);
            if (!prev || prev.type === COMMA || (prev.type === OPERATOR && prev.value !== ')')) {
                // a run of unary signs folds into the following number or
                // name; before anything else a minus is a prefix operator
                let negative = value === '-';
                while (raw[i + 1] && (raw[i + 1].value === '+' || raw[i + 1].value === '-')) {
                    if (raw[++i].value === '-') negative = !negative;
                }
                const operand = raw[i + 1];
                if (operand && (operand.type === 'Number'
                        || (operand.type === 'Word' && !isOperator(operand.value)))) {
                    sign = negative ? '-' : '';
                } else if (negative) {
                    tokens.push(tk(OPERATOR, '-u'));
                }
                continue;
            }
        }

        if (value === '(') {
            // "2(3+4)" → "2*(3+4)", "(1+2)(3+4)" → "(1+2)*(3+4)", but not "fn("
            const prev = last(tokens);
            if (prev && !spaced && (prev.value === ')' || (prev.type === VALUE && RE_NUMBER.test(prev.value)))) {
                tokens.push(tk(OPERATOR, '*'));
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

    for (let i = 0; i < tokens.length; i++) {
        const { type, value } = tokens[i];

        if (type === VALUE) {
            const next = tokens[i + 1];
            if (tokens[i].live) {
                expr.push(tk(NUMBER, value));
            } else if (RE_NUMBER.test(value)) {
                expr.push(tk(NUMBER, Number(value)));
            } else if (next && next.value === '(') {
                const { args, endIndex } = parseFunctionArgs(tokens, i + 1);
                expr.push({ type: FUNCTION, name: value, value: args });
                i = endIndex;
            } else {
                expr.push(tk(VARIABLE, value));
            }
        } else if (type === OPERATOR) {
            if (value === '(') {
                opStack.push(value);
            } else if (value === ')') {
                while (opStack.length && last(opStack) !== '(') {
                    expr.push(tk(OPERATOR, opStack.pop()));
                }
                opStack.pop();
            } else if (value === '!' || value === '-u') {
                opStack.push(value);
            } else {
                const prev = tokens[i - 1], next = tokens[i + 1];
                if (!prev || prev.type === OPERATOR && prev.value !== ')') expr.push(tk(NUMBER, 0));
                const prec = operators[value];
                // && and || nest to the right so a chain lowers to CSS
                // text that grows with its length, not exponentially
                const rightAssoc = ['^', '&&', '||'].includes(value);
                while (opStack.length) {
                    const top = last(opStack);
                    // -(a) binds between * and ^, so -(a)^2 stays -(a^2)
                    const topPrec = top === '-u' ? 8.5 : operators[top];
                    if (rightAssoc ? topPrec > prec : topPrec >= prec) {
                        expr.push(tk(OPERATOR, opStack.pop()));
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
        expr.push(tk(OPERATOR, opStack.pop()));
    }

    return expr;
}

// Split the token stream of "(a, b, …)" into per-argument postfix lists
function parseFunctionArgs(tokens, startIndex) {
    const args = [];
    let current = [];
    let depth = 1;

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
        } else if (value === ',' && depth === 1) {
            if (current.length) {
                args.push(toPostfix(current));
            }
            current = [];
        } else {
            current.push(token);
        }
    }

    return { args, endIndex: i };
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

// A name reads from the context; "-x" reads as -1 * x
function compileVariable(name) {
    const negative = RE_NEGATIVE_VAR.test(name);
    const key = negative ? name.slice(1) : name;
    return (ctx, history) => {
        let result = ctx[name];
        if (typeof result === 'number' && !Number.isNaN(result)) {
            return result;
        }
        let negated = false;
        if (negative && isInvalidNumber(result)) {
            result = ctx[key];
            negated = true;
        }
        if (isInvalidNumber(result)) {
            return miss(history);
        }
        if (typeof result === 'function') {
            // only a function that takes no arguments reads bare
            result = result.length ? miss(history) : result();
        }
        if (typeof result !== 'number') {
            result = evaluateValue(result, ctx, history);
        }
        return negated ? neg(result) : result;
    };
}

function compileFunction(node) {
    const negative = node.name[0] === '-';
    const name = negative ? node.name.slice(1) : node.name;
    const chain = name.split('.');
    const argFns = node.value.map(compile);

    // match(c, a, b) evaluates only the taken branch, unless a context
    // value shadows the built-in
    if (name === 'match' && argFns.length >= 2) {
        const [c, a, b] = argFns;
        return (ctx, history) => {
            const fn = ctx[name];
            let output;
            if (fn === defaultContext.match) {
                // a live condition takes both branches, weighted by its truthiness
                const cond = c(ctx, history);
                output = live(cond)
                    ? `(${text(a(ctx, history))} * ${truthy(cond)} + ${text(b ? b(ctx, history) : 0)} * ${not(truthy(cond))})`
                    : cond ? a(ctx, history) : b && b(ctx, history);
            } else if (typeof fn === 'function') {
                output = fn(...argFns.map(f => f(ctx, history)));
            } else {
                return miss(history);
            }
            return negative ? neg(output) : output;
        };
    }

    // Plain calls; one and two arguments are passed directly because
    // spreading them costs 40% on the hottest calls
    if (chain.length === 1) {
        const [a, b] = argFns;
        if (argFns.length === 1) {
            return (ctx, history) => {
                const fn = ctx[name];
                if (typeof fn !== 'function') return miss(history);
                const x = a(ctx, history);
                const output = live(x) ? lower(name, [x], history, fn) : fn(x);
                return negative ? neg(output) : output;
            };
        }
        if (argFns.length === 2) {
            return (ctx, history) => {
                const fn = ctx[name];
                if (typeof fn !== 'function') return miss(history);
                const x = a(ctx, history);
                const y = b(ctx, history);
                const output = live(x) || live(y) ? lower(name, [x, y], history, fn) : fn(x, y);
                return negative ? neg(output) : output;
            };
        }
        return (ctx, history) => {
            const fn = ctx[name];
            if (typeof fn !== 'function') return miss(history);
            const args = argFns.map(f => f(ctx, history));
            const output = args.some(live) ? lower(name, args, history, fn) : fn(...args);
            return negative ? neg(output) : output;
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
        return negative ? neg(output) : output;
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
    return compile(toPostfix(transformTokens(input, spans)));
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

const RE_NAME = /^[a-zA-Z_][a-zA-Z0-9_-]*$/;

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
    if (readDimension(value, context) !== undefined) {
        return value;
    }
    const history = [value];
    const result = compileInput(value, context)(context, history);
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
    return context && Object.getPrototypeOf(context) === defaultContext
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
