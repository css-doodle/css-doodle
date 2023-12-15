import { last } from './list.js';

import { range } from './index.js';
import { memo } from './memo.js';
import { by_charcode } from './transform.js';

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
      tokens.push(from
        ? Type('range', [ from, c ])
        : Type('char', c)
      );
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

const build_range = memo('build_range', (input) => {
  let tokens = get_tokens(input);
  return tokens.flatMap(({ type, value }) => {
    if (type == 'char') return value;
    let [ from, to ] = value;
    let reverse = false;
    if (from > to) {
      [from, to] = [ to, from ];
      reverse = true;
    }
    let result = by_charcode(range)(from, to);
    if (reverse) result.reverse();
    return result;
  });
});

function expand(fn) {
  return (...args) => fn(...(args.flatMap(n =>
    String(n).startsWith('[') ? build_range(n) : n
  )));
}

export {
  expand,
}
