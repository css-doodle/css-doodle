import { iterator, scan } from './tokenizer.js';
import calc from '../core/calc.js';

const keywords = ['auto', 'reverse'];
const units = ['deg', 'rad', 'grad', 'turn'];

function parse(input) {
    let iter = iterator(scan(input));
    let unit = '';
    let expr = '';
    let ret = {
        direction: '',
        angle: 0,
    };
    while (iter.next()) {
        let { prev, curr } = iter.get();
        if (curr.isWord()) {
            if (keywords.includes(curr.value)) {
                ret.direction = curr.value;
            } else if (units.includes(curr.value) && prev && prev.isNumber()) {
                unit = curr.value;
            }
        } else {
            expr += curr.value;
        }
    }
    if (/\d/.test(expr)) {
        ret.angle = calc(expr);
        if (unit === 'rad') ret.angle /= (Math.PI / 180);
        if (unit === 'grad') ret.angle *= .9;
        if (unit === 'turn') ret.angle *= 360;
    } else if (!ret.direction) {
        ret.direction = 'auto';
    }
    return ret;
}

export default parse;
