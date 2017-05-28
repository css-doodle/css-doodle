import * as shapes from './shapes';

export function index(x, y, count) {
  return _ => count;
}

export function row(x, y, count) {
  return _ => x;
}

export function col(x, y, count) {
  return _ => y;
}

export function any() {
  return function(...args) {
    return random.apply(null, args);
  }
}

export function pick() {
  return any.apply(null, arguments);
}

export function rand() {
  return function(...args) {
    return random(memo(unitify(range)).apply(null, args));
  }
}

export function shape(x, y, count) {
  return function(type, ...args) {
    type = type.trim();
    if (shapes[type]) {
      return shapes[type].apply(null, args);
    }
  }
}

function random(...items) {
  let args = items.reduce((ret, n) => ret.concat(n), []);
  return args[Math.floor(Math.random() * args.length)];
}

function memo(fn) {
  return function(...args) {
    const memo = {};
    let key = args.join('-');
    if (memo[key]) return memo[key];
    return (memo[key] = fn.apply(null, args));
  }
}

function range(start, stop, step) {
  let count = 0;
  let initial = n => (n > 0 && n < 1) ? .1 : 1;
  let length = arguments.length;
  if (length == 1) [start, stop] = [initial(start), start];
  if (length < 3) step = initial(start);
  let range = [];
  while ((step > 0 && start < stop)
    || (step < 0 && start > stop)) {
    range.push(start);
    start += step;
    if (count++ >= 1000) break;
  }
  return range;
}

function unitify(fn) {
  return function(...args) {
    let unit = get_unit(args[0]);
    if (unit) {
      args = args.map(remove_unit);
      return add_unit(fn, unit).apply(null, args);
    }
    return fn.apply(null, args);
  }
}

function add_unit(fn, unit) {
  return function(...args) {
    args = args.map(remove_unit);
    let result = fn.apply(null, args);
    if (unit) {
      result = result.map(n => n + unit);
    }
    return result;
  }
}

function get_unit(str) {
  if (!str) return '';
  let unit = /(%|cm|fr|rem|em|ex|in|mm|pc|pt|px|vh|vw|vmax|vmin|deg|ms|s)$/;
  let matched = ''.trim.call(str).match(unit);
  return matched ? matched[0] : '';
}

function remove_unit(str) {
  let unit = get_unit(str);
  return unit ? +(str.replace(unit, '')) : str;
}
