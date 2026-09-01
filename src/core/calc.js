import { isInvalidNumber } from '../utils/type.js';
import { last } from '../utils/list.js';
import { scan } from '../parser/tokenizer.js';
import parseCompoundValue from '../parser/parse-compound-value.js';

const defaultContext = {
    __proto__: null,

    'π': Math.PI,
    gcd(a, b) {
        while (b) [a, b] = [b, a % b];
        return a;
    },
    match(c, a, b) {
        return c ? a : b
    }
};

const operators = {
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

const NUMBER = 'number';
const OPERATOR = 'operator';
const VARIABLE = 'variable';
const FUNCTION = 'function';

const compoundOps = new Set(['**', '==', '!=', '<=', '>=', '&&', '||', '<<', '>>']);
const RE_NUMBER = /^-?(\d+\.?\d*|\d*\.?\d+)(e[+-]?\d+)?$/i;
const RE_STARTS_WITH_MINUS = /^-/;
const RE_OPERATOR_CHARS = /^[<>&|]+$/;
const RE_NEGATIVE_VAR = /^-\D/;

function tk(type, value) {
    return { type, value };
}

function isOperator(value) {
    return value in operators;
}

function own(obj, name) {
    return Object.prototype.hasOwnProperty.call(obj, name) ? obj[name] : undefined;
}

// Push a value token, resolving adjacency with the previous token:
// "2x" → 2*x, "2sin(1)" → 2*sin(1), "k -1" → k-1
function pushValue(tokens, value) {
    const prev = last(tokens);
    if (prev && (prev.type === NUMBER || prev.value === ')')) {
        if (RE_STARTS_WITH_MINUS.test(value)) {
            tokens.push(tk(OPERATOR, '-'));
            value = value.slice(1);
        } else {
            tokens.push(tk(OPERATOR, '*'));
        }
    }
    tokens.push(tk(NUMBER, value));
}

// Transform raw tokens into calc-specific tokens
function transformTokens(rawTokens) {
    const raw = rawTokens.filter(t => t.type !== 'Space');
    const tokens = [];
    let i = 0;

    while (i < raw.length) {
        const { type, value } = raw[i];
        const next = raw[i + 1];

        if (type === 'Number') {
            pushValue(tokens, value);
            i++;
            continue;
        }

        if (type === 'Word') {
            // Handle operators not recognized by tokenizer (>, <, &, |)
            if (isOperator(value) || value === '!' || RE_OPERATOR_CHARS.test(value)) {
                if (next && (next.type === 'Word' || next.type === 'Symbol')
                        && compoundOps.has(value + next.value)) {
                    tokens.push(tk(OPERATOR, value + next.value));
                    i += 2;
                } else {
                    tokens.push(tk(OPERATOR, value));
                    i++;
                }
                continue;
            }

            // "x1", "y2" → variable names, not implicit multiplication
            if (next && next.type === 'Number' && !RE_STARTS_WITH_MINUS.test(next.value)) {
                pushValue(tokens, value + next.value);
                i += 2;
                continue;
            }

            pushValue(tokens, value);
            i++;
            continue;
        }

        if (type === 'Symbol') {
            if (value === ',') {
                tokens.push(tk('comma', value));
                i++;
                continue;
            }

            // Compound operators split by the tokenizer: ** == != <= >= && || << >>
            if (next && next.type === 'Symbol' && compoundOps.has(value + next.value)) {
                tokens.push(tk(OPERATOR, value + next.value));
                i += 2;
                continue;
            }

            if (value === '+' || value === '-') {
                const prev = last(tokens);
                const isSign = !prev || prev.type === 'comma' ||
                    (prev.type === OPERATOR && prev.value !== ')');

                if (isSign) {
                    let sign = (value === '-') ? -1 : 1;
                    let j = i + 1;
                    while (j < raw.length && (raw[j].value === '+' || raw[j].value === '-')) {
                        if (raw[j].value === '-') sign *= -1;
                        j++;
                    }
                    const operand = raw[j];

                    if (operand && (operand.type === 'Number' || operand.type === 'Word')) {
                        let combined = operand.value;
                        j++;
                        // "-x1" → negated variable x1
                        if (operand.type === 'Word' && raw[j] && raw[j].type === 'Number'
                                && !RE_STARTS_WITH_MINUS.test(raw[j].value)) {
                            combined += raw[j].value;
                            j++;
                        }
                        pushValue(tokens, (sign === -1 ? '-' : '') + combined);
                    } else {
                        // Handle unary sign before "(": "-(…)" → "-1*(…)"
                        pushValue(tokens, sign === -1 ? '-1' : '1');
                        tokens.push(tk(OPERATOR, '*'));
                    }
                    i = j;
                    continue;
                }
            }

            if (value === '(') {
                // "2(3+4)" → "2*(3+4)", "(1+2)(3+4)" → "(1+2)*(3+4)", but not "fn("
                const prev = last(tokens);
                if (prev && (prev.value === ')' ||
                        (prev.type === NUMBER && RE_NUMBER.test(prev.value)))) {
                    tokens.push(tk(OPERATOR, '*'));
                }
                tokens.push(tk(OPERATOR, value));
                i++;
                continue;
            }

            if (value === '!' || isOperator(value)) {
                tokens.push(tk(OPERATOR, value));
                i++;
                continue;
            }

            // Constants like π behave as values
            pushValue(tokens, value);
            i++;
            continue;
        }

        i++;
    }

    return tokens;
}

// Convert infix tokens to postfix (RPN)
function toPostfix(tokens) {
    const opStack = [];
    const expr = [];

    for (let i = 0; i < tokens.length; i++) {
        const { type, value } = tokens[i];

        if (type === NUMBER) {
            const next = tokens[i + 1];
            if (RE_NUMBER.test(value)) {
                expr.push(tk(NUMBER, Number(value)));
            } else if (next && next.type === OPERATOR && next.value === '(') {
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
                const currPrec = operators[value];
                const isRightAssoc = value === '^' || value === '**' || value === '!';
                while (opStack.length) {
                    const topPrec = operators[last(opStack)];
                    if (isRightAssoc ? topPrec > currPrec : topPrec >= currPrec) {
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

// Split the token stream of "(a, b, …)" into per-argument token lists
function parseFunctionArgs(tokens, startIndex) {
    const args = [];
    let current = [];
    let depth = 0;
    let i = startIndex;

    if (tokens[i] && tokens[i].value === '(') {
        depth = 1;
        i++;
    }

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

// User context first, then built-ins; replaces per-call context merging
function lookupFunction(name, ctx) {
    return own(ctx, name) || defaultContext[name] || own(Math, name);
}

function readDimension(value, ctx) {
    const { value: num, unit } = parseCompoundValue(String(value));
    if (!isInvalidNumber(num) && unit !== undefined
            && own(ctx, unit) === undefined
            && defaultContext[unit] === undefined
            && own(Math, unit) === undefined) {
        return num;
    }
}

function evaluateValue(value, ctx, history) {
    const num = readDimension(value, ctx);
    if (num !== undefined) {
        return num;
    }
    if (isCycle(value, history)) {
        return 0;
    }
    history.push(value);
    const result = compileInput(value)(ctx, history);
    history.pop();
    return result;
}

function compileVariable(name) {
    return (ctx, history) => {
        let result = own(ctx, name);

        if (isInvalidNumber(result)) {
            result = defaultContext[name];
        }
        if (isInvalidNumber(result)) {
            result = own(Math, name);
        }
        if (isInvalidNumber(result)) {
            result = expand(name, ctx, history);
        }
        if (isInvalidNumber(result)) {
            if (RE_NEGATIVE_VAR.test(name)) {
                result = expand('-1' + name.slice(1), ctx, history);
            }
        }
        if (result === undefined) {
            history.misses = (history.misses || 0) + 1;
            result = 0;
        }
        if (typeof result !== 'number') {
            result = evaluateValue(result, ctx, history);
        }
        return result;
    };
}

function compileFunction(node) {
    let name = node.name;
    let negative = false;
    if (RE_STARTS_WITH_MINUS.test(name)) {
        negative = true;
        name = name.slice(1);
    }
    const chain = name.split('.');
    const argFns = node.value.map(compile);

    // match(c, a, b) picks a branch: only the taken side evaluates,
    // unless a context value shadows the built-in
    if (chain.length === 1 && name === 'match' && argFns.length >= 2) {
        const [c, a, b] = argFns;
        return (ctx, history) => {
            const fn = lookupFunction(name, ctx);
            let output;
            if (fn === defaultContext.match) {
                output = c(ctx, history) ? a(ctx, history) : b && b(ctx, history);
            } else if (typeof fn === 'function') {
                output = fn(...argFns.map(f => f(ctx, history)));
            } else {
                history.misses = (history.misses || 0) + 1;
                return 0;
            }
            return negative ? -output : output;
        };
    }

    // Fast paths: plain function call with 1 or 2 arguments
    if (chain.length === 1 && argFns.length === 1) {
        const a = argFns[0];
        return (ctx, history) => {
            const fn = lookupFunction(name, ctx);
            if (typeof fn !== 'function') {
                history.misses = (history.misses || 0) + 1;
                return 0;
            }
            const output = fn(a(ctx, history));
            return negative ? -output : output;
        };
    }
    if (chain.length === 1 && argFns.length === 2) {
        const a = argFns[0];
        const b = argFns[1];
        return (ctx, history) => {
            const fn = lookupFunction(name, ctx);
            if (typeof fn !== 'function') {
                history.misses = (history.misses || 0) + 1;
                return 0;
            }
            const output = fn(a(ctx, history), b(ctx, history));
            return negative ? -output : output;
        };
    }

    // Chained calls like "sqrt.abs(…)" apply right to left
    return (ctx, history) => {
        let output = argFns.map(f => f(ctx, history));
        for (let i = chain.length - 1; i >= 0; i--) {
            if (!chain[i]) break;
            const fn = lookupFunction(chain[i], ctx);
            if (typeof fn !== 'function') {
                history.misses = (history.misses || 0) + 1;
                output = 0;
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
                // Trailing operator with a single operand acts as identity
                stack.push(right || (() => 0));
            } else {
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
    }

    const root = stack[0] || (() => 0);
    return (ctx, history) => Number(root(ctx, history)) || 0;
}

const compiledCache = new Map();

function compileInput(input) {
    let compiled = compiledCache.get(input);
    if (compiled === undefined) {
        if (compiledCache.size >= 512) {
            compiledCache.clear();
        }
        compiled = compile(toPostfix(transformTokens(scan(String(input)))));
        compiledCache.set(input, compiled);
    }
    return compiled;
}

// "-1x" → -1 * context.x
function expand(value, context, history) {
    const match = value.match(/^(-?[\d.]+)(.*)$/);
    if (!match) return undefined;

    const [, num, variable] = match;
    let v = own(context, variable);
    if (v === undefined) {
        v = defaultContext[variable];
    }

    if (v === undefined) {
        return v;
    }

    if (typeof v === 'number') {
        return Number(num) * v;
    }
    return Number(num) * evaluateValue(v, context, history);
}

// The history is a stack of values being expanded; seeing one that is
// already on the stack means it refers to itself
function isCycle(value, history) {
    return history.length > 50 || history.includes(value);
}

const RE_NAME = /^[a-zA-Z_][a-zA-Z0-9_-]*$/;

// A $ expression that is just the name of a variable acts as a
// generation-time var(): values that read as math evaluate as usual,
// anything else — colors, transforms, dimensioned literals — passes
// through verbatim. Returns undefined when the numeric path applies.
export function deref(input, context) {
    let name = String(input).trim();
    if (!RE_NAME.test(name)) return;
    let value = own(context, name);
    // Follow single-name chains: --a: b; --b: tomato
    for (let i = 0; typeof value === 'string' && i < 50; i++) {
        let next = value.trim();
        if (!RE_NAME.test(next) || next === name) break;
        let found = own(context, next);
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
    compileInput(value)(context, history);
    if (history.misses) {
        return value;
    }
}

const RE_SAFE_AFTER = /^[),+\-*/%^!<>=&|≤≥≠]/;
const RE_OPERATOR_TAIL = /[(,*/%^!<>=&|≤≥≠]$/;
const RE_VALUE_TAIL = /[0-9]$/;
const RE_PLAIN_NUMBER = /^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i;

export function toPlainNumber(v) {
    if (typeof v === 'number') {
        return Number.isFinite(v) ? v : null;
    }
    if (typeof v === 'string') {
        let t = v.trim();
        if (t && RE_PLAIN_NUMBER.test(t)) return Number(t);
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

export { operators };

export default function(input, context) {
    if (typeof input === 'number' && Number.isFinite(input)) {
        return input;
    }
    return compileInput(input)(context || {}, []);
}
