import Shapes from './shapes';
import calculator from './calculator';
import { clamp, alias_for } from './utils';

import {
  memo, random, range, unitify,
  by_charcode, shuffle
} from './utils';

function Lazy(fn) {
  let wrap = () => fn;
  wrap.lazy = true;
  return wrap;
}

const Last = {
  pick: '', rand: ''
};

const Expose = {

  index({ count }) {
    return _ => count;
  },

  row({ x }) {
    return _ => x;
  },

  col({ y }) {
    return _ => y;
  },

  size({ grid }) {
    return _ => grid.count;
  },

  ['max-row']({ grid }) {
    return _ => grid.x;
  },

  ['max-col']({ grid }) {
    return _ => grid.y;
  },

  n({ idx }) {
    return _ => idx || 0;
  },

  pick() {
    return (...args) => Last.pick = random(args);
  },

  ['pick-n']({ count, idx }) {
    return (...args) => {
      let max = args.length;
      let pos = ((idx == undefined ? count : idx) - 1) % max;
      return Last.pick = args[pos];
    }
  },

  ['pick-d']({ count, idx, context }) {
    return (...args) => {
      if (!context.pd) {
        context.pd = shuffle(args);
      }
      let max = args.length;
      let pos = ((idx == undefined ? count : idx) - 1) % max;
      return Last.pick = context.pd[pos];
    }
  },

  ['last-pick']() {
    return () => Last.pick;
  },

  multiple: Lazy((n, action) => {
    let result = [];
    if (!action || !n) return result;
    let count = clamp(n(), 1, 65536);
    for (let i = 0; i < count; ++i) {
      result.push(action(i + 1));
    }
    return result.join(',');
  }),

  repeat: Lazy((n, action) => {
    let result = '';
    if (!action || !n) return result;
    let count = clamp(n(), 1, 65536);
    for (let i = 0; i < count; ++i) {
      result += action(i + 1);
    }
    return result;
  }),

  rand() {
    return (...args) => {
      let [ start, stop ] = args;
      let fn = unitify;
      let is_letter = /^[a-zA-Z]$/.test(start) && /^[a-zA-Z]$/.test(stop);
      if (is_letter) fn = by_charcode;
      return Last.rand = random(
        memo('range', fn(range)).apply(null, args)
      );
    };
  },

  ['last-rand']() {
    return () => Last.rand;
  },

  calc() {
    return value => calculator(value);
  },

  hex() {
    return value => Number(value).toString(16);
  },

  svg: Lazy(input => {
    if (input === undefined) return '';
    let value = input().trim(), encoded = '';
    if (!value.includes('xmlns')) {
      value = value.replace(
        '<svg ',
        '<svg xmlns="http://www.w3.org/2000/svg" '
      );
    }
    try {
      encoded = encodeURIComponent(value);
    } catch (e) {
      // just ignore
    }
    return 'url("data:image/svg+xml;utf8,' + encoded + '")'
  }),

  var() {
    return value => `var(${ value })`;
  }

}

export default alias_for(Expose, {
  'multi': 'multiple',
  'pn':    'pick-n',
  'pd':    'pick-d',
  'r':     'rand',
  'p':     'pick',
  'lp':    'last-pick',
  'lr':    'last-rand',
  'i':     'index',

  'pick-by-turn': 'pick-n'
});
