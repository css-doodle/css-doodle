import { create_svg_url, normalize_svg } from './svg';

import list from './utils/list';
import random_func from './utils/random';

import { cell_id, is_letter, alias_for } from './utils/index';
import { lazy, clamp, sequence, get_value } from './utils/index';

import by_unit from './utils/by-unit';
import by_charcode from './utils/by-charcode';
import calc from './utils/calc';
import expand from './utils/expand';
import Stack from './utils/stack';
import memo from './utils/memo';

import { shapes, custom_shape } from './shapes';
import parse_value_group from './parser/parse-value-group';
import parse_shape_commands from './parser/parse-shape-commands';

import { uniform_time } from './uniform';

function get_exposed(random) {
  const { shuffle } = list(random);
  const { pick, rand, nrand, unique_id } = random_func(random);

  const Expose = {

    index({ count }) {
      return _ => count;
    },

    row({ y }) {
      return _ => y;
    },

    col({ x }) {
      return _ => x;
    },

    depth({ z }) {
      return _ => z;
    },

    size({ grid }) {
      return _ => grid.count;
    },

    ['size-row']({ grid }) {
      return _ => grid.y;
    },

    ['size-col']({ grid }) {
      return _ => grid.x;
    },

    ['size-depth']({ grid }) {
      return _ => grid.z;
    },

    id({ x, y, z }) {
      return _ => cell_id(x, y, z);
    },

    n({ extra }) {
      return _ => extra ? extra[0] : '@n';
    },

    nx({ extra }) {
      return _ => extra ? extra[1] : '@nx';
    },

    ny({ extra }) {
      return _ => extra ? extra[2] : '@ny';
    },

    N({ extra }) {
      return _ => extra ? extra[3] : '@N';
    },

    repeat: (
      make_sequence('')
    ),

    multiple: (
      make_sequence(',')
    ),

    ['multiple-with-space']: (
      make_sequence(' ')
    ),

    pick({ context }) {
      return expand((...args) => {
        return push_stack(context, 'last_pick', pick(args));
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
        return push_stack(context, 'last_pick', value);
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
        return push_stack(context, 'last_pick', value);
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
        return push_stack(context, 'last_rand', value);
      };
    },
    
    nrand({ context }) {
      return (...args) => {
        let transform_type = args.every(is_letter)
          ? by_charcode
          : by_unit;
        let value = transform_type(nrand).apply(null, args);
        return push_stack(context, 'last_rand', value);
      };
    },

    ['rand-int']({ context }) {
      return (...args) => {
        let transform_type = args.every(is_letter)
          ? by_charcode
          : by_unit;
        let rand_int = (...args) => Math.round(rand(...args))
        let value = transform_type(rand_int).apply(null, args)
        return push_stack(context, 'last_rand', value);
      }
    },

    ['nrand-int']({ context }) {
      return (...args) => {
        let transform_type = args.every(is_letter)
          ? by_charcode
          : by_unit;
        let nrand_int = (...args) => Math.round(nrand(...args))
        let value = transform_type(nrand_int).apply(null, args)
        return push_stack(context, 'last_rand', value);
      }
    },

    ['last-rand']({ context }) {
      return (n = 1) => {
        let stack = context.last_rand;
        return stack ? stack.last(n) : '';
      };
    },

    stripe() {
      return (...input) => {
        let colors = input.map(get_value);
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
            if (custom_sizes.length) {
              let [color, size] = parse_value_group(step);
              let prefix = prev ? (prev + ' + ') : '';
              prev = prefix + (size !== undefined ? size : default_size);
              return `${color} 0 calc(${ prev })`
            }
            return `${step} 0 ${100 / max * (i + 1)}%`
          })
          .join(',');
      }
    },

    calc() {
      return value => calc(get_value(value));
    },

    hex() {
      return value => parseInt(get_value(value)).toString(16);
    },

    svg: lazy(input => {
      if (input === undefined) return '';
      let svg = normalize_svg(get_value(input()).trim());
      return create_svg_url(svg);
    }),

    ['svg-filter']: lazy(input => {
      if (input === undefined) return '';
      let id = unique_id('filter-');
      let svg = normalize_svg(get_value(input()).trim())
        .replace(
          /<filter([\s>])/,
          `<filter id="${ id }"$1`
        );
      return create_svg_url(svg, id);
    }),

    var() {
      return value => `var(${ get_value(value) })`;
    },

    t() {
      return value => `var(--${ uniform_time.name })`;
    },

    shape() {
      return memo('shape-function', (type = '', ...args) => {
        type = String(type).trim();
        if (!type.length) return 'polygon()';
        if (typeof shapes[type] === 'function') {
          return shapes[type](args);
        } else {
          let commands = type;
          let rest = args.join(',');
          if (rest.length) {
            commands = type + ',' + rest;
          }
          let config = parse_shape_commands(commands);
          return custom_shape(config);
        }
      });
    },

    doodle() {
      return value => value;
    },

    shaders() {
      return value => value;
    }

  };

  function make_sequence(c) {
    return lazy((n, action) => {
      if (!action || !n) return '';
      let count = get_value(n());
      return sequence(count, (i, x, y, max) => get_value(action(i, x, y, max))).join(c);
    });
  }

  function push_stack(context, name, value) {
    if (!context[name]) context[name] = new Stack();
    context[name].push(value);
    return value;
  }

  return alias_for(Expose, {
    'm': 'multiple',
    'M': 'multiple-with-space',

    'r':    'rand',
    'nr':   'nrand',
    'ri':   'rand-int',
    'nri':  'nrand-int',
    'lr':   'last-rand',

    'p':  'pick',
    'pn': 'pick-n',
    'pd': 'pick-d',
    'lp': 'last-pick',

    'rep': 'repeat',

    'i': 'index',
    'x': 'col',
    'y': 'row',
    'z': 'depth',

    'I': 'size',
    'X': 'size-col',
    'Y': 'size-row',
    'Z': 'size-depth',

    // legacy names
    'ms': 'multiple-with-space',
    's':  'size',
    'sx': 'size-col',
    'sy': 'size-row',
    'sz': 'size-depth',
    'size-x': 'size-col',
    'size-y': 'size-row',
    'size-z': 'size-depth',
    'multi': 'multiple',
    'pick-by-turn': 'pick-n',
    'max-row': 'size-row',
    'max-col': 'size-col',

    // error prone
    'stripes': 'stripe',
    'strip':   'stripe',
  });
}

export default get_exposed;
