import parseValueGroup from '../parser/parse-value-group.js';
import parseCompoundValue from '../parser/parse-compound-value.js';
import { memo } from '../lib/cache.js';
import { isInvalidNumber } from '../lib/type.js';
import { clamp, tidyNumber } from '../lib/math.js';

const MAX_SEQUENCE = 65536;

export function sequence(count, fn) {
    let [x, y = 1] = String(count).split(/[x-]/);
    // a leading dash is a negative count, not a range
    if (x === '') return [];
    let [cx, cy] = [Math.ceil(x), Math.ceil(y)];
    if (isInvalidNumber(cx)) cx = 1;
    if (isInvalidNumber(cy)) cy = 1;
    x = clamp(cx, 0, MAX_SEQUENCE);
    y = clamp(cy, 0, MAX_SEQUENCE);
    if (x * y > MAX_SEQUENCE) {
        y = Math.max(1, Math.floor(MAX_SEQUENCE / x));
    }
    let max = x * y;
    let ret = [];
    let index = 1;
    if (/x/.test(count)) {
        for (let i = 1; i <= y; ++i) {
            for (let j = 1; j <= x; ++j) {
                ret.push(fn(index, j, i, max, x, y, index));
                index++;
            }
        }
    } else if (/-/.test(count)) {
        max = Math.abs(x - y) + 1;
        if (x <= y) {
            for (let i = x; i <= y; ++i) {
                ret.push(fn(i, i, 1, max, max, 1, index++));
            }
        } else {
            for (let i = x; i >= y; --i) {
                ret.push(fn(i, i, 1, max, max, 1, index++));
            }
        }
    } else {
        for (let i = 1; i <= x; ++i) {
            ret.push(fn(i, i, 1, x, x, 1, index++));
        }
    }
    return ret;
}

function getTokens(input) {
    let expr = String(input);
    if (expr.charCodeAt(0) !== 91 || expr.charCodeAt(expr.length - 1) !== 93) {
        return [];
    }

    let tokens = [];
    let prev = '';
    let hasDash = false;

    for (let i = 1, len = expr.length - 1; i < len; ++i) {
        let c = expr[i];
        if (c === '-') {
            hasDash = true;
            continue;
        }
        if (hasDash) {
            hasDash = false;
            if (prev) {
                tokens.push([prev, c]);
                prev = '';
            } else {
                tokens.push(c);
            }
            continue;
        }
        if (prev) {
            tokens.push(prev);
        }
        prev = c;
    }
    if (prev) {
        tokens.push(prev);
    }
    if (hasDash) {
        tokens.push('-');
    }
    return tokens;
}

// `[a-c]` expands each pair, either way round, and keeps single chars
const buildRange = memo('buildRange', input => {
    let list = [];
    for (let token of getTokens(input)) {
        if (typeof token === 'string') {
            list.push(token);
            continue;
        }
        let from = token[0].charCodeAt(0), to = token[1].charCodeAt(0);
        let step = from <= to ? 1 : -1;
        for (let c = from; c !== to + step; c += step) {
            list.push(String.fromCharCode(c));
        }
    }
    return list;
});


// expand range arguments like [a-z] or [0-9] into individual values
export function expand(fn) {
    return (...args) => {
        let needsExpand = false;
        for (let n of args) {
            if (Array.isArray(n)
                || (typeof n === 'string' ? n.charCodeAt(0) === 91 /* [ */ : String(n)[0] === '[')) {
                needsExpand = true;
                break;
            }
        }
        if (!needsExpand) {
            return fn(...args);
        }
        return fn(...(args.flatMap(n =>
            String(n).startsWith('[') ? buildRange(n) : n
        )));
    };
}

export function byUnit(fn) {
    return (...args) => {
        let unit, values = [];
        for (let arg of args) {
            let parsed = parseCompoundValue(arg);
            if (unit === undefined) unit = parsed.unit;
            if (parsed.value !== undefined) values.push(parsed.value);
        }
        let result = fn(...values);
        if (typeof result === 'number') {
            result = tidyNumber(result);
        } else if (Array.isArray(result)) {
            result = result.map(n => typeof n === 'number' ? tidyNumber(n) : n);
        }
        if (unit === undefined) {
            return result;
        }
        if (Array.isArray(result)) {
            return result.map(n => n + unit);
        }
        return result + unit;
    }
}

export function byCharcode(fn) {
    return (...args) => {
        let codes = args.map(n => String(n).charCodeAt(0));
        let result = fn(...codes);
        return Array.isArray(result)
            ? result.map(n => String.fromCharCode(n))
            : String.fromCharCode(result);
    }
}

export function getNamedArguments(args, names) {
    let result = {};
    let order = true;
    for (let i = 0; i < args.length; ++i) {
        let arg = args[i];
        let argName = names[i];
        if (/=/.test(arg)) {
            let [name, value] = parseValueGroup(arg, { symbol: '=', noSpace: true });
            if (value !== undefined) {
                if (names.includes(name)) {
                    result[name] = value;
                }
                // ignore the rest unnamed arguments
                order = false;
            } else {
                result[argName] = arg;
            }
        } else if (order) {
            result[argName] = arg;
        }
    }
    return result;
}
