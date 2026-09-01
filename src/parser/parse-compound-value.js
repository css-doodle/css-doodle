import { iterator, scan } from './tokenizer.js';

const memo = new Map();

function parseCached(input) {
    let result = memo.get(input);
    if (result === undefined) {
        if (memo.size >= 256) {
            memo.clear();
        }
        result = parse(input);
        memo.set(input, result);
    }
    return result;
}

function parse(input) {
    let iter = iterator(scan(input));
    let ret = {};
    let matched = false;
    while (iter.next()) {
        let { prev, curr, next} = iter.get();
        let isUnit = matched
            && (curr.isWord() || curr.isSymbol())
            && prev && prev.isNumber()
            && !next;
        if (curr.isNumber()) {
            ret.value = Number(curr.value);
            matched = true;
        }
        else if (isUnit) {
            ret.unit = curr.value;
        } else {
            break;
        }
    }
    return ret;
}

export default parseCached;
