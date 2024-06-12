import parse_value_group from './parser/parse-value-group.js';
import parse_grid from './parser/parse-grid.js';
import generate_shape from './generator/shapes.js';

import { is_preset, get_preset } from './preset-size.js';

import { add_alias } from './utils/index.js';
import { memo } from './cache.js';

const iw = '--_cell-width';
const ih = '--_cell-height';

const map_left_right = {
  center: '50%',
  left: '0%', right: '100%',
  top: '50%', bottom: '50%'
};

const map_top_bottom = {
  center: '50%',
  top: '0%', bottom: '100%',
  left: '50%', right: '50%',
};

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
    let [left, top = '50%'] = parse_value_group(value);
    left = map_left_right[left] || left;
    top = map_top_bottom[top] || top;
    let cw = `var(${iw}, 25%)`;
    let ch = `var(${ih}, 25%)`;
    return `
      position: absolute;
      left: ${left};
      top: ${top};
      width: ${cw};
      height: ${ch};
      margin-left: calc(${cw} / -2);
      margin-top: calc(${ch} / -2);
      grid-area: unset;
      --plot-angle: ${extra || 0};
      rotate: ${extra || 0}deg;
    `;
  },

  grid(value, options) {
    let result = {
      clip: true,
      p3d: false,
    };
    let temp = [];
    for (let item of parse_value_group(value, {symbol: ' '})) {
      if (/border:?/i.test(item)) {
        result.border = item.split(':')[1] || '';
      } else if (/^no\-*clip$/i.test(item)) {
        result.clip = false;
      } else if (/^p3d$/i.test(item)) {
        result.p3d = true;
      } else {
        temp.push(item);
      }
    }
    let groups = parse_value_group(temp.join(' '), {
      symbol: ['/', '+', '^', '*', '|', '-', '~', '∆', '_'],
      noSpace: true,
      verbose: true
    });
    for (let { group, value } of groups) {
      if (group === '+') result.scale = value;
      if (group === '^') result.enlarge = value;
      if (group === '*') result.rotate = value;
      if (group === '~') result.translate = value;
      if (group === '∆') result.persp = parse_value_group(value, {symbol: ' '});
      if (group === '_') result.gap = value;
      if (group === '/') {
        if (result.size === undefined) result.size = this.size(value, options);
        else result.fill = value;
      }
      if ((group === '|' || group == '-' || group == '') && !result.grid) {
        result.grid = parse_grid(value, options.max_grid);
        if (group === '|') {
          result.flexCol = true;
        }
        if (group === '-') {
          result.flexRow = true;
        }
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
