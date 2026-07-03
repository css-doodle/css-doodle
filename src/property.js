import parse_value_group from './parser/parse-value-group.js';
import parse_grid from './parser/parse-grid.js';
import generate_shape from './generator/shapes.js';

import { is_preset, get_preset } from './preset-size.js';

import { add_alias, is_empty } from './utils/index.js';
import { memo } from './cache.js';
import { css } from './utils/tagged-template.js';

const iw = '--_cell-width';
const ih = '--_cell-height';
const cw = `var(${iw}, 25%)`;
const ch = `var(${ih}, 25%)`;

function resolve_place(value) {
  let x, y, rest = [];
  for (let token of parse_value_group(value)) {
    if (is_empty(token)) continue;
    switch (token) {
      case 'left':   x = '0%';   break;
      case 'right':  x = '100%'; break;
      case 'top':    y = '0%';   break;
      case 'bottom': y = '100%'; break;
      case 'center': rest.push('50%'); break;
      default:       rest.push(token);
    }
  }
  for (let token of rest) {
    if (x === undefined) x = token;
    else if (y === undefined) y = token;
  }
  return [x ?? '50%', y ?? '50%'];
}

export default add_alias({

  size(value, { is_special_selector, grid }) {
    let [w, h = w, ratio] = parse_value_group(value);
    if (is_preset(w)) {
      [w, h] = get_preset(w, h);
    }
    let styles = `width:${w};height:${h};`;
    if (w === 'auto' || h === 'auto') {
      if (ratio) {
        if (/^\(.+\)$/.test(ratio)) {
          ratio = ratio.substring(1, ratio.length - 1);
        } else if (!/^calc/.test(ratio)) {
          ratio = `calc(${ratio})`;
        }
        if (!is_special_selector) {
          styles += `aspect-ratio: ${ratio};`;
        }
      }
      if (is_special_selector) {
        styles += `aspect-ratio: ${ratio || grid.ratio};`;
      }
    }
    if (!is_special_selector) {
      styles += `${iw}:${w};${ih}:${h};`;
    }
    return styles;
  },

  place(value, { extra }) {
    let [left, top] = resolve_place(value);
    return css`
      position: absolute;
      left: ${left};
      top: ${top};
      width: ${cw};
      height: ${ch};
      margin-left: calc(${cw} / -2);
      margin-top: calc(${ch} / -2);
      grid-area: unset;
      ${extra ? `rotate: ${extra}deg;` : ''}
    `;
  },

  grid(value, options) {
    let result = {
      clip: true,
      p3d: false,
    };
    let temp = [];
    let pos = 0;
    for (let item of parse_value_group(value, {symbol: ' '})) {
      if (pos === 0 && (item === '|' || item === '-')) {
        result.flex = item === '|' ? 'column' : 'row';
        temp.push('§');
      } else if (/border:?/i.test(item)) {
        result.borderLegacy = item.split(':')[1] || '';
        temp.push('§');
      } else if (/^no\-*clip$/i.test(item)) {
        result.clip = false;
        temp.push('§');
      } else if (/^p3d$/i.test(item)) {
        result.p3d = true;
        temp.push('§');
      } else if (!result.grid) {
        result.grid = parse_grid(item, options.max_grid);
        temp.push(item);
      } else {
        temp.push(item);
      }
      pos += 1;
    }

    let groups = parse_value_group(temp.join(' '), {
      symbol: ['/ 2', '+', '^', '*', '~', '∆', '_', 'ß', 'β', '«', '§'],
      noSpace: true,
      verbose: true
    });
    for (let { group, value } of groups) {
      if (group === '+') result.scale = value;
      if (group === '^') result.enlarge = parse_value_group(value, {symbol: ' '});
      if (group === '~') result.translate = value;
      if (group === '∆') result.persp = parse_value_group(value, {symbol: ' '});
      if (group === '_') result.gap = value;
      if (group === '*') {
        let [head, ...rest] = parse_value_group(value, {symbol: ' '});
        if (head == 'h') {
          result.hueRotate = rest.join(' ');
        } else {
          result.rotate = value;
        }
      }
      if (group === '/') {
        if (result.size === undefined) result.size = this.size(value, options);
        else result.fill = value;
      }
      if (group === 'β' || group === 'ß') {
        let values = parse_value_group(value, {symbol: ' '});
        for (let i = 0; i < values.length; i++) {
          if (Number(values[i])) {
            values[i] += 'px';
            break;
          }
        }
        // simplify the regex
        let v = values[0];
        if (values.length === 1 && (/^\D/.test(v) && !/^\.\d/.test(v) && !/^(thin|thick|medium)$/.test(v) ) ) {
          values.push('1px');
        }
        if (!/solid|dotted|dashed|double|groove|ridge|inset|outset/.test(value)) {
          values.push('solid');
        }
        result.border = values.join(' ');
      }
      if (group === '«') {
        result.backdropFilter = value;
      }
      if (group === '' && !result.grid) {
        result.grid = parse_grid(value, options.max_grid);
      }
    }
    return result;
  },

  gap(value) {
    return value;
  },

  seed(value) {
    return value;
  },

  shape: memo('shape-property', value => {
    let { points, preset} = generate_shape(value);
    if (!preset) return '';
    return `clip-path: polygon(${points.join(',')});`;
  }),

  use(rules) {
    if (rules.length > 2) {
      return rules;
    }
  },

  content(value) {
    return value;
  },

}, {
  // legacy names.
  'place-cell': 'place',
  'offset': 'place',
  'position': 'place',
});
