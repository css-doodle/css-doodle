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
        angle: '',
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
    } else if (!ret.direction) {
        ret.direction = 'auto';
    }
    return normalizeAngle(ret, unit);
}

function normalizeAngle(input, unit) {
    let { angle } = input;
    if (angle === '') {
        angle = 0;
    }
    if (unit === 'rad') {
        angle /= (Math.PI / 180);
    }
    if (unit === 'grad') {
        angle *= .9;
    }
    if (unit === 'turn') {
        angle *= 360;
    }
    return Object.assign({}, input, { angle });
}

export default parse;
