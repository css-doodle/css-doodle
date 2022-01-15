import { create_svg_url, normalize_svg, generate_svg } from './svg';

import list from './utils/list';
import random_func from './utils/random';

import { cell_id, is_letter, alias_for } from './utils/index';
import { lazy, clamp, sequence, get_value } from './utils/index';

import by_unit from './utils/by-unit';
import by_charcode from './utils/by-charcode';
import calc from './calc';
import expand from './utils/expand';
import Stack from './utils/stack';
import memo from './utils/memo';
import Noise from './utils/noise';

import { shapes, create_shape_points } from './shapes';
import parse_value_group from './parser/parse-value-group';
import parse_shape_commands from './parser/parse-shape-commands';
import parse_svg from './parser/parse-svg';
import parse_svg_path from './parser/parse-svg-path';

import { uniform_time } from './uniform';

function get_exposed(random) {
  const { shuffle } = list(random);
  const { pick, rand, lerp, unique_id } = random_func(random);

  const Expose = {

    i({ count }) {
      return _ => count;
    },

    y({ y }) {
      return _ => y;
    },

    x({ x }) {
      return _ => x;
    },

    z({ z }) {
      return _ => z;
    },

    I({ grid }) {
      return _ => grid.count;
    },

    Y({ grid }) {
      return _ => grid.y;
    },

    X({ grid }) {
      return _ => grid.x;
    },

    Z({ grid }) {
      return _ => grid.z;
    },

    id({ x, y, z }) {
      return _ => cell_id(x, y, z);
    },

    n({ extra }) {
      return n => extra ? (extra[0] + (Number(n) || 0)) : '@n';
    },

    nx({ extra }) {
      return n => extra ? (extra[1] + (Number(n) || 0)) : '@nx';
    },

    ny({ extra }) {
      return n => extra ? (extra[2] + (Number(n) || 0)) : '@ny';
    },

    N({ extra }) {
      return n => extra ? (extra[3] + (Number(n) || 0)) : '@N';
    },

    µ: (
      make_sequence('')
    ),

    m: (
      make_sequence(',')
    ),

    M: (
      make_sequence(' ')
    ),

    p({ context }) {
      return expand((...args) => {
        return push_stack(context, 'last_pick', pick(args));
      });
    },

    pn({ context, extra, position }) {
      let counter = 'pn-counter' + position;
      return expand((...args) => {
        if (!context[counter]) context[counter] = 0;
        context[counter] += 1;
        let max = args.length;
        let [idx = context[counter]] = extra || [];
        let pos = (idx - 1) % max;
        let value = args[pos];
        return push_stack(context, 'last_pick', value);
      });
    },

    pd({ context, extra, position }) {
      let counter = 'pd-counter' + position;
      let values = 'pd-values' + position;
      return expand((...args) => {
        if (!context[counter]) context[counter] = 0;
        context[counter] += 1;
        if (!context[values]) {
          context[values] = shuffle(args || []);
        }
        let max = args.length;
        let [idx = context[counter]] = extra || [];
        let pos = (idx - 1) % max;
        let value = context[values][pos];
        return push_stack(context, 'last_pick', value);
      });
    },

    lp({ context }) {
      return (n = 1) => {
        let stack = context.last_pick;
        return stack ? stack.last(n) : '';
      };
    },

    r({ context }) {
      return (...args) => {
        let transform_type = args.every(is_letter)
          ? by_charcode
          : by_unit;
        let value = transform_type(rand).apply(null, args);
        return push_stack(context, 'last_rand', value);
      };
    },

    ri({ context }) {
      return (...args) => {
        let transform_type = args.every(is_letter)
          ? by_charcode
          : by_unit;
        let rand_int = (...args) => Math.round(rand(...args))
        let value = transform_type(rand_int).apply(null, args)
        return push_stack(context, 'last_rand', value);
      }
    },

    rn({ x, y, context, position, grid, extra }) {
      let counter = 'noise-2d' + position;
      let [ni, nx, ny, nm, NX, NY] = extra || [];
      let isSeqContext = (ni && nm);
      return (...args) => {
        let [start, end = start, freq = 1, amp = 1] = args;
        if (args.length == 1) {
          [start, end] = [0, start];
        }
        if (!context[counter]) {
          context[counter] = new Noise(random);
        }
        freq = normalize(freq);
        amp = normalize(amp);
        let transform = [start, end].every(is_letter) ? by_charcode : by_unit;
        let t = isSeqContext
          ? context[counter].noise((nx - 1)/NX * freq, (ny - 1)/NY * freq, 0)
          : context[counter].noise((x - 1)/grid.x * freq, (y - 1)/grid.y * freq, 0);
        let fn = transform((start, end) => map2d(t * amp, start, end, amp));
        let value = fn(start, end);
        return push_stack(context, 'last_rand', value);
      };
    },

    lr({ context }) {
      return (n = 1) => {
        let stack = context.last_rand;
        return stack ? stack.last(n) : '';
      };
    },

    noise({ context, grid, position, ...rest }) {
      let vars = {
        i: rest.count, I: grid.count,
        x: rest.x, X: grid.x,
        y: rest.y, Y: grid.y,
        z: rest.z, Z: grid.z,
      };
      return (x, y, z = 0) => {
        let counter = 'raw-noise-2d' + position;
        if (!context[counter]) {
          context[counter] = new Noise(random);
        }
        return context[counter].noise(
          calc(x, vars),
          calc(y, vars),
          calc(z, vars)
        );
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
        return colors.map((step, i) => {
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

    svg: lazy((...args) => {
      let value = args.map(input => get_value(input()).trim()).join(',');
      if (!value.startsWith('<')) {
        let parsed = parse_svg(value);
        value = generate_svg(parsed);
      }
      let svg = normalize_svg(value);
      return create_svg_url(svg);
    }),

    filter: lazy((...args) => {
      let value = args.map(input => get_value(input()).trim()).join(',');
      let id = unique_id('filter-');
      if (!value.startsWith('<')) {
        let parsed = parse_svg(value, {
          type: 'block',
          name: 'filter'
        });
        value = generate_svg(parsed);
      }
      let svg = normalize_svg(value).replace(
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

    plot({ count, context, extra, position, grid }) {
      let key = 'offset-points' + position;
      return commands => {
        let [idx = count, _, __, max = grid.count] = extra || [];
        if (!context[key]) {
          let config = parse_shape_commands(commands);
          delete config['fill'];
          delete config['fill-rule'];
          delete config['frame'];
          config.points = max;
          context[key] = create_shape_points(config, {min: 1, max: 65536});
        }
        return context[key][idx - 1];
      };
    },

    shape() {
      return memo('shape-function', (type = '', ...args) => {
        type = String(type).trim();
        let points = [];
        if (type.length) {
          if (typeof shapes[type] === 'function') {
            points = shapes[type](args);
          } else {
            let commands = type;
            let rest = args.join(',');
            if (rest.length) {
              commands = type + ',' + rest;
            }
            let config = parse_shape_commands(commands);
            points = create_shape_points(config, {min: 3, max: 3600});
          }
        }
        return `polygon(${points.join(',')})`;
      });
    },

    doodle() {
      return value => value;
    },

    shaders() {
      return value => value;
    },

    canvas() {
      return value => value;
    },

    pattern() {
      return value => value;
    },

    invert() {
      return commands => {
        let parsed = parse_svg_path(commands);
        if (!parsed.valid) return commands;
        return parsed.commands.map(({ name, value }) => {
          switch (name) {
            case 'v': return 'h' + value.join(' ');
            case 'V': return 'H' + value.join(' ');
            case 'h': return 'v' + value.join(' ');
            case 'H': return 'V' + value.join(' ');
            default:  return name + value.join(' ');
          }
        }).join(' ');
      };
    },

    flipH() {
      return commands => {
        let parsed = parse_svg_path(commands);
        if (!parsed.valid) return commands;
        return parsed.commands.map(({ name, value }) => {
          switch (name) {
            case 'h':
            case 'H': return name + value.map(flip_value).join(' ');
            default:  return name + value.join(' ');
          }
        }).join(' ');
      };
    },

    flipV() {
      return commands => {
        let parsed = parse_svg_path(commands);
        if (!parsed.valid) return commands;
        return parsed.commands.map(({ name, value }) => {
          switch (name) {
            case 'v':
            case 'V': return name + value.map(flip_value).join(' ');
            default:  return name + value.join(' ');
          }
        }).join(' ');
      };
    },

    flip(...args) {
      let flipH = Expose.flipH(...args);
      let flipV = Expose.flipV(...args);
      return commands => {
        return flipV(flipH(commands));
      }
    },

    reverse(...args) {
      return commands => {
        let parsed = parse_svg_path(commands);
        if (!parsed.valid) return commands;
        return parsed.commands.reverse().map(({ name, value }) => {
          return name + value.join(' ');
        }).join(' ');
      }
    },

  };

  function make_sequence(c) {
    return lazy((n, ...actions) => {
      if (!actions || !n) return '';
      let count = get_value(n());
      let evaluated = calc(count);
      if (evaluated === 0) {
        evaluated = count;
      }
      return sequence(
        evaluated,
        (...args) => {
          return actions.map(action => {
            return get_value(action(...args))
          }).join(',');
        }
      ).join(c);
    });
  }

  function push_stack(context, name, value) {
    if (!context[name]) context[name] = new Stack();
    context[name].push(value);
    return value;
  }

  function flip_value(num) {
    return -1 * num;
  }

  function map2d(value, min, max, amp = 1) {
    let dimention = 2;
    let v = Math.sqrt(dimention / 4) * amp;
    let [ma, mb] = [-v, v];
    return lerp((value - ma) / (mb - ma), min * amp, max * amp);
  }

  function normalize(value) {
    value = Number(value) || 0;
    return value < 0 ? 0 : value;
  }

  return alias_for(Expose, {
    'index': 'i',
    'col': 'x',
    'row': 'y',
    'depth': 'z',
    'rand': 'r',
    'pick': 'p',

    // error prone
    'stripes': 'stripe',
    'strip':   'stripe',
    'patern':  'pattern',
    'flipv': 'flipV',
    'fliph': 'flipH',

    // legacy names, keep them before 1.0
    'svg-filter': 'filter',
    'last-rand': 'lr',
    'last-pick': 'lp',
    'multiple': 'm',
    'multi': 'm',
    'rep': 'µ',
    'repeat': 'µ',
    'ms': 'M',
    's':  'I',
    'size': 'I',
    'sx': 'X',
    'size-x': 'X',
    'size-col': 'X',
    'max-col': 'X',
    'sy': 'Y',
    'size-y': 'Y',
    'size-row': 'Y',
    'max-row': 'Y',
    'sz': 'Z',
    'size-z': 'Z',
    'size-depth': 'Z',
    'pick-by-turn': 'pn',
    'pick-n': 'pn',
    'pick-d': 'pd',
    'offset': 'plot',
    'Offset': 'Plot',
    'point': 'plot',
    'Point': 'Plot',
    'paint': 'canvas',
  });
}

export default get_exposed;
