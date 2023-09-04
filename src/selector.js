import calc from './calc.js';

const literal = {
  even: n => !(n % 2),
  odd:  n => !!(n % 2),
};

/**
 * TODO: optimization
 */
function nth(input, curr, max) {
  for (let i = 0; i <= max; ++i) {
    if (calc(input, { n: i }) == curr) {
      return true;
    }
  }
}

function get_selector(offset) {
  let selector = '';
  if (offset == 0) {
    selector = '$.hover';
  }
  else if (offset > 0) {
    selector = `$.hover ${'+*'.repeat(offset)}`;
  }
  else {
    selector = `:has(+ ${'*+'.repeat(Math.abs(offset + 1))} $.hover)`;
  }
  return selector;
}

export default {

  at({ x, y }) {
    return (x1, y1) => (x == x1 && y == y1);
  },

  nth({ count, grid }) {
    return (...exprs) => exprs.some(expr =>
      literal[expr]
        ? literal[expr](count)
        : nth(expr, count, grid.count)
    );
  },

  row({ y, grid }) {
    return (...exprs) => exprs.some(expr =>
      literal[expr]
        ? literal[expr](y)
        : nth(expr, y, grid.y)
    );
  },

  col({ x, grid }) {
    return (...exprs) => exprs.some(expr =>
      literal[expr]
        ? literal[expr](x)
        : nth(expr, x, grid.x)
    );
  },

  even({ count, grid, x, y }) {
    return arg => literal.odd(x + y);
  },

  odd({ count, grid, x, y}) {
    return arg => literal.even(x + y);
  },

  random({ random, count, x, y, grid }) {
    return (ratio = .5) => {
      if (/\D/.test(ratio)) {
        return random() < calc('(' + ratio + ')', {
          x, X: grid.x,
          y, Y: grid.y,
          i: count, I: grid.count,
          random,
        });
      }
      return random() < ratio;
    }
  },

  match({ count, grid, x, y, random }) {
    return expr => {
      return !!calc('(' + expr + ')', {
        x, X: grid.x,
        y, Y: grid.y,
        i: count, I: grid.count,
        random,
      });
    }
  },

  hover({ count, x, y, grid, random }) {
    return (...args) => {
      let selectors = [];
      if (!args.length) {
        selectors.push(get_selector(0));
      }
      for (let arg of args) {
        let [dx, dy] = String(arg).split(/\s+/);
        dx = Number(dx);
        dy = Number(dy);
        // @hover(1, 2, 3)
        if (Number.isNaN(dy) && !Number.isNaN(dx)) {
          selectors.push(get_selector(dx));
        }
        // @hover(1 -1, 0 1)
        if (!Number.isNaN(dx) && !Number.isNaN(dy)) {
          let rx = dx + x;
          let ry = dy + y;
          if (rx >= 1 && rx <= grid.x && ry >= 1 && ry <= grid.y) {
            let offset = (dy * grid.y) + dx;
            selectors.push(get_selector(offset));
          }
        }
      }
      if (!selectors.length) {
        return false;
      }
      return {
        selector: selectors.join(',')
      }
    }
  },

}
