import { create_svg_url, normalize_svg } from './utils/svg.js';
import { generate_svg } from './generator/svg.js';

import { cell_id, is_letter, is_nil, is_empty, add_alias, unique_id, lerp } from './utils/index.js';
import { lazy, clamp, sequence, get_value } from './utils/index.js';
import { by_unit, by_charcode } from './utils/transform.js';
import { last } from './utils/list.js';

import calc from './calc.js';
import { memo } from './utils/memo.js';
import { expand } from './utils/expand.js';
import Stack from './utils/stack.js';
import Noise from './utils/noise.js';
import get_named_arguments from './utils/get-named-arguments.js';

import { shapes, create_shape_points } from './generator/shapes.js';
import parse_value_group from './parser/parse-value-group.js';
import parse_shape_commands from './parser/parse-shape-commands.js';
import parse_svg from './parser/parse-svg.js';
import parse_svg_path from './parser/parse-svg-path.js';
import parse_compound_value from './parser/parse-compound-value.js';

import * as Uniforms from './uniforms.js';

function make_sequence(c) {
  return lazy((_, n, ...actions) => {
    if (!actions || !n) return '';
    let count = get_value(n());
    let evaluated = count;
    if (/\D/.test(count) && !/\d+[x-]\d+/.test(count)) {
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
  if (!context[name]) context[name] = new Stack(1024);
  context[name].push(value);
  return value;
}

function flip_value(num) {
  return -1 * num;
}

function map2d(value, min, max, amp = 1) {
  let dimension = 2;
  let v = Math.sqrt(dimension / 4) * amp;
  let [ma, mb] = [-v, v];
  return lerp((value - ma) / (mb - ma), min * amp, max * amp);
}

function compute(op, a, b) {
  switch (op) {
    case '+': return a + b;
    case '-': return a - b;
    case '*': return a * b;
    case '/': return a / b;
    case '%': return a % b;
    default: return 0;
  }
}

function calc_with(base) {
  return v => {
    if (is_empty(v) || is_empty(base)) {
      return base;
    }
    if (/^[+*-\/%][.\d\s]/.test(v)) {
      let op = v[0];
      let { unit = '', value } = parse_compound_value(v.substr(1).trim() || 0);
      return compute(op, base, value) + unit;
    }
    else if (/[+*-\/%]$/.test(v)) {
      let op = v.substr(-1);
      let { unit = '', value } = parse_compound_value(v.substr(0, v.length - 1).trim() || 0);
      return compute(op, value, base) + unit;
    } else {
      let { unit = '', value } = parse_compound_value(v || 0);
      return (base + value) + unit;
    }
  }
}

const Expose = add_alias({

  i({ count }) {
    return calc_with(count);
  },

  y({ y }) {
    return calc_with(y);
  },

  x({ x }) {
    return calc_with(x);
  },

  z({ z }) {
    return calc_with(z);
  },

  I({ grid }) {
    return calc_with(grid.count);
  },

  Y({ grid }) {
    return calc_with(grid.y);
  },

  X({ grid }) {
    return calc_with(grid.x);
  },

  Z({ grid }) {
    return calc_with(grid.z);
  },

  id({ x, y, z }) {
    return _ => cell_id(x, y, z);
  },

  dx({ x, grid }) {
    return n => {
      n = Number(n) || 0;
      return x - .5 - n - grid.x / 2;
    }
  },

  dy({ y, grid }) {
    return n => {
      n = Number(n) || 0;
      return y - .5 - n - grid.y / 2;
    }
  },

  n({ extra }) {
    let lastExtra = last(extra);
    return lastExtra ? calc_with(lastExtra[0]) : '@n';
  },

  nx({ extra }) {
    let lastExtra = last(extra);
    return lastExtra ? calc_with(lastExtra[1]) : '@nx';
  },

  ny({ extra }) {
    let lastExtra = last(extra);
    return lastExtra ? calc_with(lastExtra[2]) : '@ny';
  },

  N({ extra }) {
    let lastExtra = last(extra);
    return lastExtra ? calc_with(lastExtra[3]) : '@N';
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

  pl({ context, extra, position }) {
    let lastExtra = last(extra);
    let sig = lastExtra ? last(lastExtra) : '';
    let counter = 'pl-counter' + position + sig;
    return expand((...args) => {
      if (!context[counter]) context[counter] = 0;
      context[counter] += 1;
      let max = args.length;
      let idx = lastExtra && lastExtra[6];
      if (is_nil(idx)) idx = context[counter];
      let pos = (idx - 1) % max;
      let value = args[pos];
      return push_stack(context, 'last_pick', value);
    });
  },

  pr({ context, extra, position }) {
    let lastExtra = last(extra);
    let sig = lastExtra ? last(lastExtra) : '';
    let counter = 'pr-counter' + position + sig;
    return expand((...args) => {
      if (!context[counter]) context[counter] = 0;
      context[counter] += 1;
      let max = args.length;
      let idx = lastExtra && lastExtra[6];
      if (is_nil(idx)) idx = context[counter];
      let pos = (idx - 1) % max;
      let value = args[max - pos - 1];
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
      let idx = lastExtra && lastExtra[6];
      if (is_nil(idx)) idx = context[counter];
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

  rn({ x, y, context, position, grid, extra, random }) {
    let counter = 'noise-2d' + position;
    let counterX = counter + 'offset-x';
    let counterY = counter + 'offset-y';
    let [ni, nx, ny, nm, NX, NY] = last(extra) || [];
    let isSeqContext = (ni && nm);
    return (...args) => {
      let {from = 0, to = from, frequency = 1, scale = 1, octave = 1} = get_named_arguments(args, [
        'from', 'to', 'frequency', 'scale', 'octave'
      ]);

      frequency = clamp(frequency, 0, Infinity);
      scale = clamp(scale, 0, Infinity);
      octave = clamp(octave, 1, 100);

      if (args.length == 1) [from, to] = [0, from];
      if (!context[counter]) context[counter] = new Noise();
      if (!context[counterX]) context[counterX] = random();
      if (!context[counterY]) context[counterY] = random();

      let transform = (is_letter(from) && is_letter(to)) ? by_charcode : by_unit;
      let noise2d = context[counter];
      let offsetX = context[counterX];
      let offsetY = context[counterY];
      let _x = (isSeqContext ? ((nx - 1) / NX) : ((x - 1) / grid.x)) + offsetX;
      let _y = (isSeqContext ? ((ny - 1) / NY) : ((y - 1) / grid.y)) + offsetY;

      // 1-dimentional
      if (NX <= 1 || grid.x <= 1) _x = 0;
      if (NY <= 1 || grid.y <= 1) _y = 0;

      // 1x1
      if (_x == 0 && _y == 0) {
        _x = offsetX;
        _y = offsetY;
      }

      let t = noise2d.noise(_x * frequency, _y * frequency, 0) * scale;

      for (let i = 1; i < octave; ++i) {
        let i2 = i * 2;
        t += noise2d.noise(_x * frequency * i2, _y * frequency * i2, 0) * (scale / i2);
      }
      let fn = transform((from, to) => map2d(t, from, to, scale));
      return push_stack(context, 'last_rand', fn(from, to));
    };
  },

  lr({ context }) {
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

  svg: lazy((_, ...args) => {
    let value = args.map(input => get_value(input())).join(',');
    if (!value.startsWith('<')) {
      let parsed = parse_svg(value);
      value = generate_svg(parsed);
    }
    let svg = normalize_svg(value);
    return create_svg_url(svg);
  }),

  'svg-filter': lazy((upstream, ...args) => {
    let values = args.map(input => get_value(input()));
    let value = values.join(',');
    let id = unique_id('filter-');
    // shorthand
    if (values.every(n => /^[\-\d.]/.test(n) || (/^(\w+)/.test(n) && !/[{}<>]/.test(n)))) {
      let { frequency, scale, octave, seed = upstream.seed, blur, erode, dilate } = get_named_arguments(values, [
        'frequency', 'scale', 'octave', 'seed', 'blur', 'erode', 'dilate'
      ]);
      value = `
        x: -20%;
        y: -20%;
        width: 140%;
        height: 140%;
      `;
      if (!is_nil(dilate)) {
        value += `
          feMorphology {
            operator: dilate;
            radius: ${dilate};
          }
        `
      }
      if (!is_nil(erode)) {
        value += `
          feMorphology {
            operator: erode;
            radius: ${erode};
          }
        `
      }
      if (!is_nil(blur)) {
        value += `
          feGaussianBlur {
            stdDeviation: ${blur};
          }
        `
      }
      if (!is_nil(frequency)) {
        let [bx, by = bx] = parse_value_group(frequency);
        octave = octave ? `numOctaves: ${octave};` : '';
        value += `
          feTurbulence {
            type: fractalNoise;
            baseFrequency: ${bx} ${by};
            seed: ${seed};
            ${octave}
          }
        `;
        if (scale) {
          value += `
            feDisplacementMap {
              in: SourceGraphic;
              scale: ${scale};
            }
          `;
        }
      }
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

  'svg-pattern': lazy((_, ...args) => {
    let value = args.map(input => get_value(input())).join(',');
    let parsed = parse_svg(`
      viewBox: 0 0 1 1;
      preserveAspectRatio: xMidYMid slice;
      rect {
        width, height: 100%;
        fill: defs pattern { ${ value } }
      }
    `);
    let svg = generate_svg(parsed);
    return create_svg_url(svg);
  }),

  'svg-polygon': lazy((_, ...args) => {
    let value = args.map(input => get_value(input())).join(',');
    let config = parse_shape_commands(value);

    delete config.frame;
    config['unit'] = 'none';
    config['stroke-width'] ??= .01;
    config['stroke'] ??= 'currentColor';
    config['fill'] ??= 'none';

    let points = `points: ${create_shape_points(config, {min: 3, max: 65536})};`;
    let props = '';
    for (let name of Object.keys(config)) {
      if (/^(stroke|fill|clip|marker|mask|animate|draw)/.test(name)) {
        props += `${name}: ${config[name]};`
      }
    };
    let parsed = parse_svg(`
      viewBox: -1 -1 2 2 p ${Number(config['stroke-width'])/2};
      polygon {
        ${props} ${points}
      }
    `);
    return create_svg_url(generate_svg(parsed));
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

  Plot({ count, context, extra, position, grid }) {
    let key = 'Offset-points' + position;
    let lastExtra = last(extra);
    return commands => {
      let [idx = count, _, __, max = grid.count] = lastExtra || [];
      if (!context[key]) {
        let config = parse_shape_commands(commands);
        delete config['fill'];
        delete config['fill-rule'];
        delete config['frame'];
        config.points = max;
        config.unit = config.unit || 'none';
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

  reverse() {
    return (...args) => {
      let commands = args.map(get_value);
      let parsed = parse_svg_path(commands.join(','));
      if (parsed.valid) {
        let result = [];
        for (let i = parsed.commands.length - 1; i >= 0; --i) {
          let { name, value } = parsed.commands[i];
          result.push(name + value.join(' '));
        }
        return result.join(' ');
      }
      return commands.reverse();
    }
  },

  cycle() {
    return (...args) => {
      args = args.map(n => '(' + n + ')');
      let list = [];
      let separator;
      if (args.length == 1) {
        separator = ' ';;
        list = parse_value_group(args[0], { symbol: separator });
      } else {
        separator = ',';
        list = parse_value_group(args.map(get_value).join(separator), { symbol: separator});
      }
      list = list.map(n => n.replace(/^\(|\)$/g,''));
      let size = list.length - 1;
      let result = [list.join(separator)];
      // Just ignore the performance
      for (let i = 0; i < size; ++i) {
        let item = list.shift();
        list.push(item);
        result.push(list.join(separator));
      }
      return result;
    }
  },

  mirror() {
    return (...args) => {
      for (let i = args.length - 1; i >= 0; --i) {
        args.push(args[i]);
      }
      return args;
    }
  },

  Mirror() {
    return (...args) => {
      for (let i = args.length - 2; i >= 0; --i) {
        args.push(args[i]);
      }
      return args;
    }
  },

  unicode() {
    return (...args) => {
      return args.map(code => String.fromCharCode(code));
    }
  },

  once({ context, extra, position }) {
    let counter = 'once-counter' + position;
    return (...args) => {
      if (is_nil(context[counter])) {
        context[counter] = args;
      }
      return context[counter];
    }
  },

  raw({ rules }) {
    return (raw = '') => {
      try {
        let cut = raw.substring(raw.indexOf(',') + 1, raw.lastIndexOf('")'));
        if (raw.startsWith('${doodle') && raw.endsWith('}')) {
          let key = raw.substring(2, raw.length - 1);
          let doodles = rules.doodles;
          if (doodles && doodles[key]) {
            return `<css-doodle>${doodles[key].doodle}</css-doodle>`
          }
        }
        if (raw.startsWith('url("data:image/svg+xml;utf8')) {
          return decodeURIComponent(cut);
        }
        /* future forms */
        if (raw.startsWith('url("data:image/svg+xml;base64')) {
          return atob(cut);
        }
        if (raw.startsWith('url("data:image/png;base64')) {
          return `<img src="${raw}" alt="" />`;
        }
      } catch (e) {
        /* ignore */
      }
      return raw;
    }
  }

}, {

  'index': 'i',
  'col': 'x',
  'row': 'y',
  'depth': 'z',
  'rand': 'r',
  'pick': 'p',
  'pn':   'pl',
  'pnr':  'pr',

  // error prone
  'stripes': 'stripe',
  'strip':   'stripe',
  'patern':  'pattern',
  'flipv': 'flipV',
  'fliph': 'flipH',

  // legacy names, keep them before 1.0
  't': 'ut',
  'filter': 'svg-filter',
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
  'Svg': 'svg',
  'pick-by-turn': 'pl',
  'pick-n': 'pl',
  'pick-d': 'pd',
  'offset': 'plot',
  'Offset': 'Plot',
  'point': 'plot',
  'Point': 'Plot',
  'paint': 'canvas',
});

export default Expose;
