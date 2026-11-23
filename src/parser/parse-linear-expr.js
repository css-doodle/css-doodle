import { scan } from './tokenizer.js';
import { memo } from '../lib/cache.js';

function parse(input, names) {
    let coefficients = names.map(() => 0);
    let constant = 0;
    let sign = null;
    let factor = null;
    let star = false;
    let seen = false;
    let error;

    let endTerm = () => {
        constant += factor ?? 0;
        factor = null;
    };

    for (let t of scan(input)) {
        let v = t.value, i;
        if (t.isSpace()) continue;
        if (t.isSymbol('+', '-')) {
            if (star || sign) { error = true; break; }
            endTerm();
            sign = v;
        }
        else if (t.isSymbol('*')) {
            if (factor === null || star) { error = true; break; }
            star = true;
        }
        else if (t.isNumber()) {
            // `2n -3`: the tokenizer reads `-3` after a space as one number
            if (v[0] === '-' && seen && !sign && !star) endTerm();
            else if ((seen && !sign) || factor !== null) { error = true; break; }
            factor = sign === '-' ? -v : +v;
            sign = null;
            seen = true;
        }
        else if (t.isWord() && (i = names.indexOf(v)) >= 0) {
            if (factor === null && seen && !sign) { error = true; break; }
            coefficients[i] += factor ?? (sign === '-' ? -1 : 1);
            factor = null;
            star = false;
            sign = null;
            seen = true;
        }
        else { error = true; break; }
    }
    endTerm();
    if (error || star || sign || ![...coefficients, constant].every(Number.isFinite)) return { coefficients: names.map(() => 0), constant: 0, error: true };
    return { coefficients, constant };
}

export const parseLinear = memo(parse);

export default memo(input => {
    let { coefficients: [a], constant: b, error } = parse(input, ['n']);
    return error ? { a, b, error } : { a, b };
});
