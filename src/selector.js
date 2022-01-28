import nth from './utils/nth.js';
import calc from './calc.js';

const is = {
  even: n => !(n % 2),
  odd:  n => !!(n % 2)
};

function even_or_odd(expr) {
  return /^(even|odd)$/.test(expr);
}

export default function(random) {

  return {

    at({ x, y }) {
      return (x1, y1) => (x == x1 && y == y1);
    },

    nth({ count, grid }) {
      return (...exprs) => exprs.some(expr =>
        even_or_odd(expr)
          ? is[expr](count)
          : nth(expr, count, grid.count)
      );
    },

    row({ y, grid }) {
      return (...exprs) => exprs.some(expr =>
        even_or_odd(expr)
          ? is[expr](y)
          : nth(expr, y, grid.y)
      );
    },

    col({ x, grid }) {
      return (...exprs) => exprs.some(expr =>
        even_or_odd(expr)
          ? is[expr](x)
          : nth(expr, x, grid.x)
      );
    },

    even({ count, grid, x, y }) {
      return arg => is.odd(x + y);
    },

    odd({ count, grid, x, y}) {
      return arg => is.even(x + y);
    },

    random() {
      return (ratio = .5) => {
        if (ratio >= 1 && ratio <= 0) ratio = .5;
        return random() < ratio;
      }
    },

    match({ count, grid, x, y }) {
      return expr => {
        return !!calc('(' + expr + ')', {
          x, X: grid.x,
          y, Y: grid.y,
          i: count, I: grid.count,
          random,
        });
      }
    }

  }
}
