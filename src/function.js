import * as shapes from './shapes';
import { memo, random, range, unitify } from './utils';

export function index(x, y, count) {
  return _ => count;
}

export function row(x, y, count) {
  return _ => x;
}

export function col(x, y, count) {
  return _ => y;
}

export function any() {
  return function(...args) {
    return random.apply(null, args);
  }
}

export function pick() {
  return any.apply(null, arguments);
}

export function rand() {
  return function(...args) {
    return random(
      memo('range', unitify(range)).apply(null, args)
    );
  }
}

export function shape(x, y, count) {
  return memo('shape', function(type, ...args) {
    if (type) {
      type = type.trim();
      if (shapes[type]) {
        return shapes[type].apply(null, args);
      }
    }
  });
}
