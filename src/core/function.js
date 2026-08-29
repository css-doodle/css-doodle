import parse_value_group from '../parser/parse-value-group.js';
import parse_svg from '../parser/parse-svg.js';
import parse_svg_path from '../parser/parse-svg-path.js';
import parse_compound_value from '../parser/parse-compound-value.js';

import generate_svg from '../generator/svg.js';
import generate_shape from '../generator/shapes.js';
import generate_svg_gradient from '../generator/svg-gradient.js';

import Noise from '../lib/noise.js';
import calc from './calc.js';
import { memo } from '../utils/cache.js';

import { utime, UTime, umousex, umousey, uwidth, uheight } from './uniforms.js';

import { create_svg_url, normalize_svg } from '../utils/svg.js';
import { by_unit, by_charcode } from '../utils/transform.js';
import expand from '../utils/expand.js';
import Stack from '../utils/stack.js';
import get_named_arguments from '../utils/get-named-arguments.js';
import { cell_id, cell_metrics } from '../utils/cell.js';
import { is_letter, is_nil, is_empty, get_value } from '../utils/type.js';
import { add_alias, unique_id, lazy } from '../utils/fn.js';
import { lerp, clamp } from '../utils/math.js';
import { sequence, last } from '../utils/list.js';
import { getEasingFunction } from './easing.js';
import { css } from '../utils/tagged-template.js';

