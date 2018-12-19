import nth from './utils/nth';

const is = {
  even: n => !!(n % 2),
  odd:  n => !(n % 2)
};

function even_or_odd(expr) {
  return /^(even|odd)$/.test(expr);
}

export default {

  at({ x, y }) {
    return (x1, y1) => (x == x1 && y == y1);
  },

  nth({ count, grid }) {
    return (...exprs) => exprs.some(expr =>
      even_or_odd(expr)
        ? is[expr](count - 1)
        : nth(expr, count, grid.count)
    );
  },

  row({ x, grid }) {
    return (...exprs) => exprs.some(expr =>
      even_or_odd(expr)
        ? is[expr](x - 1)
        : nth(expr, x, grid.x)
    );
  },

  col({ y, grid }) {
    return (...exprs) => exprs.some(expr =>
      even_or_odd(expr)
        ? is[expr](y - 1)
        : nth(expr, y, grid.y)
    );
  },

  even({ count }) {
    return _ => is.even(count - 1);
  },

  odd({ count }) {
    return _ => is.odd(count - 1);
  },

  random() {
    return (ratio = .5) => {
      if (ratio >= 1 && ratio <= 0) ratio = .5;
      return Math.random() < ratio;
    }
  }

}
