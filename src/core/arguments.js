import parseValueGroup from '../parser/parse-value-group.js';
import parseCompoundValue from '../parser/parse-compound-value.js';
import { scan } from '../parser/tokenizer.js';
import { memo } from '../lib/cache.js';
import { clamp, tidyNumber } from '../lib/math.js';

export const MAX_SEQUENCE = 65536;

// limit caps the number of items, for a sequence nested in others
export function sequence(count, fn, limit = MAX_SEQUENCE) {
    let [x, y = 1] = String(count).split(/[x-]/);
    // a leading dash is a negative count, not a range
    if (x === '') return [];
    let [cx, cy] = [Math.ceil(x), Math.ceil(y)];
    if (Number.isNaN(cx)) cx = 1;
    if (Number.isNaN(cy)) cy = 1;
    x = clamp(cx, 0, MAX_SEQUENCE);
    y = clamp(cy, 0, MAX_SEQUENCE);
    let ret = [];
    let index = 1;
    if (/x/.test(count) || !/-/.test(count)) {
        x = Math.min(x, limit);
        if (x * y > limit) {
            y = Math.max(1, Math.floor(limit / x));
        }
        let max = x * y;
        for (let i = 1; i <= y; ++i) {
            for (let j = 1; j <= x; ++j) {
                ret.push(fn(index, j, i, max, x, y, index++));
            }
        }
    } else {
        let max = Math.abs(x - y) + 1;
        let step = x <= y ? 1 : -1;
        for (let i = x; i !== y + step && ret.length < limit; i += step) {
            ret.push(fn(i, i, 1, max, max, 1, index++));
        }
    }
    return ret;
}

// `[a-c]` expands each pair, either way round, and keeps single chars;
// a dash with nothing after it is literal, one with nothing before it is dropped
const buildRange = memo(input => {
    let expr = String(input);
    if (expr[0] !== '[' || expr[expr.length - 1] !== ']') {
        return [];
    }
    let list = [];
    for (let [, from, to, single] of expr.slice(1, -1).matchAll(/(.)-+(.)|-*(.)/gsu)) {
        if (single !== undefined) {
            list.push(single);
            continue;
        }
        let a = from.codePointAt(0), b = to.codePointAt(0);
        let step = a <= b ? 1 : -1;
        for (let c = a; c !== b + step; c += step) {
            list.push(String.fromCodePoint(c));
        }
    }
    return list;
});

function stepOf(value) {
    let [num, unit, rest] = scan(String(value));
    if (num?.isNumber() && !rest && (!unit || unit.isWord() || unit.isSymbol())) {
        return [Number(num.value), unit?.value ?? ''];
    }
    let chars = [...String(value)];
    return chars.length === 1 ? [chars[0].codePointAt(0), null] : [];
}

function unitOf(u, v) {
    if (u === v) return u;
    if (u === '' && v || v === '' && u) return u || v;
}

export function carry(a, b, end) {
    let [x, ux] = stepOf(a), [y, uy] = stepOf(b), [z, uz] = end === undefined ? [] : stepOf(end);
    let unit = unitOf(ux, uy);
    if (end !== undefined) unit = unitOf(unit, uz);
    if (x === undefined || y === undefined || unit === undefined) return;
    let gap = y - x;
    let at = k => unit === null
        ? String.fromCodePoint(clamp(y + gap * k, 0, 0x10ffff))
        : tidyNumber(y + gap * k) + unit;
    if (end === undefined) return at;
    if (z === undefined) return;
    let count = gap ? clamp(Math.ceil((z - y) / gap - 1e-9) - 1, 0, MAX_SEQUENCE) : 0;
    return Array.from({ length: count }, (_, i) => at(i + 1));
}

export function expand(fn) {
    return (...args) => {
        if (!args.some(n => Array.isArray(n) || String(n)[0] === '[' || n === '...')) {
            return fn(...args);
        }
        args = args.flatMap(n => String(n).startsWith('[') ? buildRange(n) : n);
        let list = [];
        for (let i = 0; i < args.length; ++i) {
            let fill = args[i] === '...' && i + 1 < args.length && carry(list.at(-2), list.at(-1), args[i + 1]);
            if (fill) list = list.concat(fill);
            else list.push(args[i]);
        }
        return fn(...list);
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
