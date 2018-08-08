function add_unit(fn, unit) {
  return (...args) => {
    args = args.map(remove_unit);
    let result = fn.apply(null, args);
    if (unit) {
      result = result.map(n => n + unit);
    }
    return result;
  }
}

function get_unit(str) {
  let input = String(str).trim();
  if (!input) return '';
  let matched = input.match(/\d(\D+)$/);
  return matched ? matched[1] : '';
}

function remove_unit(str) {
  return Number(String(str).replace(/\D+$/g, ''));
}

export function apply_args(fn, ...args) {
  return args.reduce((f, arg) => {
    return f[Array.isArray(arg) ? 'apply': 'call'](null, arg);
  }, fn);
}

export function join_line(arr) {
  return (arr || []).join('\n');
}

export function make_array(arr) {
  return Array.isArray(arr) ? arr : [arr];
}

export function clamp(num, min, max) {
  return Math.max(min, Math.min(max, num));
}

export function only_if(cond, value) {
  return cond ? value : '';
}

const memo_store = {};
export function  memo(prefix, fn) {
  return (...args) => {
    let key = prefix + args.join('-');
    if (memo_store[key]) return memo_store[key];
    return (memo_store[key] = fn.apply(null, args));
  }
}

export function random(...items) {
  let args = items.reduce((ret, n) => ret.concat(n), []);
  return args[Math.floor(Math.random() * args.length)];
}

export function range(start, stop, step) {
  let count = 0, old = start;
  let initial = n => (n > 0 && n < 1) ? .1 : 1;
  let length = arguments.length;
  if (length == 1) [start, stop] = [initial(start), start];
  if (length < 3) step = initial(start);
  let range = [];
  while ((step >= 0 && start <= stop)
    || (step < 0 && start > stop)) {
    range.push(start);
    start += step;
    if (count++ >= 1000) break;
  }
  if (!range.length) range.push(old);
  return range;
}

export function unitify(fn) {
  return (...args) => {
    let unit = get_unit(args[0]) || get_unit(args[1]);
    return add_unit(fn, unit).apply(null, args);
  }
}

export function by_charcode(fn) {
  return (...args) => {
    let codes = args.map(n => String(n).charCodeAt(0));
    let result = fn.apply(null, codes);
    return result.map(n => String.fromCharCode(n));
  }
}

export function last(arr) {
  return arr[arr.length - 1];
}

export function first(arr) {
  return arr[0];
}

export function alias_for(obj, names) {
  Object.keys(names).forEach(n => {
    obj[n] = obj[names[n]];
  });
  return obj;
}

export function shuffle(arr) {
  let len = arr.length + 1;
  let ret = Array.from ? Array.from(arr) : arr.slice();
  while (len--) {
    let i = ~~(Math.random() * len);
    let old = ret[i];
    ret[i] = ret[0];
    ret[0] = old;
  }
  return ret;
}
