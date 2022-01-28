import { iterator, scan } from './tokenizer.js';

const keywords = ['auto', 'reverse'];
const units = ['deg', 'rad', 'grad', 'turn'];

function parse(input) {
  let iter = iterator(scan(input));
  let matched = false;
  let unit = '';
  let ret = {
    direction: '',
    angle: '',
  };
  while (iter.next()) {
    let { prev, curr, next } = iter.get();
    if (curr.isWord() && keywords.includes(curr.value)) {
      ret.direction = curr.value;
      matched = true;
    }
    else if (curr.isNumber()) {
      ret.angle = Number(curr.value);
      matched = true;
    }
    else if (curr.isWord() && prev && prev.isNumber() && units.includes(curr.value)) {
      unit = curr.value;
    }
    else if (curr.isSpace() && ret.direction !== '' && ret.angle !== '') {
      break;
    }
  }
  if (!matched) {
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
