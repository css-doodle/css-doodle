import parse_value_group from './parser/parse-value-group.js';
import parse_svg from './parser/parse-svg.js';
import parse_svg_path from './parser/parse-svg-path.js';
import parse_compound_value from './parser/parse-compound-value.js';

import generate_svg from './generator/svg.js';
import generate_shape from './generator/shapes.js';

import Noise from './lib/noise.js';
import calc from './calc.js';
import { memo } from './cache.js';

import { utime, UTime, umousex, umousey, uwidth, uheight } from './uniforms.js';

import { create_svg_url, normalize_svg } from './utils/svg.js';
import { by_unit, by_charcode } from './utils/transform.js';
import expand from './utils/expand.js';
import Stack from './utils/stack.js';
import get_named_arguments from './utils/get-named-arguments.js';
import { cell_id, is_letter, is_nil, is_empty, add_alias, unique_id, lerp, lazy, clamp, sequence, get_value, last } from './utils/index.js';
import { create_svg_gradient } from './utils/create-svg-gradient.js';
import { getEasingFunction } from './easing.js';

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

function compute_var(input, unit) {
  return [`calc(${input})`, unit];
}

function calc_value(base, v) {
  if (is_empty(v) || is_empty(base)) {
    return [];
  }
  if (/^[\+\*\-\/%][\-\.\d\s]/.test(v)) {
    let op = v[0];
    let { unit = '', value } = parse_compound_value(v.substr(1).trim() || 0);
    if (/var\(/.test(base)) {
      return op === '%'
        ? compute_var(`mod(${base}, ${value})`, unit)
        : compute_var(`${base} ${op} ${value}`, unit);
    }
    return [compute(op, Number(base), Number(value)), unit];
  }
  else if (/[\+\*\-\/%]$/.test(v)) {
    let op = v.substr(-1);
    let { unit = '', value } = parse_compound_value(v.substr(0, v.length - 1).trim() || 0);
    if (/var\(/.test(base)) {
      return op === '%'
        ? compute_var(`mod(${value}, ${base})`, unit)
        : compute_var(`${value} ${op} ${base}`, unit);
    }
    return [compute(op, Number(value), Number(base)), unit];
  } else {
    let { unit = '', value } = parse_compound_value(v || 0);
    return [(Number(base) + (Number(value) || 0)), unit];
  }
}

function calc_with(base) {
  let unit = '';
  return (...args) => {
    for (let v of args) {
      let [output, output_unit] = calc_value(base, v);
      base = output;
      if (!unit && output_unit) {
        unit = output_unit;
      }
    }

    if (/^calc\(/.test(base)) {
      return `calc(${base} * 1${unit})`;
    }
    return base + unit;
  }
}

function calc_with_easing(t) {
  return (head = '', ...args) => {
    if (/^[a-zA-Z]/.test(head)) {
      let easing = getEasingFunction(head);
      return calc_with(easing(t))(...args);
    }
    let _args = [].concat(head, args).filter(n => n !== '');
    return calc_with(t)(..._args);
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

  iI({ count, grid }) {
    return calc_with_easing(count/grid.count);
  },

  Ii({ count, grid }) {
    return calc_with_easing((grid.count - count + 1) / grid.count);
  },

  xX({ x, grid }) {
    return calc_with_easing(x/grid.x);
  },

  Xx({ x, grid }) {
    return calc_with_easing((grid.x - x + 1) / grid.x);
  },

  yY({ y, grid }) {
    return calc_with_easing(y/grid.y);
  },

  Yy({ y, grid }) {
    return calc_with_easing((grid.y - y + 1) / grid.y);
  },

  id({ x, y, z }) {
    return _ => cell_id(x, y, z);
  },

  dx({ x, grid }) {
    return calc_with(x - .5 - grid.x / 2);
  },

  dy({ y, grid }) {
    return calc_with(y - .5 - grid.y / 2);
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

  nd({ extra }) {
    let lastExtra = last(extra);
    if (lastExtra) {
      let n = lastExtra[0];
      let N = lastExtra[3];
      return d => {
        d = Number(d) || 0;
        return calc_with(n - .5 - d - N / 2);
      }
    }
    return '@nd';
  },

  N({ extra }) {
    let lastExtra = last(extra);
    return lastExtra ? calc_with(lastExtra[3]) : '@N';
  },

  nN({ extra }) {
    let lastExtra = last(extra);
    return lastExtra ? calc_with_easing(lastExtra[0]/lastExtra[3]) : '@nN';
  },

  Nn({ extra }) {
    let lastExtra = last(extra);
    if (lastExtra) {
      let n = lastExtra[0];
      let N = lastExtra[3];
      return calc_with_easing((N - n + 1) / N);
    }
    return '@Nn';
  },

  m: make_sequence(','),

  M: make_sequence(' '),

  µ: make_sequence(''),

  match({ extra, x, y, z, count, grid }) {
    let [n, nx, ny, N] = last(extra) || [];
    let variables = { x, y, z, i: count, I: grid.count, X: grid.x, Y: grid.y, Z: grid.z };
    if (!is_nil(n)) variables.n = n;
    if (!is_nil(nx)) variables.nx = nx;
    if (!is_nil(ny)) variables.ny = ny;
    if (!is_nil(N)) variables.N = N;
    return (...args) => {
      if (args.length <= 1) {
        return '';
      }
      if (args.length <= 3) {
        let [expr, pass, fail = ''] = args;
        let result = !!calc(expr, variables);
        return result ? pass : fail;
      }
      for (let i = 0; i < args.length; i += 2) {
        let expr = args[i];
        let pass = args[i + 1];
        if (is_nil(pass)) {
          return expr;
        }
        if (!!calc(expr, variables)) {
          return pass;
        }
      }
    }
  },

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

  pl({ context, extra, upextra, position }, upstream) {
    let lastExtra = upstream
      ? last(upextra.length ? upextra : extra)
      : last(extra);
    let sig = lastExtra ? last(lastExtra) : '';
    let counter = (upstream ? 'PL-counter' : 'pl-counter') + position + sig;
    return expand((...args) => {
      if (!context[counter]) context[counter] = 0;
      context[counter] += 1;
      let max = args.length;
      let idx = lastExtra && lastExtra[6];
      idx ??= context[counter];
      let pos = (idx - 1) % max;
      let value = args[pos];
      return push_stack(context, 'last_pick', value);
    });
  },

  PL(arg) {
    return Expose.pl(arg, true);
  },

  pr({ context, extra, upextra, position }, upstream) {
    let lastExtra = upstream
      ? last(upextra.length ? upextra : extra)
      : last(extra);
    let sig = lastExtra ? last(lastExtra) : '';
    let counter = (upstream ? 'PR-counter' : 'pr-counter') + position + sig;
    return expand((...args) => {
      if (!context[counter]) context[counter] = 0;
      context[counter] += 1;
      let max = args.length;
      let idx = lastExtra && lastExtra[6];
      idx ??= context[counter];
      let pos = (idx - 1) % max;
      let value = args[max - pos - 1];
      return push_stack(context, 'last_pick', value);
    });
  },

  PR(arg) {
    return Expose.pr(arg, true);
  },

  pd({ context, extra, upextra, position, shuffle }, upstream) {
    let lastExtra = upstream
      ? last(upextra.length ? upextra : extra)
      : last(extra);
    let sig = lastExtra ? last(lastExtra) : '';
    let counter = (upstream ? 'PD-counter' : 'pd-counter') + position  + sig;
    let values = (upstream ? 'PD-valeus' : 'pd-values') + position + sig;
    return expand((...args) => {
      if (!context[counter]) context[counter] = 0;
      context[counter] += 1;
      if (!context[values]) {
        context[values] = shuffle(args || []);
      }
      let max = args.length;
      let idx = lastExtra && lastExtra[6];
      idx ??= context[counter];
      let pos = (idx - 1) % max;
      let value = context[values][pos];
      return push_stack(context, 'last_pick', value);
    });
  },

  PD(arg) {
    return Expose.pd(arg, true);
  },

  lp({ context }) {
    return (n = 1) => {
      let stack = context.last_pick;
      return stack ? stack.last(n) : '';
    };
  },

  r({ context, rand }) {
    return (...args) => {
      let transform = (args.length && args.every(is_letter))
        ? by_charcode
        : by_unit;
      let value = transform(rand)(...args);
      return push_stack(context, 'last_rand', value);
    };
  },

  ri({ context, rand }) {
    return (...args) => {
      let transform = args.every(is_letter)
        ? by_charcode
        : by_unit;
      let rand_int = (...args) => Math.round(rand(...args));
      let value = transform(rand_int)(...args);
      return push_stack(context, 'last_rand', value);
    }
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
      let colors = input.map(get_value).flat();
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
    return (value, context) => {
      return calc(get_value(value), context);
    }
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
    let commands = args.map(input => get_value(input())).join(',');
    let { rules, points } = generate_shape(commands, {min: 3, max: 65536}, rules => {
      delete rules.frame;
      rules['unit'] = 'none';
      rules['stroke-width'] ??= .01;
      rules['stroke'] ??= 'currentColor';
      rules['fill'] ??= 'none';
      return rules;
    });
    let style = `points: ${points};`;
    let props = '';
    let p = rules.padding ?? Number(rules['stroke-width']) / 2;
    for (let name of Object.keys(rules)) {
      if (/^(stroke|fill|clip|marker|mask|animate|draw)/.test(name)) {
        props += `${name}: ${rules[name]};`
      }
    };
    let parsed = parse_svg(`
      viewBox: -1 -1 2 2 p ${p};
      polygon {
        ${props} ${style}
      }
    `);
    return create_svg_url(generate_svg(parsed));
  }),

  linearGradient: lazy((_, ...args) => create_svg_gradient('linearGradient', args)),

  radialGradient: lazy((_, ...args) => create_svg_gradient('radialGradient', args)),

  var() {
    return value => `var(${get_value(value)})`;
  },

  ut() {
    return calc_with(`var(--${utime.name})`);
  },

  ts() {
    return calc_with(`calc(var(--${utime.name}) / 1000)`);
  },

  TS() {
    return calc_with(`calc(var(--${UTime.name}) / 1000)`);
  },

  UT() {
    return calc_with(`var(--${UTime.name})`);
  },

  uw() {
    return calc_with(`var(--${uwidth.name})`);
  },

  uh() {
    return calc_with(`var(--${uheight.name})`);
  },

  ux() {
    return calc_with(`var(--${umousex.name})`);
  },

  uy() {
    return calc_with(`var(--${umousey.name})`);
  },

  plot({ count, context, extra, position, grid }) {
    let lastExtra = last(extra);
    return (...args) => {
      let commands = args.join(',');
      let [idx = count, _, __, max = grid.count] = lastExtra || [];
      let { points, rules } = generate_shape(commands, {min: 1, max: 65536, count: max}, rules => {
        delete rules['fill'];
        delete rules['fill-rule'];
        delete rules['frame'];
        if (rules.split || rules.points) {
          rules.hasPoints = true;
        } else {
          rules.points = max;
        }
        return rules;
      });
      return rules.hasPoints ? points : points[idx - 1];
    };
  },

  Plot({ count, context, extra, position, grid }) {
    let lastExtra = last(extra);
    return (...args) => {
      let commands = args.join(',');
      let [idx = count, _, __, max = grid.count] = lastExtra || [];
      let { points, rules } = generate_shape(commands, {min: 1, max: 65536, count: max}, rules => {
        delete rules['fill'];
        delete rules['fill-rule'];
        delete rules['frame'];
        if (rules.split || rules.points) {
          rules.hasPoints = true;
        } else {
          rules.points = max;
        }
        rules.unit = rules.unit || 'none';
        return rules;
      });
      return rules.hasPoints ? points : points[idx - 1];
    };
  },

  shape() {
    return memo('shape-function', (...args) => {
      let commands = args.join(',');
      let { points } = generate_shape(commands);
      return `polygon(${points.join(',')})`;
    });
  },

  doodle() {
    return value => value;
  },

  shaders() {
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
      args = args.map(n => '<' + n + '>');
      let list = [];
      let separator;
      if (args.length == 1) {
        separator = ' ';
        list = parse_value_group(args[0], { symbol: separator });
      } else {
        separator = ',';
        list = parse_value_group(args.map(get_value).join(separator), { symbol: separator});
      }
      list = list.map(n => n.replace(/^\<|>$/g,''));
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

  code() {
    return (...args) => {
      return args.map(code => String.fromCharCode(code));
    }
  },

  once: lazy(({context, extra, position}, ...args) => {
    let counter = 'once-counter' + position;
    return context[counter] ??= args.map(input => get_value(input())).join(',');
  }),

  raw({ rules }) {
    return (...args) => {
      let raw = args.join(',');
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
  },

  'google-font': () => {
    return (name) => {
      return { value: name, gf: true };
    }
  },

}, {

  'index': 'i',
  'col': 'x',
  'row': 'y',
  'depth': 'z',
  'rand': 'r',
  'pick': 'p',
  'pn':   'pl',
  'pnr':  'pr',
  'PN':   'PL',
  'PNR':  'PR',
  'R':    'rn',
  'T':    'UT',
  't':    'ut',

  // error prone
  'stripes': 'stripe',
  'strip':   'stripe',
  'patern':  'pattern',
  'flipv': 'flipV',
  'fliph': 'flipH',

  // legacy names, keep them before 1.0
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
  'unicode': 'code'
});

export default Expose;
