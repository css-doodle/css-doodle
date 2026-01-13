import { memo } from '../cache.js';

function* range(start, end) {
  let from = start.charCodeAt(0);
  let to = end.charCodeAt(0);
  let step = from <= to ? 1 : -1;
  let length = Math.abs(to - from) + 1;
  for (let i = 0; i < length; i++) {
    yield String.fromCharCode(from + i * step);
  }
}

function get_tokens(input) {
  let expr = String(input);
  if (expr.charCodeAt(0) !== 91 || expr.charCodeAt(expr.length - 1) !== 93) {
    return [];
  }

  let tokens = [];
  let prev = '';
  let hasDash = false;

  for (let i = 1, len = expr.length - 1; i < len; ++i) {
    let c = expr[i];
    if (c === '-') {
      if (hasDash) continue;
      hasDash = true;
      continue;
    }
    if (hasDash) {
      hasDash = false;
      if (prev) {
        tokens.push([prev, c]);
        prev = '';
      } else {
        tokens.push(c);
      }
      continue;
    }
    if (prev) {
      tokens.push(prev);
    }
    prev = c;
  }
  if (prev) {
    tokens.push(prev);
  }
  if (hasDash) {
    tokens.push('-');
  }
  return tokens;
}

function* build_range_gen(tokens) {
  for (let i = 0, len = tokens.length; i < len; i++) {
    let token = tokens[i];
    if (typeof token === 'string') {
      yield token;
    } else {
      yield* range(token[0], token[1]);
    }
  }
}

const build_range = memo('build_range', (input) => {
  return [...build_range_gen(get_tokens(input))];
});

export default function expand(fn) {
  return (...args) => fn(...(args.flatMap(n =>
    String(n).startsWith('[') ? build_range(n) : n
  )));
}
