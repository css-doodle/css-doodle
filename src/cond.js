
export function nth(x, y, count) {
  return n => n == count;
}

export function at(x, y) {
  return (x1, y1) => (x == x1 && y == y1);
}

export function row(x) {
  return n => n == x;
}

export function col(x, y) {
  return n => n == y;
}

export function even(x, y, count) {
  return _ => !(count % 2);
}

export function odd(x, y, count) {
  return _ => !!(count % 2);
}

