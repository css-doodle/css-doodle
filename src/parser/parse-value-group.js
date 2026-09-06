import { isEmpty } from '../lib/type.js';
import { scan } from './tokenizer.js';

function parse(input, option = {}) {
    let group = [];
    if (isEmpty(input)) return group;

    let remaining = new Map();
    for (let item of [].concat(option.symbol || ',')) {
        let [symbol, max = Infinity] = String(item).split(/\s+/);
        remaining.set(symbol, max);
    }
    const isSeparator = token => !!token
        && (remaining.get(token.value) > 0 || (!option.noSpace && token.isSpace()));
    const addGroup = (name, value) => {
        if (!option.verbose) group.push(value);
        else if (name.length || value.length) group.push({ group: name, value });
    };

    let tokens = scan(input);
    let buf = '';
    let name = '';
    let paren = 0;
    let quote = 0;
    for (let i = 0; i < tokens.length; i++) {
        let curr = tokens[i];
        if (curr.isSymbol('(')) paren++;
        if (curr.isSymbol(')')) paren = Math.max(0, paren - 1);
        if (curr.status === 'open') quote++;
        if (curr.status === 'close') quote = Math.max(0, quote - 1);
        let top = !paren && !quote;
        if (top && curr.isSpace()) {
            if (!buf.length) continue;
            if (option.noSpace && (isSeparator(tokens[i + 1]) || isSeparator(tokens[i - 1]))) continue;
        }
        if (top && isSeparator(curr)) {
            if (remaining.has(curr.value)) remaining.set(curr.value, remaining.get(curr.value) - 1);
            addGroup(name, buf);
            name = curr.value;
            buf = '';
        } else {
            buf += curr.value;
        }
    }
    if (buf.length) addGroup(name, buf);
    return group;
}

// Composed values repeat across cells and generations, so each unique
// (input, options) pair is parsed once. Results are shared: read-only.
const memo = new Map();

const RE_PLAIN = /[,()'"`\s]/;
const RE_SIMPLE = /^[\w.%#+\-\s,]*$/;

function parseSimple(input, noSpace) {
    let group = [];
    input = input.trim();
    if (!input) return group;
    let pieces = input.split(',');
    if (pieces.length > 1 && pieces[pieces.length - 1].trim() === '') {
        pieces.pop();
    }
    for (let piece of pieces) {
        let t = piece.trim();
        if (noSpace) {
            group.push(t.replace(/\s+/g, ' '));
        } else if (t === '') {
            group.push('');
        } else {
            group.push(...t.split(/\s+/));
        }
    }
    return group;
}

function parseCached(input, option) {
    let symbol = option && option.symbol;
    if ((symbol === undefined || symbol === ',')
            && !(option && option.verbose)
            && typeof input === 'string' && input.length
            && !RE_PLAIN.test(input)) {
        return [input];
    }
    if ((symbol === undefined || symbol === ',')
            && !(option && option.verbose)
            && (typeof input === 'number' || (typeof input === 'string' && input.length))
            && RE_SIMPLE.test(input)) {
        return parseSimple(String(input), option && option.noSpace);
    }
    let optKey = option
        ? (Array.isArray(symbol) ? symbol.join('\x01') : String(symbol))
            + (option.noSpace ? 'n' : '') + (option.verbose ? 'v' : '')
        : '';
    let inner = memo.get(optKey);
    if (!inner) {
        memo.set(optKey, inner = new Map());
    }
    let result = inner.get(input);
    if (result === undefined) {
        if (inner.size >= 512) {
            inner.clear();
        }
        result = parse(input, option);
        inner.set(input, result);
    }
    return result;
}

export default parseCached;
