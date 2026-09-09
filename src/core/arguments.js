import parseValueGroup from '../parser/parse-value-group.js';
import parseCompoundValue from '../parser/parse-compound-value.js';
import { memo } from '../lib/cache.js';
import { clamp, tidyNumber } from '../lib/math.js';

const MAX_SEQUENCE = 65536;

export function sequence(count, fn) {
    let [x, y = 1] = String(count).split(/[x-]/);
    // a leading dash is a negative count, not a range
    if (x === '') return [];
    let [cx, cy] = [Math.ceil(x), Math.ceil(y)];
    if (Number.isNaN(cx)) cx = 1;
    if (Number.isNaN(cy)) cy = 1;
    x = clamp(cx, 0, MAX_SEQUENCE);
    y = clamp(cy, 0, MAX_SEQUENCE);
    if (x * y > MAX_SEQUENCE) {
        y = Math.max(1, Math.floor(MAX_SEQUENCE / x));
    }
    let max = x * y;
    let ret = [];
    let index = 1;
    if (/x/.test(count) || !/-/.test(count)) {
        for (let i = 1; i <= y; ++i) {
            for (let j = 1; j <= x; ++j) {
                ret.push(fn(index, j, i, max, x, y, index++));
            }
        }
    } else {
        max = Math.abs(x - y) + 1;
        let step = x <= y ? 1 : -1;
        for (let i = x; i !== y + step; i += step) {
            ret.push(fn(i, i, 1, max, max, 1, index++));
        }
    }
    return ret;
}

// `[a-c]` expands each pair, either way round, and keeps single chars;
// a dash with nothing after it is literal, one with nothing before it is dropped
const buildRange = memo('buildRange', input => {
    let expr = String(input);
    if (expr[0] !== '[' || expr[expr.length - 1] !== ']') {
        return [];
    }
    let list = [];
    for (let [, from, to, single] of expr.slice(1, -1).matchAll(/(.)-+(.)|-*(.)/gs)) {
        if (single !== undefined) {
            list.push(single);
            continue;
        }
        let a = from.charCodeAt(0), b = to.charCodeAt(0);
        let step = a <= b ? 1 : -1;
        for (let c = a; c !== b + step; c += step) {
            list.push(String.fromCharCode(c));
        }
    }
    return list;
});

// expand range arguments like [a-z] or [0-9] into individual values
export function expand(fn) {
    return (...args) => {
        // most calls have nothing to expand
        if (!args.some(n => Array.isArray(n) || String(n)[0] === '[')) {
            return fn(...args);
        }
        return fn(...args.flatMap(n => String(n).startsWith('[') ? buildRange(n) : n));
    };
}

// the numbers go through fn, the first unit found comes back on the result
export function byUnit(fn) {
    return (...args) => {
        let unit, values = [];
        for (let arg of args) {
            let parsed = parseCompoundValue(arg);
            unit ??= parsed.unit;
            if (parsed.value !== undefined) values.push(parsed.value);
        }
        let result = tidyNumber(fn(...values));
        return unit === undefined ? result : result + unit;
    }
}

export function byCharcode(fn) {
    return (...args) => String.fromCharCode(fn(...args.map(n => String(n).charCodeAt(0))));
}

// arguments fill by position until the first `name=value`, then only by name
export function getNamedArguments(args, names) {
    let result = {};
    let positional = true;
    for (let i = 0; i < args.length; ++i) {
        let arg = args[i];
        let [name, value] = /=/.test(arg) ? parseValueGroup(arg, { symbol: '=', noSpace: true }) : [];
        if (value === undefined) {
            if (positional) result[names[i]] = arg;
        } else {
            if (names.includes(name)) result[name] = value;
            positional = false;
        }
    }
    return result;
}
