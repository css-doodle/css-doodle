export function values(obj) {
  if (Array.isArray(obj)) return obj;
  return Object.keys(obj).map(k => obj[k]);
}

export function apply_args(fn, ...args) {
  return args.reduce((f, arg) =>
    f.apply(null, values(arg)), fn
  );
}

export function join_line(arr) {
  return (arr || []).join('\n');
}

export function make_array(arr) {
  return Array.isArray(arr) ? arr : [arr];
}

export function minmax(num, min, max) {
  return Math.max(min, Math.min(max, num));
}

export function prefix(rule) {
  return `-webkit-${ rule } ${ rule }`;
}

export function only_if(cond, value) {
  return cond ? value : '';
}

const store = {};
export function memo(prefix, fn) {
  return function(...args) {
    var key = prefix + args.join('-');
    if (store[key]) return store[key];
    return (store[key] = fn.apply(null, args));
  }
}

export function random(...items) {
  var args = items.reduce((ret, n) => ret.concat(n), []);
  return args[Math.floor(Math.random() * args.length)];
}

export function range(start, stop, step) {
  var count = 0;
  var initial = n => (n > 0 && n < 1) ? .1 : 1;
  var length = arguments.length;
  if (length == 1) [start, stop] = [initial(start), start];
  if (length < 3) step = initial(start);
  var range = [];
  while ((step > 0 && start < stop)
    || (step < 0 && start > stop)) {
    range.push(start);
    start += step;
    if (count++ >= 1000) break;
  }
  return range;
}

export function unitify(fn) {
  return function(...args) {
    var unit = get_unit(args[0]);
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
    var result = fn.apply(null, args);
    if (unit) {
      result = result.map(n => n + unit);
    }
    return result;
  }
}

function get_unit(str) {
  if (!str) return '';
  var unit = /(%|cm|fr|rem|em|ex|in|mm|pc|pt|px|vh|vw|vmax|vmin|deg|grad|rad|turn|ms|s)$/;
  var matched = ''.trim.call(str).match(unit);
  return matched ? matched[0] : '';
}

function remove_unit(str) {
  var unit = get_unit(str);
  return unit ? +(str.replace(unit, '')) : str;
}

export default {
  values, apply_args, join_line, make_array,
  minmax, prefix, only_if, random, range, unitify
}
