import { scan, iterator } from './tokenizer.js';
import { memo } from '../lib/cache.js';

const commands = 'MmLlHhVvCcSsQqTtAaZz';
const relatives = 'mlhvcsqtaz';

const ARITY = { m: 2, l: 2, t: 2, h: 1, v: 1, c: 6, s: 4, q: 4, a: 7, z: 0 };

function wellFormed({ name, value }) {
    let n = ARITY[name.toLowerCase()];
    if (!n) return !value.length;
    return value.length > 0 && value.length % n === 0
        && value.every(v => typeof v === 'number');
}

function parse(input) {
    let iter = iterator(scan(input));
    let temp = {};
    let result = {
        commands: [],
        valid: true
    };
    while (iter.next()) {
        let curr = iter.curr();
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
            } else if (curr.isSymbol('-', '+')) {
                let next = iter.curr(1);
                if (next && next.isNumber()) {
                    iter.next();
                    value = Number(curr.value + next.value);
                }
            }
            temp.value.push(value);
        } else {
            // a value before the first command
            result.valid = false;
        }
    }
    if (temp.name) {
        result.commands.push(temp);
    }
    if (result.valid) {
        result.valid = result.commands.every(wellFormed);
    }
    return result;
}

// generated path strings vary per cell, so the memo stays bounded
export default memo('svg-path', parse);
