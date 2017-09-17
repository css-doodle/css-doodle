import Shapes from './shapes';
import { memo, random, range, unitify } from './utils';

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

  pick() {
    return (...args) => random(args);
  },

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
    return value => new Function(`return ${ value }`)();
  }

}
