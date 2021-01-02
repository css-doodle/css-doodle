function is_quote(c) {
  return c == '"' || c == "'";
}

function last(array) {
  return array[array.length - 1];
}

export default function parse(input) {
  let c = '';
  let temp = '';
  let name = '';
  let stack = [];
  let result = {
    textures: []
  };
  let w = '';
  let words = [];
  let i = 0;
  while ((c = input[i++]) !== undefined) {
    if (c == '"' || c == "'") {
      if (last(stack) == c) {
        stack.pop();
      } else {
        stack.push(c);
      }
    }
    if (c == '{' && !is_quote(last(stack)))  {
      if (!stack.length) {
        name = temp;
        temp = '';
      } else {
        temp += c;
      }
      stack.push(c);
    }
    else if (c == '}' && !is_quote(last(stack)))  {
      stack.pop();
      if (!stack.length) {
        let key = name.trim()
        let value = temp.trim().replace(/^\(+|\)+$/g, '');
        if (key.length) {
          if (key.startsWith('texture')) {
            result.textures.push({
              name: key,
              value: value
            });
          } else {
            result[key] = value;
          }
        }
        name = temp = '';
      } else {
        temp += c;
      }
    }
    else {
      if (/\s/.test(c) && w.length) {
        words.push(w);
        w = '';
        let need_break =
          (words[words.length - 3] == '#define') ||
          (words[words.length - 2] == '#ifdef') ||
          (words[words.length - 1] == '#else') ||
          (words[words.length - 1] == '#endif');

        if (need_break) {
          temp = temp + '\n';
        }
      } else {
        w += c;
      }
      temp += c;
    }
  }

  if (result.fragment === undefined) {
    return {
      fragment: input,
      textures: []
    }
  }

  return result;
}
