import { create_svg_url, normalize_svg } from './svg';

import { pick, rand, unique_id } from './utils/random';
import { shuffle } from './utils/list';
import { is_letter, lazy, alias_for, clamp, sequence } from './utils/index';

import by_unit from './utils/by-unit';
import by_charcode from './utils/by-charcode';
import calc from './utils/calc';
import expand from './utils/expand';

import Shapes from './shapes';

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

  depth({ z }) {
    return _ => z;
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

  ['size-depth']({ grid }) {
    return _ => grid.z;
  },

  n({ idx }) {
    return _ => idx || 0;
  },

  pick({ context }) {
    return expand((...args) => (
      context.last_pick = pick(args)
    ));
  },

  ['pick-n']({ idx, context, position }) {
    let counter = 'pn-counter' + position;
    return expand((...args) => {
      if (!context[counter]) context[counter] = 0;
      context[counter] += 1;
      let max = args.length;
      let pos = ((idx === undefined ? context[counter] : idx) - 1) % max;
      return context.last_pick = args[pos];
    });
  },

  ['pick-d']({ idx, context, position }) {
    let counter = 'pd-counter' + position;
    let values = 'pd-values' + position;
    return expand((...args) => {
      if (!context[counter]) context[counter] = 0;
      context[counter] += 1;
      if (!context[values]) {
        context[values] = shuffle(args);
      }
      let max = args.length;
      let pos = ((idx === undefined ? context[counter] : idx) - 1) % max;
      return context.last_pick = context[values][pos];
    });
  },

  ['last-pick']({ context }) {
    return () => context.last_pick;
  },

  multiple: lazy((n, action) => {
    if (!action || !n) return '';
    let count = clamp(n(), 0, 65536);
    return sequence(count, i => action(i + 1)).join(',');
  }),

  ['multiple-with-space']: lazy((n, action) => {
    if (!action || !n) return '';
    let count = clamp(n(), 0, 65536);
    return sequence(count, i => action(i + 1)).join(' ');
  }),

  repeat: lazy((n, action) => {
    if (!action || !n) return '';
    let count = clamp(n(), 0, 65536);
    return sequence(count, i => action(i + 1)).join('');
  }),

  rand({ context }) {
    return (...args) => {
      let transform_type = args.every(is_letter)
        ? by_charcode
        : by_unit;
      let value = transform_type(rand).apply(null, args);
      return context.last_rand = value;
    };
  },

  ['rand-int']({ context }) {
    return (...args) => {
      let transform_type = args.every(is_letter)
        ? by_charcode
        : by_unit;
      let value = parseInt(
        transform_type(rand).apply(null, args)
      );
      return context.last_rand = value;
    }
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
  },

  shape() {
    return memo('shape-function', (type = '', ...args) => {
      type = type.trim();
      if (typeof Shapes[type] === 'function') {
        return Shapes[type](args);
      }
      return '';
    });
  }

}

export default alias_for(Expose, {
  'm':  'multiple',
  'ms': 'multiple-with-space',

  'r':  'rand',
  'ri': 'rand-int',
  'lr': 'last-rand',

  'p':  'pick',
  'pn': 'pick-n',
  'pd': 'pick-d',
  'lp': 'last-pick',

  'i':  'index',
  'x':  'row',
  'y':  'col',
  'z':  'depth',

  'size-x': 'size-row',
  'size-y': 'size-col',
  'size-z': 'size-depth',

  // legacy names
  'multi': 'multiple',
  'pick-by-turn': 'pick-n',
  'max-row': 'size-row',
  'max-col': 'size-col'
});
