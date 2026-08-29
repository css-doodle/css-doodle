/**
 * Argument handling for doodle functions: sequence expansion (2x3, 1-9),
 * character-range expansion ([a-z]), unit/charcode passthrough wrappers,
 * and named arguments.
 */
import parse_value_group from '../parser/parse-value-group.js';
import parse_compound_value from '../parser/parse-compound-value.js';
import { memo } from '../utils/cache.js';
import { is_invalid_number } from '../utils/type.js';
import { clamp } from '../utils/math.js';

export function sequence(count, fn) {
  let [x, y = 1] = String(count).split(/[x-]/);
  let [cx, cy] = [Math.ceil(x), Math.ceil(y)];
  if (is_invalid_number(cx)) cx = 1;
  if (is_invalid_number(cy)) cy = 1;
  x = clamp(cx, 0, 65536);
  y = clamp(cy, 0, 65536);
  let max = x * y;
  let ret = [];
  let index = 1;
  if (/x/.test(count)) {
    for (let i = 1; i <= y; ++i) {
      for (let j = 1; j <= x; ++j) {
        ret.push(fn(index, j, i, max, x, y, index));
        index++;
      }
    }
  } else if (/-/.test(count)) {
    max = Math.abs(x - y) + 1;
    if (x <= y) {
      for (let i = x; i <= y; ++i) {
        ret.push(fn(i, i, 1, max, max, 1, index++));
      }
    } else {
      for (let i = x; i >= y; --i) {
        ret.push(fn(i, i, 1, max, max, 1, index++));
      }
    }
  } else {
    for (let i = 1; i <= x; ++i) {
      ret.push(fn(i, i, 1, x, x, 1, index++));
    }
  }
  return ret;
}

function* char_range(start, end) {
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
      yield* char_range(token[0], token[1]);
    }
  }
}

const build_range = memo('build_range', (input) => {
  return [...build_range_gen(get_tokens(input))];
});

/* expand range arguments like [a-z] or [0-9] into individual values */
export function expand(fn) {
  return (...args) => {
    let needs_expand = false;
    for (let n of args) {
      if (Array.isArray(n)
        || (typeof n === 'string' ? n.charCodeAt(0) === 91 /* [ */ : String(n)[0] === '[')) {
        needs_expand = true;
        break;
      }
    }
    if (!needs_expand) {
      return fn(...args);
    }
    return fn(...(args.flatMap(n =>
      String(n).startsWith('[') ? build_range(n) : n
    )));
  };
}

/* strip units before calling fn and add the first one back to the result */
export function by_unit(fn) {
  return (...args) => {
    let units = [], values = [];
    for (let arg of args) {
      let { unit, value } = parse_compound_value(arg);
      if (unit !== undefined) {
        units.push(unit);
      }
      if (value !== undefined) {
        values.push(value);
      }
    }
    let result = fn(...values);
    let unit = units.find(n => n !== undefined);
    if (unit === undefined) {
      return result;
    }
    if (Array.isArray(result)) {
      return result.map(n => n + unit);
    }
    return result + unit;
  }
}

/* let fn work on charcodes while accepting and returning characters */
export function by_charcode(fn) {
  return (...args) => {
    let codes = args.map(n => String(n).charCodeAt(0));
    let result = fn(...codes);
    return Array.isArray(result)
      ? result.map(n => String.fromCharCode(n))
      : String.fromCharCode(result);
  }
}

export function get_named_arguments(args, names) {
  let result = {};
  let order = true;
  for (let i = 0; i < args.length; ++i) {
    let arg = args[i];
    let arg_name = names[i];
    if (/=/.test(arg)) {
      let [name, value] = parse_value_group(arg, { symbol: '=', noSpace: true });
      if (value !== undefined) {
        if (names.includes(name)) {
          result[name] = value;
        }
        // ignore the rest unnamed arguments
        order = false;
      } else {
        result[arg_name] = arg;
      }
    } else if (order) {
      result[arg_name] = arg;
    }
  }
  return result;
}
