import { scan, iterator } from './tokenizer.js';
import { memo } from '../lib/cache.js';

const RE_COMMANDS = /^[MmLlHhVvCcSsQqTtAaZz]+$/;

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
    let push = text => {
        let n = temp.value.length % 7;
        if (/^a$/i.test(temp.name) && (n == 3 || n == 4) && /^[01]./.test(text)) {
            temp.value.push(+text[0]);
            return push(text.slice(1));
        }
        temp.value.push(Number(text));
    };
    while (iter.next()) {
        let curr = iter.curr();
        if (curr.isSpace() || curr.isSymbol(',')) {
            continue;
        }
        if (curr.isWord()) {
            let known = RE_COMMANDS.test(curr.value);
            for (let name of known ? curr.value : [curr.value]) {
                if (temp.name) {
                    result.commands.push(temp);
                    temp = {};
                }
                temp.name = name;
                temp.value = [];
                if (!known) {
                    temp.type = 'unknown';
                    result.valid = false;
                } else {
                    temp.type = name === name.toLowerCase() ? 'relative' : 'absolute';
                }
            }
        } else if (temp.value) {
            let text = curr.value;
            if (curr.isSymbol('-', '+') && iter.curr(1)?.isNumber()) {
                text += iter.next().value;
            } else if (!curr.isNumber()) {
                temp.value.push(text);
                continue;
            }
            push(text);
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
export default memo(parse);
export { ARITY };
