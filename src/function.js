import { create_svg_url, normalize_svg } from './svg';

import { pick, rand, unique_id } from './utils/random';
import { shuffle } from './utils/list';
import { is_letter, lazy, alias_for, clamp } from './utils/index';

import by_unit from './utils/by_unit';
import by_charcode from './utils/by_charcode';
import calc from './utils/calc';
import expand from './utils/expand';

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

  pick({ context }) {
    return expand((...args) => (
      context.last_pick = pick(args)
    ));
  },

  ['pick-n']({ count, idx, context }) {
    return expand((...args) => {
      let max = args.length;
      let pos = ((idx == undefined ? count : idx) - 1) % max;
      return context.last_pick = args[pos];
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
      return context.last_pick = context[name][pos];
    });
  },

  ['last-pick']({ context }) {
    return () => context.last_pick;
  },

  multiple: lazy((n, action) => {
    let result = [];
    if (!action || !n) return result;
    let count = clamp(n(), 1, 65536);
    for (let i = 0; i < count; ++i) {
      result.push(action(i + 1));
    }
    return result.join(',');
  }),

  repeat: lazy((n, action) => {
    let result = '';
    if (!action || !n) return result;
    let count = clamp(n(), 1, 65536);
    for (let i = 0; i < count; ++i) {
      result += action(i + 1);
    }
    return result;
  }),

  rand({ context }) {
    let initial = n => (n > 0 && n < 1) ? .1 : 1;
    return (...args) => {
      let [ start, end ] = args;
      let transform_type = [start, end].every(is_letter)
        ? by_charcode
        : by_unit;
      if (args.length == 1) {
        [start, end] = [initial(start), start];
      }
      let value = transform_type(rand).apply(null, [start, end]);
      return context.last_rand = value;
    };
  },

  ['last-rand']({ context }) {
    return () => context.last_rand;
  },

  calc() {
    return value => calc(value);
  },

  hex() {
    return value => parseInt(value).toString(16);
  },

  svg: lazy(input => {
    if (input === undefined) return '';
    let svg = normalize_svg(input().trim());
    return create_svg_url(svg);
  }),

  ['svg-filter']: lazy(input => {
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
