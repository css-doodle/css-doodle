const units = `
  % cm fr rem em ex in mm pc pt px
  vh vw vmax vmin
  deg grad rad turn
  dpi dpcm dppx
  ms s
`;
const reg_match_unit = new RegExp(
  `(${ units.trim().split(/[\s\n]+/).join('|') })$`
);

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
  if (!str) return '';
  let matched = ''.trim.call(str).match(reg_match_unit);
  return matched ? matched[0] : '';
}

function remove_unit(str) {
  let unit = get_unit(str);
  return unit ? +(str.replace(unit, '')) : str;
}

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

export function unitify(fn) {
  return (...args) => {
    let unit = get_unit(args[0]);
    if (unit) {
      args = args.map(remove_unit);
      return add_unit(fn, unit).apply(null, args);
    }
    return fn.apply(null, args);
  }
}
