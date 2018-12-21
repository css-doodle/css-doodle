export function lerp(start, end, t) {
  return start * (1 - t) + end * t;
}

export function rand(start = 0, end = start) {
  if (arguments.length == 1) {
    start = start < 1 ? .1 : 1;
  }
  return lerp(start, end, Math.random());
}

export function pick(...items) {
  let args = items.reduce((acc, n) => acc.concat(n), []);
  return args[~~(Math.random() * args.length)];
}

export function unique_id(prefix = '') {
  return prefix + Math.random().toString(32).substr(2);
}

