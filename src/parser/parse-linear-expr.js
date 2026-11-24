import { scan } from './tokenizer.js';
import { memo } from '../lib/cache.js';

function parse(input, names) {
    let coefficients = names.map(() => 0);
    let constant = 0;
    let sign = null;
    let factor = null;
    let star = false;
    let seen = false;
    let fail = { coefficients: names.map(() => 0), constant: 0, error: true };

    let endTerm = () => {
        constant += factor ?? 0;
        factor = null;
    };

    for (let t of scan(input)) {
        let v = t.value, i;
        if (t.isSpace()) continue;
        if (t.isSymbol('+', '-')) {
            if (star || sign) return fail;
            endTerm();
            sign = v;
        }
        else if (t.isSymbol('*')) {
            if (factor === null || star) return fail;
            star = true;
        }
        else if (t.isNumber()) {
            // `2n -3`: the tokenizer reads `-3` after a space as one number
            if (v[0] === '-' && seen && !sign && !star) endTerm();
            else if ((seen && !sign) || factor !== null) return fail;
            factor = sign === '-' ? -v : +v;
            sign = null;
            seen = true;
        }
        else if (t.isWord() && (i = names.indexOf(v)) >= 0) {
            if (factor === null && seen && !sign) return fail;
            coefficients[i] += factor ?? (sign === '-' ? -1 : 1);
            factor = null;
            star = false;
            sign = null;
            seen = true;
        }
        else return fail;
    }
    endTerm();
    if (star || sign || ![...coefficients, constant].every(Number.isFinite)) return fail;
    return { coefficients, constant };
}

export const parseLinear = memo(parse);

export default memo(input => {
    let { coefficients: [a], constant: b, error } = parse(input, ['n']);
    return error ? { a, b, error } : { a, b };
});
