import { scan } from './tokenizer.js';
import { memo } from '../lib/cache.js';

function parse(input) {
    let tokens = scan(input);
    let ret = {};
    let i = 0;
    while (tokens[i]?.isNumber()) {
        ret.value = Number(tokens[i++].value);
    }
    let unit = tokens[i];
    if (i && unit && (unit.isWord() || unit.isSymbol()) && !tokens[i + 1]) {
        ret.unit = unit.value;
    }
    return ret;
}

export default memo(parse);
