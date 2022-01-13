import { iterator, scan } from './tokenizer';

function parse(input) {
  let iter = iterator(scan(input));
  let ret = {};
  while (iter.next()) {
    let { prev, curr } = iter.get();
    if (curr.isNumber()) {
      ret.value = Number(curr.value);
    }
    else if (curr.isWord() && prev && prev.isNumber()) {
      ret.unit = curr.value;
    }
  }
  return ret;
}

export default parse;
