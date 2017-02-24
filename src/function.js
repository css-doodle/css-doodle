export function index(x, y, count) {
  return _ => count;
}

export function row(x) {
  return _ => x;
}

export function col(x, y) {
  return _ => y;
}

export function any() {
  return function(...args) {
    return random.apply(null, args);
  }
}

export function rand() {
  return function(...args) {
    return random(memo(unitify(range)).apply(null, args));
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
  let length = arguments.length;
  if (length == 1) [start, stop] = [0, start];
  if (length < 3) step = (stop > 0 && stop < 1) ? .1 : 1;
  let range = [];
  while ((step > 0 && start < stop)
    || (step < 0 && start > stop)) {
    range.push(start);
    start += step;
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
  let unit = /(%|cm|em|ex|in|mm|pc|pt|px|vh|vw|vmin|deg)$/;
  let matched = ''.trim.call(str).match(unit);
  return matched ? matched[0] : '';
}

function remove_unit(str) {
  let unit = get_unit(str);
  return unit ? +(str.replace(unit, '')) : str;
}
