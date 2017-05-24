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
  return `-webkit-${ rule } ${rule}`;
}
