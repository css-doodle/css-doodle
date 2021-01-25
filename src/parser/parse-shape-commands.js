import iterator from './iterator';

export default function parse(input) {
  const it = iterator(input);

  let temp = '';
  let result = {};
  let key = '';
  let value = '';

  while (!it.end()) {
    let c = it.curr();
    if (c == '/' && it.curr(1) == '*') {
      read_comments(it);
    }
    else if (c == ':') {
      key = temp;
      temp = '';
    }
    else if (c == ';') {
      value = temp;
      key = key.trim();
      value = value.trim();
      if (key.length && value.length) {
        result[key] = value;
      }
      key = value = temp = '';
    }
    else {
      temp += c;
    }
    it.next();
  }

  key = key.trim();
  temp = temp.trim();
  if (key.length && temp.length) {
    result[key] = temp;
  }

  return result;
}

function read_comments(it, flag = {}) {
  it.next();
  while (!it.end()) {
    let c = it.curr();
    if ((c = it.curr()) == '*' && it.curr(1) == '/') {
      it.next(); it.next();
      break;
    }
    it.next();
  }
}