const RE_OP_PREFIX = /^[\+\*\-\/%][\-\.\d\s]/;
const RE_OP_SUFFIX = /[\+\*\-\/%]$/;
const RE_VAR = /var\(/;
const RE_CALC = /^calc\(/;
const RE_LETTER = /^[a-zA-Z]/;

const SEQ = {
  n: 0,
  x: 1,
  y: 2,
  max: 3,
  X: 4,
  Y: 5,
  index: 6,
  sig: 7
};

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
  if (RE_OP_PREFIX.test(v)) {
    let op = v[0];
    let { unit = '', value } = parse_compound_value(v.slice(1).trim() || 0);
    if (RE_VAR.test(base)) {
      return op === '%'
        ? compute_var(`mod(${base}, ${value})`, unit)
        : compute_var(`${base} ${op} ${value}`, unit);
    }
    return [compute(op, Number(base), Number(value)), unit];
  }
  else if (RE_OP_SUFFIX.test(v)) {
    let op = v.slice(-1);
    let { unit = '', value } = parse_compound_value(v.slice(0, -1).trim() || 0);
    if (RE_VAR.test(base)) {
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

    if (RE_CALC.test(base)) {
      return `calc(${base} * 1${unit})`;
    }
    return base + unit;
  }
}

function calc_with_easing(t) {
  return (head = '', ...args) => {
    if (RE_LETTER.test(head)) {
      let easing = getEasingFunction(head);
      return calc_with(easing(t))(...args);
    }
    let _args = [].concat(head, args).filter(n => n !== '');
    return calc_with(t)(..._args);
  }
}

function map2d(value, min, max, amp = 1) {
  let v = Math.sqrt(2 / 4) * amp;
  let normalized = (value + v) / (2 * v);
  normalized = clamp(normalized, 0, 1);
  return lerp(normalized, min * amp, max * amp);
}

function flip_value(num) {
  return -1 * num;
}

function push_stack(context, name, value) {
  if (!context[name]) context[name] = new Stack(1024);
  context[name].push(value);
  return value;
}

// Distinguishes sequence invocations in the context keys of the pick
// family, so e.g. two @pd inside one @m keep separate counters while
// sharing state across that invocation's iterations.
let seq_uid = 0;

function make_sequence(c) {
  return lazy((_, n, ...actions) => {
    if (!n || !actions.length) return '';
    let count = get_value(n());
    let evaluated = count;
    // Anything but plain numbers and 2x3/1-5 range forms goes through calc
    if (/\D/.test(count) && !/\d+[x-]\d+/.test(count)) {
      evaluated = calc(count);
      if (evaluated === 0) {
        evaluated = count;
      }
    }
    let signature = ++seq_uid;
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

// The @n family: with no sequence tuple in scope the source token is
// echoed back as-is (a non-function return passes through apply_func).
// Argument composition pushes an empty tuple, which is no context either.
function seq(token, make) {
  return ({ extra }) => {
    let e = last(extra);
    return (e && e.length) ? make(e) : token;
  };
}

function create_plot(unit) {
  return ({ count, extra, grid }) => {
    let e = last(extra) || [];
    return (...args) => {
      let commands = args.join(',');
      let idx = e[SEQ.n] ?? count;
      let max = e[SEQ.max] ?? grid.count;
      let { points, rules } = generate_shape(commands, {min: 1, max: 65536, count: max, unit}, rules => {
        delete rules['fill'];
        delete rules['fill-rule'];
        delete rules['frame'];
        if (rules.split || rules.points) {
          rules.hasPoints = true;
        } else {
          rules.points = max;
        }
        if (unit) {
          rules.unit = rules.unit || 'none';
        }
        return rules;
      });
      return rules.hasPoints ? points : points[idx - 1];
    };
  };
}

function create_mirror(even) {
  let offset = even ? 1 : 2;
  return () => (...args) => {
    for (let i = args.length - offset; i >= 0; --i) {
      args.push(args[i]);
    }
    return args;
  };
}

function create_pick(name, fn, random = false, upstream = false) {
  return ({ context, extra, upextra, position, shuffle }) => {
    let lastExtra = upstream
      ? last(upextra.length ? upextra : extra)
      : last(extra);
    let sig = lastExtra ? last(lastExtra) : '';
    let prefix = upstream ? name.toUpperCase() : name;
    let suffix = position + sig;
    let counter = `${prefix}-counter${suffix}`;
    let valuesKey = `${prefix}-values${suffix}`;

    return expand((...args) => {
      if (!context[counter]) context[counter] = 0;
      context[counter] += 1;
      let source = args;
      if (random) {
        if (!context[valuesKey]) {
          context[valuesKey] = shuffle(args || []);
        }
        source = context[valuesKey];
      }
      let max = args.length;
      let idx = lastExtra && lastExtra[SEQ.index];
      idx ??= context[counter];
      let pos = (idx - 1) % max;
      let value = fn(source, pos, max);
      return push_stack(context, 'last_pick', value);
    });
  };
}

function transform_path(tr) {
  return commands => {
    let parsed = parse_svg_path(commands);
    if (!parsed.valid) return commands;
    return parsed.commands.map(({ name, value }) => {
      let [n, v] = tr(name, value);
      return n + v.join(' ');
    }).join(' ');
  };
}

const INVERT_COMMAND = { v: 'h', V: 'H', h: 'v', H: 'V' };

const invert_path = transform_path((name, value) =>
  [INVERT_COMMAND[name] || name, value]);

const flipH_path = transform_path((name, value) =>
  (name === 'h' || name === 'H') ? [name, value.map(flip_value)] : [name, value]);

const flipV_path = transform_path((name, value) =>
  (name === 'v' || name === 'V') ? [name, value.map(flip_value)] : [name, value]);

function try_decode(raw, decode) {
  let cut = raw.substring(raw.indexOf(',') + 1, raw.lastIndexOf('")'));
  try {
    return decode(cut);
  } catch (e) {
    return raw;
  }
}

const compose_svg_url = memo('svg-function', value => {
  if (!value.startsWith('<')) {
    value = generate_svg(parse_svg(value));
  }
  return create_svg_url(normalize_svg(value));
});

const compose_svg_polygon_url = memo('svg-polygon-function', commands => {
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
  let parsed = parse_svg(css`
    viewBox: -1 -1 2 2 p ${p};
    polygon {
      ${props} ${style}
    }
  `);
  return create_svg_url(generate_svg(parsed));
});

const compose_svg_pattern_url = memo('svg-pattern-function', value => {
  let parsed = parse_svg(css`
    viewBox: 0 0 1 1;
    preserveAspectRatio: xMidYMid slice;
    rect {
      width, height: 100%;
      fill: defs pattern { ${ value } }
    }
  `);
  return create_svg_url(generate_svg(parsed));
});

const Expose = {

  id({ x, y, z }) {
    return _ => cell_id(x, y, z);
  },

  n: seq('@n', e => calc_with(e[SEQ.n])),

  nx: seq('@nx', e => calc_with(e[SEQ.x])),

  ny: seq('@ny', e => calc_with(e[SEQ.y])),

  N: seq('@N', e => calc_with(e[SEQ.max])),

  nN: seq('@nN', e => calc_with_easing(e[SEQ.n] / e[SEQ.max])),

  Nn: seq('@Nn', e => calc_with_easing((e[SEQ.max] - e[SEQ.n] + 1) / e[SEQ.max])),

  nd: seq('@nd', e => d => {
    d = Number(d) || 0;
    return calc_with(e[SEQ.n] - .5 - d - e[SEQ.max] / 2)();
  }),

  m: make_sequence(','),

  M: make_sequence(' '),

  µ: make_sequence(''),

  match({ extra, x, y, z, count, grid }) {
    let e = last(extra) || [];
    let variables = {
      x, y, z, i: count, I: grid.count, X: grid.x, Y: grid.y, Z: grid.z,
      ...cell_metrics(x, y, grid),
    };
    if (!is_nil(e[SEQ.n])) variables.n = e[SEQ.n];
    if (!is_nil(e[SEQ.x])) variables.nx = e[SEQ.x];
    if (!is_nil(e[SEQ.y])) variables.ny = e[SEQ.y];
    if (!is_nil(e[SEQ.max])) variables.N = e[SEQ.max];
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

  pl: create_pick('pl', (args, pos) => args[pos]),

  PL: create_pick('pl', (args, pos) => args[pos], false, true),

  pr: create_pick('pr', (args, pos, max) => args[max - pos - 1]),

  PR: create_pick('pr', (args, pos, max) => args[max - pos - 1], false, true),

  pd: create_pick('pd', (args, pos) => args[pos], true),

  PD: create_pick('pd', (args, pos) => args[pos], true, true),

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
    let e = last(extra) || [];
    let [nx, ny, NX, NY] = [e[SEQ.x], e[SEQ.y], e[SEQ.X], e[SEQ.Y]];
    let isSeqContext = (e[SEQ.n] && e[SEQ.max]);
    return (...args) => {
      let {from = 0, to = from, frequency = 1, scale = 1, octave = 1} = get_named_arguments(args, [
        'from', 'to', 'frequency', 'scale', 'octave'
      ]);

      frequency = clamp(frequency, 0, Infinity);
      scale = clamp(scale, 0, Infinity);
      octave = clamp(octave, 1, 100);

      if (args.length == 1) [from, to] = [0, from];
      if (!context[counter]) context[counter] = new Noise(random);
      if (!context[counterX]) context[counterX] = random();
      if (!context[counterY]) context[counterY] = random();

      let transform = (is_letter(from) && is_letter(to)) ? by_charcode : by_unit;
      let noise2d = context[counter];
      let offsetX = context[counterX];
      let offsetY = context[counterY];
      let _x = (isSeqContext ? ((nx - 1) / NX) : ((x - 1) / grid.x)) + offsetX;
      let _y = (isSeqContext ? ((ny - 1) / NY) : ((y - 1) / grid.y)) + offsetY;

      // 1-dimensional - use offset to avoid x=0 degenerate case
      if (NX <= 1 || grid.x <= 1) _x = offsetX + 0.5;
      if (NY <= 1 || grid.y <= 1) _y = offsetY + 0.5;

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
      if (!max) {
        return '';
      }
      let default_count = 0;
      let custom_sizes = [];
      let pairs = colors.map(step => {
        let [color, size] = parse_value_group(step);
        if (size !== undefined) custom_sizes.push(size);
        else default_count += 1;
        return [color, size];
      });
      let default_size = custom_sizes.length
        ? `(100% - ${custom_sizes.join(' - ')}) / ${default_count}`
        : `100% / ${max}`
      let prev;
      return pairs.map(([color, size], i) => {
        if (custom_sizes.length) {
          let prefix = prev ? (prev + ' + ') : '';
          prev = prefix + (size !== undefined ? size : default_size);
          return `${color} 0 calc(${ prev })`
        }
        return `${colors[i]} 0 ${100 / max * (i + 1)}%`
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
    return value => {
      let n = parseInt(get_value(value));
      return Number.isNaN(n) ? get_value(value) : n.toString(16);
    };
  },

  svg: lazy((_, ...args) => {
    let value = args.map(input => get_value(input())).join(',');
    return compose_svg_url(value);
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
      value = css`
        x: -20%;
        y: -20%;
        width: 140%;
        height: 140%;
      `;
      if (!is_nil(dilate)) {
        value += css`
          feMorphology {
            operator: dilate;
            radius: ${dilate};
          }
        `
      }
      if (!is_nil(erode)) {
        value += css`
          feMorphology {
            operator: erode;
            radius: ${erode};
          }
        `
      }
      if (!is_nil(blur)) {
        value += css`
          feGaussianBlur {
            stdDeviation: ${blur};
          }
        `
      }
      if (!is_nil(frequency)) {
        let [bx, by = bx] = parse_value_group(frequency);
        octave = octave ? `numOctaves: ${octave};` : '';
        value += css`
          feTurbulence {
            type: fractalNoise;
            baseFrequency: ${bx} ${by};
            seed: ${seed};
            ${octave}
          }
        `;
        if (scale) {
          value += css`
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
    return compose_svg_pattern_url(value);
  }),

  'svg-polygon': lazy((_, ...args) => {
    let commands = args.map(input => get_value(input())).join(',');
    return compose_svg_polygon_url(commands);
  }),

  linearGradient: lazy((_, ...args) => generate_svg_gradient('linearGradient', args)),

  radialGradient: lazy((_, ...args) => generate_svg_gradient('radialGradient', args)),

  var() {
    return value => `var(${get_value(value)})`;
  },

  plot: create_plot(false),

  Plot: create_plot(true),

  shape() {
    return memo('shape-function', (...args) => {
      let commands = args.join(',');
      let { points } = generate_shape(commands);
      return `polygon(${points.join(',')})`;
    });
  },

  doodle() {
    return (...args) => args.join(',');
  },

  shaders() {
    return (...args) => args.join(',');
  },

  pattern() {
    return (...args) => args.join(',');
  },

  invert() {
    return invert_path;
  },

  flipH() {
    return flipH_path;
  },

  flipV() {
    return flipV_path;
  },

  flip() {
    return commands => flipV_path(flipH_path(commands));
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
      let size = list.length;
      let result = [];
      for (let i = 0; i < size; ++i) {
        let rotated = list.slice(i).concat(list.slice(0, i));
        result.push(rotated.join(separator));
      }
      return result;
    }
  },

  mirror: create_mirror(true),

  Mirror: create_mirror(false),

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
      if (raw.startsWith('${doodle') && raw.endsWith('}')) {
        let key = raw.substring(2, raw.length - 1);
        let doodles = rules.doodles;
        if (doodles && doodles[key]) {
          return `<css-doodle>${doodles[key].doodle}</css-doodle>`
        }
      }
      if (raw.startsWith('url("data:image/svg+xml;utf8')) {
        return try_decode(raw, decodeURIComponent);
      }
      if (raw.startsWith('url("data:image/svg+xml;base64')) {
        return try_decode(raw, atob);
      }
      /* future forms */
      if (raw.startsWith('url("data:image/png;base64')) {
        return `<img src="${raw}" alt="" />`;
      }
      return raw;
    }
  },

  'google-font': () => {
    return (name) => {
      return { value: name, gf: true };
    }
  },

};

// generated: i x y z I X Y Z iI Ii xX Xx yY Yy
const CELL_FIELDS = { i: 'count', x: 'x', y: 'y', z: 'z' };
for (let [n, key] of Object.entries(CELL_FIELDS)) {
  let N = n.toUpperCase();
  Expose[n] = c => calc_with(c[key]);
  Expose[N] = c => calc_with(c.grid[key]);
  if (n !== 'z') {
    Expose[n + N] = c => calc_with_easing(c[key] / c.grid[key]);
    Expose[N + n] = c => calc_with_easing((c.grid[key] - c[key] + 1) / c.grid[key]);
  }
}

// generated: dx dy dr dc dm da db
for (let name of ['dx', 'dy', 'dr', 'dc', 'dm', 'da', 'db']) {
  Expose[name] = ({ x, y, grid }) => calc_with(cell_metrics(x, y, grid)[name]);
}

// generated: ut ts UT TS uw uh ux uy
const UNIFORMS = {
  ut: `var(--${utime.name})`,
  ts: `calc(var(--${utime.name}) / 1000)`,
  UT: `var(--${UTime.name})`,
  TS: `calc(var(--${UTime.name}) / 1000)`,
  uw: `var(--${uwidth.name})`,
  uh: `var(--${uheight.name})`,
  ux: `var(--${umousex.name})`,
  uy: `var(--${umousey.name})`,
};
for (let [name, value] of Object.entries(UNIFORMS)) {
  Expose[name] = () => calc_with(value);
}

export default add_alias(Expose, {

  'index': 'i',
  'col': 'x',
  'row': 'y',
  'depth': 'z',
  'rand': 'r',
  'pick': 'p',
  'pn': 'pl',
  'pnr': 'pr',
  'PN': 'PL',
  'PNR': 'PR',
  'R': 'rn',
  'T': 'UT',
  't': 'ut',

  // error prone
  'stripes': 'stripe',
  'strip': 'stripe',
  'patern': 'pattern',
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
  's': 'I',
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
