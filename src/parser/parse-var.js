import iterator from './iterator';

// I'll make it work first
function parse(it) {
  let word = '', marks = [];
  let groups = [], result = {};

  while(!it.end()) {
    let c = it.curr();
    if (c == '(') {
      marks.push(c);
      word = '';
    }
    else if (c == ')' || c == ',') {
      if (/^\-\-.+/.test(word)) {
        if (!result.name) {
          result.name = word;;
        } else {
          if (!result.alternative) {
            result.alternative = [];
          }
          result.alternative.push({
            name: word
          });
        }
      }

      if (c == ')') {
        marks.pop();
      }

      if (c == ',') {
        if (!marks.length) {
          groups.push(result);
          result = {};
        }
      }

      word = '';
    }
    else if (!/\s/.test(c)) {
      word += c;
    }
    it.next();
  }
  if (result.name) {
    groups.push(result);
  }
  return groups;
}

export default input => {
  let it = iterator(input);
  return parse(it);
}
