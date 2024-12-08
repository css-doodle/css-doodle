import calc from './calc.js';
import parse_linear_expr from './parser/parse-linear-expr.js';
import { add_alias } from './utils/index.js';

function odd(n) {
  return n % 2;
}

function even(n) {
  return !odd(n);
}

function get_selector(offset) {
  let selector = '';
  if (offset == 0) {
    selector = '$:hover';
  }
  else if (offset > 0) {
    selector = `$:hover ${'+*'.repeat(offset)}`;
  }
  else {
    selector = `:has(+ ${'*+'.repeat(Math.abs(offset + 1))} $:hover)`;
  }
  return selector;
}

function compare(rule, value, x, y) {
  if (rule === 'even') {
    return { value: odd(x + y) }
  }
  if (rule === 'odd') {
    return { value: even(x + y) }
  }
  if (rule === 'n') {
    return { value: true }
  }
  let { a, b, error } = parse_linear_expr(rule);
  if (error) {
    return { value: false, error }
  }
  if (a === 0) {
    return { value: value === b }
  } else {
    let result = (value - b) / a;
    return {
      value: result >= 0 && Number.isInteger(result),
    }
  }
}

export default add_alias({

  at({ x, y }) {
    return (x1, y1) => (x == x1 && y == y1);
  },

  nth({ count, grid }) {
    return (...exprs) => {
      for (let expr of exprs) {
        if (compare(expr, count).value) return true;
      }
    }
  },

  y({ y, grid }) {
    return (...exprs) => {
      for (let expr of exprs) {
        if (compare(expr, y).value) return true;
      }
    };
  },

  x({ x, grid }) {
    return (...exprs) => {
      for (let expr of exprs) {
        if (compare(expr, x).value) return true;
      }
    };
  },

  even({ x, y }) {
    return _ => odd(x + y);
  },

  odd({ x, y}) {
    return _ => even(x + y);
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

  cell({ count, grid, x, y, random }) {
    return (...args) => {
      if (!args.length) {
        return true;
      }
      let result = args.map(arg => {
        let { value, error } = compare(arg, count, x, y);
        if (!error) {
          return value;
        }
        return !!calc('(' + arg + ')', {
          x, X: grid.x,
          y, Y: grid.y,
          i: count, I: grid.count,
          random,
        });
      });
      return result.some(Boolean);
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

}, {
  col: 'x',
  row: 'y',
});
