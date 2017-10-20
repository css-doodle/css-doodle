import iterator from './iterator';

const is_seperator = c => /[,，\s]/.test(c);

function skip_pair(it) {
  let text = it.curr(), c;
  it.next();
  while (!it.end()) {
    text += (c = it.curr());
    if (c == ')') break;
    else if (c == '(') {
      text += skip_pair(it);
    }
    it.next();
  }
  return text;
}

function skip_seperator(it) {
  while (!it.end()) {
    if (!is_seperator(it.curr(1))) break;
    else it.next();
  }
}

export default function parse(input) {
  const it = iterator(input);
  const result = [];
  let group = '';

  while (!it.end()) {
    let c = it.curr();
    if (c == '(') {
      group += skip_pair(it);
    }

    else if (is_seperator(c)) {
      result.push(group);
      group = '';
      skip_seperator(it);
    } else {
      group += c;
    }

    it.next();
  }

  if (group) {
    result.push(group);
  }

  return result;
}
