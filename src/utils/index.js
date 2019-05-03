import { make_array } from './list';

export function apply_args(fn, ...args) {
  return args.reduce((f, arg) =>
    f.apply(null, make_array(arg)), fn
  );
}

export function clamp(num, min, max) {
  return Math.max(min, Math.min(max, num));
}

export function maybe(cond, value) {
  if (!cond) return '';
  return (typeof value === 'function') ? value() : value;
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

export function alias_for(obj, names) {
  Object.keys(names).forEach(n => {
    obj[n] = obj[names[n]];
  });
  return obj;
}

export function is_letter(c) {
  return /^[a-zA-Z]$/.test(c);
}

export function lazy(fn) {
  let wrap = () => fn;
  wrap.lazy = true;
  return wrap;
}

export function sequence(count, fn) {
  let ret = [];
  for (let i = 0; i < count; ++i) {
    ret.push(fn(i));
  }
  return ret;
}

export function cell_id(x, y, z) {
  return 'cell-' + x + '-' + y + '-' + z;
}
