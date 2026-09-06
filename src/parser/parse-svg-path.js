import { scan, iterator } from './tokenizer.js';

const commands = 'MmLlHhVvCcSsQqTtAaZz';
const relatives = 'mlhvcsqtaz';

const ARITY = { m: 2, l: 2, t: 2, h: 1, v: 1, c: 6, s: 4, q: 4, a: 7, z: 0 };

function wellFormed({ name, value }) {
    let n = ARITY[name.toLowerCase()];
    if (!n) return !value.length;
    return value.length > 0 && value.length % n === 0
        && value.every(v => typeof v === 'number');
}

// generated path strings vary per cell, so keep the cache bounded
const cache = new Map();

function parse(input) {
    if (cache.has(input)) {
        return cache.get(input);
    }
    if (cache.size >= 4096) {
        cache.clear();
    }

    let iter = iterator(scan(input));
    let temp = {};
    let result = {
        commands: [],
        valid: true
    };
    while (iter.next()) {
        let { curr } = iter.get();
        if (curr.isSpace() || curr.isSymbol(',')) {
            continue;
        }
        if (curr.isWord()) {
            if (temp.name) {
                result.commands.push(temp);
                temp = {};
            }
            temp.name = curr.value;
            temp.value = [];
            if (curr.value.length !== 1 || !commands.includes(curr.value)) {
                temp.type = 'unknown';
                result.valid = false;
            } else if (relatives.includes(curr.value)) {
                temp.type = 'relative';
            } else {
                temp.type = 'absolute';
            }
        } else if (temp.value) {
            let value = curr.value;
            if (curr.isNumber()) {
                value = Number(curr.value);
            } else if (curr.isSymbol('-') || curr.isSymbol('+')) {
                let { next } = iter.get();
                if (next && next.isNumber()) {
                    iter.next();
                    value = Number(curr.value + next.value);
                }
            }
            temp.value.push(value);
        } else if (!temp.name) {
            result.valid = false;
        }
    }
    if (temp.name) {
        result.commands.push(temp);
    }
    if (result.valid) {
        result.valid = result.commands.every(wellFormed);
    }

    cache.set(input, result);
    return result;
}

export default parse;
