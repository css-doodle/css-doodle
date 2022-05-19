import { create_svg_url, normalize_svg } from './utils/svg.js';
import { generate_svg } from './generator/svg.js';

import { cell_id, is_letter, add_alias, unique_id, lerp } from './utils/index.js';
import { lazy, clamp, sequence, get_value } from './utils/index.js';
import { by_unit, by_charcode } from './utils/transform.js';
import { last } from './utils/list.js';

import calc from './calc.js';
import { memo } from './utils/memo.js';
import { expand } from './utils/expand.js';
import Stack from './utils/stack.js';
import Noise from './utils/noise.js';

import { shapes, create_shape_points } from './generator/shapes.js';
import parse_value_group from './parser/parse-value-group.js';
import parse_shape_commands from './parser/parse-shape-commands.js';
import parse_svg from './parser/parse-svg.js';
import parse_svg_path from './parser/parse-svg-path.js';

import * as Uniforms from './uniforms.js';

function make_sequence(c) {
  return lazy((n, ...actions) => {
    if (!actions || !n) return '';
    let count = get_value(n());
    let evaluated = count;
    if (/\D/.test(count)){
      evaluated = calc(count);
      if (evaluated === 0) {
        evaluated = count;
      }
    }
    let signature = Math.random();
    return sequence(
      evaluated,
      (...args) => {
        return actions.map(action => {
          return get_value(action(...args, signature))
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

const Expose = add_alias({

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
    let lastExtra = last(extra);
    return n => lastExtra ? (lastExtra[0] + (Number(n) || 0)) : '@n';
  },

  nx({ extra }) {
    let lastExtra = last(extra);
    return n => lastExtra ? (lastExtra[1] + (Number(n) || 0)) : '@nx';
  },

  ny({ extra }) {
    let lastExtra = last(extra);
    return n => lastExtra ? (lastExtra[2] + (Number(n) || 0)) : '@ny';
  },

  N({ extra }) {
    let lastExtra = last(extra);
    return n => lastExtra ? (lastExtra[3] + (Number(n) || 0)) : '@N';
  },

  m: make_sequence(','),

  M: make_sequence(' '),

  µ: make_sequence(''),

  p({ context, pick }) {
    return expand((...args) => {
      if (!args.length) {
        args = context.last_pick_args || [];
      }
      let picked = pick(args);
      context.last_pick_args = args;
      return push_stack(context, 'last_pick', picked);
    });
  },

  P({ context, pick, position }) {
    let counter = 'P-counter' + position;
    return expand((...args) => {
      let normal = true;
      if (!args.length) {
        args = context.last_pick_args || [];
        normal = false;
      }
      let stack = context.last_pick;
      let last = stack ? stack.last(1) : '';
      if (normal) {
        if (!context[counter]) {
          context[counter] = {};
        }
        last = context[counter].last_pick;
      }
      if (args.length > 1) {
        let i = args.findIndex(n => n === last);
        if (i !== -1) {
          args.splice(i, 1);
        }
      }
      let picked = pick(args);
      context.last_pick_args = args;
      if (normal) {
        context[counter].last_pick = picked;
      }
      return push_stack(context, 'last_pick', picked);
    });
  },

  pn({ context, extra, position }) {
    let lastExtra = last(extra);
    let sig = lastExtra ? last(lastExtra) : '';
    let counter = 'pn-counter' + position + sig;
    return expand((...args) => {
      if (!context[counter]) context[counter] = 0;
      context[counter] += 1;
      let max = args.length;
      let [idx = context[counter]] = lastExtra || [];
      let pos = (idx - 1) % max;
      let value = args[pos];
      return push_stack(context, 'last_pick', value);
    });
  },

  pd({ context, extra, position, shuffle }) {
    let lastExtra = last(extra);
    let sig = lastExtra ? last(lastExtra) : '';
    let counter = 'pd-counter' + position  + sig;
    let values = 'pd-values' + position + sig;;
    return expand((...args) => {
      if (!context[counter]) context[counter] = 0;
      context[counter] += 1;
      if (!context[values]) {
        context[values] = shuffle(args || []);
      }
      let max = args.length;
      let [idx = context[counter]] = lastExtra || [];
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

  r({ context, rand }) {
    return (...args) => {
      let transform = args.every(is_letter)
        ? by_charcode
        : by_unit;
      let value = transform(rand)(...args);
      return push_stack(context, 'last_rand', value);
    };
  },

  rn({ x, y, context, position, grid, extra, shuffle }) {
    let counter = 'noise-2d' + position;
    let [ni, nx, ny, nm, NX, NY] = last(extra) || [];
    let isSeqContext = (ni && nm);
    return (...args) => {
      let [start, end = start, freq = 1, amp = 1] = args;
      if (args.length == 1) {
        [start, end] = [0, start];
      }
      if (!context[counter]) {
        context[counter] = new Noise(shuffle);
      }
      freq = clamp(freq, 0, Infinity);
      amp = clamp(amp, 0, Infinity);
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

  noise({ context, grid, position, shuffle, ...rest }) {
    let vars = {
      i: rest.count, I: grid.count,
      x: rest.x, X: grid.x,
      y: rest.y, Y: grid.y,
      z: rest.z, Z: grid.z,
    };
    return (x, y, z = 0) => {
      let counter = 'raw-noise-2d' + position;
      if (!context[counter]) {
        context[counter] = new Noise(shuffle);
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
    let value = args.map(input => get_value(input())).join(',');
    if (!value.startsWith('<')) {
      let parsed = parse_svg(value);
      value = generate_svg(parsed);
    }
    let svg = normalize_svg(value);
    return create_svg_url(svg);
  }),

  filter: lazy((...args) => {
    let values = args.map(input => get_value(input()));
    let value = values.join(',');
    let id = unique_id('filter-');
    // shorthand
    if (values.every(n => /^[\d.]/.test(n))) {
      let [fq = 1, scale = 1, octave, seed] = values;
      let [bx, by = bx] = parse_value_group(fq);
      octave = octave ? `numOctaves: ${octave};` : '';
      seed = seed ? `seed: ${seed};` : '';
      value = `
        feTurbulence {
          type: fractalNoise;
          baseFrequency: ${bx} ${by};
          ${octave} ${seed}
        }
        feDisplacementMap {
          in: SourceGraphic;
          scale: ${scale};
        }
      `
    }
    // new svg syntax
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

  ut() {
    return value => `var(--${ Uniforms.uniform_time.name })`;
  },

  uw() {
    return value => `var(--${ Uniforms.uniform_width.name })`;
  },

  uh() {
    return value => `var(--${ Uniforms.uniform_height.name })`;
  },

  ux() {
    return value => `var(--${ Uniforms.uniform_mousex.name })`;
  },

  uy() {
    return value => `var(--${ Uniforms.uniform_mousey.name })`;
  },

  plot({ count, context, extra, position, grid }) {
    let key = 'offset-points' + position;
    let lastExtra = last(extra);
    return commands => {
      let [idx = count, _, __, max = grid.count] = lastExtra || [];
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

}, {

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
  't': 'ut',
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

export default Expose;
