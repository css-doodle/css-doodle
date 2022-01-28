import { scan, iterator } from './tokenizer.js';

const commands = 'MmLlHhVvCcSsQqTtAaZz';
const relatives = 'mlhvcsqtaz';

function parse(input) {
  let iter = iterator(scan(input));
  let temp = {};
  let result = {
    commands: [],
    valid: true
  };
  while (iter.next()) {
    let { curr } = iter.get();
    if (curr.isSpace() || curr.isSymbol(',')) {
      continue;
    }
    if (curr.isWord()) {
      if (temp.name) {
        result.commands.push(temp);
        temp = {};
      }
      temp.name = curr.value;
      temp.value = [];
      if (!commands.includes(curr.value)) {
        temp.type = 'unknown';
        result.valid = false;
      } else if (relatives.includes(curr.value)) {
        temp.type = 'relative';
      } else {
        temp.type = 'absolute';
      }
    } else if (temp.value) {
      let value = curr.value;
      if (curr.isNumber()) {
        value = Number(curr.value);
      }
      temp.value.push(value);
    } else if (!temp.name) {
      result.valid = false;
    }
  }
  if (temp.name) {
    result.commands.push(temp);
  }
  return result;
}

export default parse;
