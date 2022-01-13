import { iterator, scan } from './tokenizer';

function parse(input) {
  let iter = iterator(scan(input));
  let ret = {};
  let matched = false;
  while (iter.next()) {
    let { prev, curr } = iter.get();
    if (curr.isNumber()) {
      ret.value = Number(curr.value);
      matched = true;
    }
    else if (matched && curr.isWord() && prev && prev.isNumber()) {
      ret.unit = curr.value;
    } else {
      break;
    }
  }
  return ret;
}

export default parse;
