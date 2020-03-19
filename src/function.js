import { create_svg_url, normalize_svg } from './svg';

import { pick, rand, unique_id } from './utils/random';
import { shuffle } from './utils/list';
import { cell_id, is_letter, alias_for } from './utils/index';
import { lazy, clamp, sequence } from './utils/index';

import by_unit from './utils/by-unit';
import by_charcode from './utils/by-charcode';
import calc from './utils/calc';
import expand from './utils/expand';
import Stack from './utils/stack';

import Shapes from './shapes';
import parse_value_group from './parser/parse-value-group';

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

  id({ x, y, z }) {
    return _ => cell_id(x, y, z);
  },

  n({ extra }) {
    return _ => extra[0] || 0;
  },

  N({ extra }) {
    return _ => extra[1] || 0;
  },

  repeat: (
    makeSequence('')
  ),

  multiple: (
    makeSequence(',')
  ),

  ['multiple-with-space']: (
    makeSequence(' ')
  ),

  pick({ context }) {
    return expand((...args) => {
      return pushStack(context, 'last_pick', pick(args));
    });
  },

  ['pick-n']({ context, extra, position }) {
    let counter = 'pn-counter' + position;
    return expand((...args) => {
      if (!context[counter]) context[counter] = 0;
      context[counter] += 1;
      let max = args.length;
      let [ idx ] = extra || [];
      let pos = ((idx === undefined ? context[counter] : idx) - 1) % max;
      let value = args[pos];
      return pushStack(context, 'last_pick', value);
    });
  },

  ['pick-d']({ context, extra, position }) {
    let counter = 'pd-counter' + position;
    let values = 'pd-values' + position;
    return expand((...args) => {
      if (!context[counter]) context[counter] = 0;
      context[counter] += 1;
      if (!context[values]) {
        context[values] = shuffle(args);
      }
      let max = args.length;
      let [ idx ] = extra || [];
      let pos = ((idx === undefined ? context[counter] : idx) - 1) % max;
      let value = context[values][pos];
      return pushStack(context, 'last_pick', value);
    });
  },

  ['last-pick']({ context }) {
    return (n = 1) => {
      let stack = context.last_pick;
      return stack ? stack.last(n) : '';
    };
  },

  rand({ context }) {
    return (...args) => {
      let transform_type = args.every(is_letter)
        ? by_charcode
        : by_unit;
      let value = transform_type(rand).apply(null, args);
      return pushStack(context, 'last_rand', value);
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
      return pushStack(context, 'last_rand', value);
    }
  },

  ['last-rand']({ context }) {
    return (n = 1) => {
      let stack = context.last_rand;
      return stack ? stack.last(n) : '';
    };
  },

  stripe() {
    return (...colors) => {
      let max = colors.length;
      let default_count = 0;
      let custom_sizes = [];
      let prev;
      if (!max) {
        return '';
      }
      colors.forEach(step => {
        let [_, size] = parse_value_group(step);
        if (size !== undefined) custom_sizes.push(size);
        else default_count += 1;
      });
      let default_size = custom_sizes.length
        ? `(100% - ${custom_sizes.join(' - ')}) / ${default_count}`
        : `100% / ${max}`
      return colors
        .map((step, i) => {
          let [color, size] = parse_value_group(step);
          let prefix = prev ? (prev + ' + ') : '';
          prev = prefix + (size !== undefined ? size : default_size);
          return `${color} 0 calc(${ prev })`
        })
        .join(',');
    }
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
  },

};

function makeSequence(c) {
  return lazy((n, action) => {
    if (!action || !n) return '';
    let count = clamp(n(), 0, 65536);
    return sequence(count, i => action(i + 1, count)).join(c)
  });
}

function pushStack(context, name, value) {
  if (!context[name]) context[name] = new Stack();
  context[name].push(value);
  return value;
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

  'rep': 'repeat',

  'i':  'index',
  'x':  'row',
  'y':  'col',
  'z':  'depth',

  's':  'size',
  'sx': 'size-row',
  'sy': 'size-col',
  'sz': 'size-depth',

  // legacy names
  'size-x': 'size-row',
  'size-y': 'size-col',
  'size-z': 'size-depth',
  'multi': 'multiple',
  'pick-by-turn': 'pick-n',
  'max-row': 'size-row',
  'max-col': 'size-col',

  // error prone
  'stripes': 'stripe'
});
