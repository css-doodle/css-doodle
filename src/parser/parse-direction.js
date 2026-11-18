import { scan } from './tokenizer.js';
import calc from '../core/calc.js';

const keywords = ['auto', 'reverse'];
const units = ['deg', 'rad', 'grad', 'turn'];

function parse(input) {
    let unit = '';
    let expr = '';
    let ret = {
        direction: '',
        angle: 0,
    };
    for (let curr of scan(input)) {
        if (curr.isWord()) {
            if (keywords.includes(curr.value)) {
                ret.direction = curr.value;
            } else if (units.includes(curr.value)) {
                unit = curr.value;
            }
        } else {
            expr += curr.value;
        }
    }
    if (/\d/.test(expr)) {
        ret.angle = calc(expr) * ({ grad: .9, turn: 360 }[unit] || 1);
        if (unit === 'rad') ret.angle /= Math.PI / 180;
    } else if (!ret.direction) {
        ret.direction = 'auto';
    }
    return ret;
}

export default parse;
