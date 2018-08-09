import { range, by_charcode, last } from './utils';

function Type(type, value) {
  return { type, value };
}

function get_tokens(input) {
  let expr = String(input);
  let tokens = [], stack = [];
  if (!expr.startsWith('[') || !expr.endsWith(']')) {
    return tokens;
  }

  for (let i = 1; i < expr.length - 1; ++i) {
    let c = expr[i];
    if (c == '-' && expr[i - 1] == '-') {
      continue;
    }
    if (c == '-') {
      stack.push(c);
      continue;
    }
    if (last(stack) == '-') {
      stack.pop();
      let from = stack.pop();
      if (from) {
        tokens.push(Type('range', [ from, c ]));
      } else {
        tokens.push(Type('char', c));
      }
      continue;
    }
    if (stack.length) {
      tokens.push(Type('char', stack.pop()));
    }
    stack.push(c);
  }
  if (stack.length) {
    tokens.push(Type('char', stack.pop()));
  }
  return tokens;
}

function build_range(input) {
  let tokens = get_tokens(input);
  let ret = [];
  tokens.forEach(({ type, value }) => {
    if (type == 'range') {
      let [ from, to ] = value;
      let reverse = false;
      if (from > to) {
        [from, to] = [ to, from ];
        reverse = true;
      }
      let result = by_charcode(range)(from, to);
      if (result) {
        if (reverse) result.reverse();
        ret = ret.concat(result);
      }
    } else {
      ret.push(value);
    }
  });
  return ret;
}

export default function expand(fn) {
  return (...args) => {
    let arg_list = [];
    args.forEach(n => {
      if (String(n).startsWith('[')) {
        arg_list = arg_list.concat(build_range(n));
      } else {
        arg_list.push(n);
      }
    });
    return fn.apply(null, arg_list);
  }
}
