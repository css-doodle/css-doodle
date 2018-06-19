import iterator from './iterator';

const is_seperator = c => /[,，\s]/.test(c);

function skip_seperator(it) {
  while (!it.end()) {
    if (!is_seperator(it.curr(1))) break;
    else it.next();
  }
}

export default function parse(input) {
  const it = iterator(input);
  const result = [], stack = [];
  let group = '';

  while (!it.end()) {
    let c = it.curr();
    if (c == '(') {
      group += c;
      stack.push(c);
    }

    else if (c == ')') {
      group += c;
      if (stack.length) {
        stack.pop();
      }
    }

    else if (stack.length) {
      group += c;
    }

    else if (is_seperator(c)) {
      result.push(group);
      group = '';
      skip_seperator(it);
    }

    else {
      group += c;
    }

    it.next();
  }

  if (group) {
    result.push(group);
  }

  return result;
}
