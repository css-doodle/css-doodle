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
          result.name = word;
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
        if (marks[marks.length - 1] == '(') {
          marks.pop();
        } else {
          throw new Error('bad match');
        }
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

  if (marks.length) {
    return [];
  }

  if (result.name) {
    groups.push(result);
  }
  return groups;
}

export default function parse_var(input) {
  input = input.trim();
  let result = [];
  if (!/^var\(/.test(input)) {
    return result;
  }
  let it = iterator(input);
  try {
    result = parse(it);
  } catch (e) {
    console.error(e && e.message || 'Bad variables.');
  }
  return result;
}
