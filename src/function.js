import Shapes from './shapes';
import calculator from './calculator';
import { memo, random, range, unitify } from './utils';

function Lazy(fn) {
  let wrap = () => fn;
  wrap.lazy = true;
  return wrap;
}

export default {

  index(x, y, count) {
    return _ => count;
  },

  row(x, y, count) {
    return _ => x;
  },

  col(x, y, count) {
    return _ => y;
  },

  count(x, y, count, grid) {
    return _ => grid.count
  },

  maxrow(x, y, count, grid) {
    return _ => grid.x
  },

  maxcol(x, y, count, grid) {
    return _ => grid.y
  },

  pick() {
    return (...args) => random(args);
  },

  repeat: Lazy((n, action) => {
    let result = '';
    if (!action || !n) return result;
    let count = n();
    for (let i = 0; i < count; ++i) {
      result += action();
    }
    return result;
  }),

  rand() {
    return (...args) => random(
      memo('range', unitify(range)).apply(null, args)
    );
  },

  shape() {
    return memo('shape', (type = '', ...args) => {
      type = type.trim();
      if (Shapes[type]) {
        return Shapes[type].apply(null, args);
      }
    });
  },

  calc() {
    return value => calculator(value);
  }

}
