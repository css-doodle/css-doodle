export default function parse(input) {
  let c = '';
  let i = 0;
  let temp = '';
  let result = {};
  let key = '';
  let value = '';
  while ((c = input[i++]) !== undefined) {
    if (c == ':') {
      key = temp;
      temp = '';
      continue;
    }
    if (c == ';') {
      value = temp;
      if (key.length && value.length) {
        result[key.trim()] = value.trim();
      }
      key = value = temp = '';
      continue;
    }
    temp += c;
  }

  if (key.length && temp.length) {
    result[key.trim()] = temp.trim.();
  }

  return result;
}
