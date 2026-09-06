import { scan, iterator } from './tokenizer.js';
import { memo } from '../utils/cache.js';

/**
 * an +/- b
 */
function parse(input) {
    let iter = iterator(scan(input));
    let a = 0, b = 0, op, seen = false, error;
    while (iter.next()) {
        let { curr, next } = iter.get();
        let v = curr.value;
        if (curr.isSymbol()) {
            if (v === '+' || v === '-') {
                op = v;
            } else {
                error = 'Unexpected ' + v;
                break;
            }
        }
        else if (curr.isNumber()) {
            if (seen && !op) {
                error = 'Syntax error';
                break;
            }
            let num = op === '-' ? -1 * Number(v) : Number(v);
            op = null;
            seen = true;
            if (next && next.value === 'n') {
                a += num;
                iter.next();
            } else {
                b += num;
            }
        }
        else if (v === 'n') {
            if (seen && !op) {
                error = 'Syntax error';
                break;
            }
            a += op === '-' ? -1 : 1;
            op = null;
            seen = true;
        }
        else if (!curr.isSpace()) {
            error = 'Unexpected ' + v;
            break;
        }
    }
    if (error) {
        return { a: 0, b: 0, error }
    }
    return { a, b };
}

export default memo('linear-expr', parse);
