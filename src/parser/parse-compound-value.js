import { iterator, scan } from './tokenizer.js';

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

export default parse;
