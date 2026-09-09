import { isInvalidNumber } from '../lib/type.js';
import { last } from '../lib/list.js';
import { scan } from '../parser/tokenizer.js';
import parseCompoundValue from '../parser/parse-compound-value.js';

const MATH = Object.create(null);
for (let name of Object.getOwnPropertyNames(Math)) {
    MATH[name] = Math[name];
}

export const defaultContext = {
    __proto__: MATH,

    'π': Math.PI,
    gcd(a, b) {
        while (b) [a, b] = [b, a % b];
        return a;
    },
    match(c, a, b) {
        return c ? a : b
    }
};

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

const binary = {
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
    '**': (a, b) => a ** b,
    '÷': (a, b) => a / b,
    '/': (a, b) => a / b,
    '=': (a, b) => a === b ? 1 : 0,
    '==': (a, b) => a === b ? 1 : 0,
    '≤': (a, b) => a <= b,
    '<=': (a, b) => a <= b,
    '≥': (a, b) => a >= b,
    '>=': (a, b) => a >= b,
    '≠': (a, b) => a !== b ? 1 : 0,
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

const RE_NUMBER = /^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i;
const RE_NEGATIVE_VAR = /^-\D/;

function tk(type, value) {
    return { type, value };
}

function isOperator(value) {
    return value in operators;
}

// Push a value, resolving adjacency with the previous token:
// "2x" → 2*x, "2sin(1)" → 2*sin(1), "k -1" → k-1
function pushValue(tokens, value) {
    const prev = last(tokens);
    if (prev && (prev.type === VALUE || prev.value === ')')) {
        if (value[0] === '-') {
            tokens.push(tk(OPERATOR, '-'));
            value = value.slice(1);
        } else {
            tokens.push(tk(OPERATOR, '*'));
        }
    }
    tokens.push(tk(VALUE, value));
}

// Rewrite scanner tokens into calc tokens: values (numbers and names),
// operators and commas. `spans` maps the source index of a dashed name
// the context defines to that name, so its tokens collapse into one word
function transformTokens(rawTokens, spans) {
    const raw = [];
    let end = 0;
    for (const token of rawTokens) {
        if (token.type === 'Space' || token.index < end) continue;
        const name = spans && spans.get(token.index);
        if (name) {
            end = token.index + name.length;
            raw.push({ type: 'Word', value: name, index: token.index });
        } else {
            raw.push(token);
        }
    }

    const tokens = [];
    // a unary sign waiting for the number or name it applies to
    let sign = '';

    for (let i = 0; i < raw.length; i++) {
        const { type, value, index } = raw[i];
        const next = raw[i + 1];

        if (type === 'Number') {
            pushValue(tokens, sign + value);
            sign = '';
            continue;
        }

        if (type === 'Word') {
            // ÷ ∧ ∨ are not scanner symbols, so they arrive as words
            if (isOperator(value)) {
                tokens.push(tk(OPERATOR, value));
                continue;
            }
            // "x1" is one name, not x*1
            if (next && next.type === 'Number' && next.index === index + value.length) {
                pushValue(tokens, sign + value + next.value);
                i++;
            } else {
                pushValue(tokens, sign + value);
            }
            sign = '';
            continue;
        }

        if (value === ',') {
            tokens.push(tk(COMMA, value));
            continue;
        }

        // compound operators the scanner splits: ** == != <= >= && || << >>
        if (next && next.type === 'Symbol' && isOperator(value + next.value)) {
            tokens.push(tk(OPERATOR, value + next.value));
            i++;
            continue;
        }

        if (value === '+' || value === '-') {
            const prev = last(tokens);
            if (!prev || prev.type === COMMA || (prev.type === OPERATOR && prev.value !== ')')) {
                // a run of unary signs folds into the following number or
                // name; before anything else it multiplies by ±1
                let negative = value === '-';
                while (raw[i + 1] && (raw[i + 1].value === '+' || raw[i + 1].value === '-')) {
                    if (raw[++i].value === '-') negative = !negative;
                }
                const operand = raw[i + 1];
                if (operand && (operand.type === 'Number'
                        || (operand.type === 'Word' && !isOperator(operand.value)))) {
                    sign = negative ? '-' : '';
                } else {
                    pushValue(tokens, negative ? '-1' : '1');
                    tokens.push(tk(OPERATOR, '*'));
                }
                continue;
            }
        }

        if (value === '(') {
            // "2(3+4)" → "2*(3+4)", "(1+2)(3+4)" → "(1+2)*(3+4)", but not "fn("
            const prev = last(tokens);
            if (prev && (prev.value === ')' || (prev.type === VALUE && RE_NUMBER.test(prev.value)))) {
                tokens.push(tk(OPERATOR, '*'));
            }
        }

        if (isOperator(value)) {
            tokens.push(tk(OPERATOR, value));
        } else {
            // π, and stray symbols that read as misses
            pushValue(tokens, value);
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
            if (RE_NUMBER.test(value)) {
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
            } else {
                const prec = operators[value];
                const rightAssoc = value === '^' || value === '**' || value === '!';
                while (opStack.length) {
                    const top = operators[last(opStack)];
                    if (rightAssoc ? top > prec : top >= prec) {
                        expr.push(tk(OPERATOR, opStack.pop()));
                    } else {
                        break;
                    }
                }
                opStack.push(value);
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
        let sign = 1;
        if (negative && isInvalidNumber(result)) {
            result = ctx[key];
            sign = -1;
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
        return sign * result;
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
                output = c(ctx, history) ? a(ctx, history) : b && b(ctx, history);
            } else if (typeof fn === 'function') {
                output = fn(...argFns.map(f => f(ctx, history)));
            } else {
                return miss(history);
            }
            return negative ? -output : output;
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
                const output = fn(a(ctx, history));
                return negative ? -output : output;
            };
        }
        if (argFns.length === 2) {
            return (ctx, history) => {
                const fn = ctx[name];
                if (typeof fn !== 'function') return miss(history);
                const output = fn(a(ctx, history), b(ctx, history));
                return negative ? -output : output;
            };
        }
        return (ctx, history) => {
            const fn = ctx[name];
            if (typeof fn !== 'function') return miss(history);
            const output = fn(...argFns.map(f => f(ctx, history)));
            return negative ? -output : output;
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
            output = Array.isArray(output) ? fn(...output) : fn(output);
        }
        return negative ? -output : output;
    };
}

// Compile a postfix expression into a closure of (context, history)
function compile(expr) {
    const stack = [];

    for (let i = 0; i < expr.length; i++) {
        const node = expr[i];
        const { type, value } = node;

        if (type === NUMBER) {
            stack.push(() => value);
        } else if (type === VARIABLE) {
            stack.push(compileVariable(value));
        } else if (type === FUNCTION) {
            stack.push(compileFunction(node));
        } else if (value === '!') {
            const operand = stack.pop() || (() => NaN);
            stack.push((ctx, history) => Number(operand(ctx, history)) ? 0 : 1);
        } else {
            const right = stack.pop();
            const left = stack.pop();

            if (i === expr.length - 1 && left === undefined) {
                // a trailing operator with a single operand acts as identity
                stack.push(right || (() => 0));
                continue;
            }
            const l = left || (() => NaN);
            const r = right || (() => NaN);
            if (value === '&&' || value === '∧') {
                // short-circuit: the right side only runs when needed
                stack.push((ctx, history) => {
                    const a = Number(l(ctx, history));
                    return a ? Number(r(ctx, history)) : a;
                });
            } else if (value === '||' || value === '∨') {
                stack.push((ctx, history) => {
                    const a = Number(l(ctx, history));
                    return a ? a : Number(r(ctx, history));
                });
            } else {
                const op = binary[value] || (() => 0);
                stack.push((ctx, history) => op(Number(l(ctx, history)), Number(r(ctx, history))));
            }
        }
    }

    const root = stack[0] || (() => 0);
    return (ctx, history) => Number(root(ctx, history)) || 0;
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
    return compile(toPostfix(transformTokens(scan(input), spans)));
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
// generation-time var(): values that read as math evaluate as usual,
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
    if (readDimension(value, context) !== undefined) {
        return value;
    }
    const history = [];
    compileInput(value, context)(context, history);
    if (history.misses) {
        return value;
    }
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

export default function(input, context) {
    if (typeof input === 'number' && Number.isFinite(input)) {
        return input;
    }
    if (!context || Object.getPrototypeOf(context) !== defaultContext) {
        context = Object.assign(Object.create(defaultContext), context);
    }
    return compileInput(input, context)(context, []);
}
