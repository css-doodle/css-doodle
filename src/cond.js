export function nth(x, y, count) {
  return n => n == count;
}

export function at(x, y) {
  return (x1, y1) => (x == x1 && y == y1);
}

export function row(x) {
  return n => {
    if (n == 'odd') return is_odd(x);
    else if (n == 'even') is_even(x);
    return n == x;
  }
}

export function col(x, y) {
  return n => {
    if (n == 'odd') return is_odd(y)
    else if (n == 'even') is_even(y);
    return n == y;
  }
}

export function even(x, y, count) {
  return _ => is_even(count);
}

export function odd(x, y, count) {
  return _ => is_odd(count);
}

function is_even(n) {
  return !!(n % 2);
}

function is_odd(n) {
  return !is_even(n);
}
