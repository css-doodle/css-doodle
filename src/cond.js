var is = {
  even: (n) => !!(n % 2),
  odd:  (n) => !(n % 2)
};

export function nth(x, y, count) {
  return n => n == count;
}

export function at(x, y) {
  return (x1, y1) => (x == x1 && y == y1);
}

export function row(x) {
  return n => /^(even|odd)$/.test(n) ? is[n](x) : (n == x)
}

export function col(x, y) {
  return n => /^(even|odd)$/.test(n) ? is[n](y) : (n == y);
}

export function even(x, y, count) {
  return _ => is.even(count);
}

export function odd(x, y, count) {
  return _ => is.odd(count);
}
