import Shapes from './shapes';
import calculator from './calculator';
import { create_svg_url, normalize_svg } from './svg';
import expand from './expand';

import {
  clamp, alias_for,
  memo, random, range, unitify,
  shuffle, by_charcode, unique_id
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

  ['size-row']({ grid }) {
    return _ => grid.x;
  },

  ['size-col']({ grid }) {
    return _ => grid.y;
  },

  n({ idx }) {
    return _ => idx || 0;
  },

  pick() {
    return expand((...args) => Last.pick = random(args));
  },

  ['pick-n']({ count, idx }) {
    return expand((...args) => {
      let max = args.length;
      let pos = ((idx == undefined ? count : idx) - 1) % max;
      return Last.pick = args[pos];
    });
  },

  ['pick-d']({ count, idx, context, position }) {
    let name = 'pd-' + position;
    return expand((...args) => {
      if (!context[name]) {
        context[name] = shuffle(args);
      }
      let max = args.length;
      let pos = ((idx == undefined ? count : idx) - 1) % max;
      return Last.pick = context[name][pos];
    });
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
    let svg = normalize_svg(input().trim());
    return create_svg_url(svg);
  }),

  ['svg-filter']: Lazy(input => {
    if (input === undefined) return '';
    let id = unique_id('filter-');
    let svg = normalize_svg(input().trim())
      .replace(
        /<filter([\s>])/,
        `<filter id="${ id }"$1`
      );
    return create_svg_url(svg, id);
  }),

  var() {
    return value => `var(${ value })`;
  }

}

export default alias_for(Expose, {
  'multi': 'multiple',
  'm':     'multiple',
  'pn':    'pick-n',
  'pd':    'pick-d',
  'r':     'rand',
  'p':     'pick',
  'lp':    'last-pick',
  'lr':    'last-rand',
  'i':     'index',

  // legacy names
  'pick-by-turn': 'pick-n',
  'max-row': 'size-row',
  'max-col': 'size-col'
});
