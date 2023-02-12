import parse_value_group from './parser/parse-value-group.js';
import parse_grid from './parser/parse-grid.js';

import { shapes } from './generator/shapes.js';
import { is_preset, get_preset } from './preset-size.js';

import { prefixer } from './utils/prefixer.js';
import { memo } from './utils/memo.js';
import { add_alias } from './utils/index.js';

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
    let styles = `
      width: ${ w };
      height: ${ h };
    `;
    if (is_special_selector) {
      if (w === 'auto' || h === 'auto') {
        if (ratio) {
          if (/^\(.+\)$/.test(ratio)) {
            ratio = ratio.substring(1, ratio.length - 1);
          } else if (!/^calc/.test(ratio)) {
            ratio = `calc(${ratio})`;
          }
        }
        styles += `aspect-ratio: ${ ratio || grid.ratio };`;
      }
    } else {
      styles += `
        --internal-cell-width: ${ w };
        --internal-cell-height: ${ h };
      `;
    }
    return styles;
  },

  place(value, { extra }) {
    let [left, top = '50%'] = parse_value_group(value);
    left = map_left_right[left] || left;
    top = map_top_bottom[top] || top;
    const cw = 'var(--internal-cell-width, 25%)';
    const ch = 'var(--internal-cell-height, 25%)';
    return `
      position: absolute;
      left: ${ left };
      top: ${ top };
      width: ${ cw };
      height: ${ ch };
      margin-left: calc(${ cw } / -2);
      margin-top: calc(${ ch } / -2);
      grid-area: unset;
      --plot-angle: ${ extra || 0 };
      rotate: ${ extra || 0 }deg;
    `;
  },

  grid(value, options) {
    let result = {
      clip: true,
    };
    if (/no\-*clip/i.test(value)) {
      result.clip = false;
      value = value.replace(/no\-*clip/i, '');
    }
    let groups = parse_value_group(value, {
      symbol: ['/', '+', '*', '|', '-'],
      noSpace: true,
      verbose: true
    });
    for (let { group, value } of groups) {
      if (group === '+') result.scale = value;
      if (group === '*') result.rotate = value;
      if (group === '/') {
        if (result.size === undefined) result.size = this.size(value, options);
        else result.fill = value;
      }
      if ((group === '|' || group == '-' || group == '') && !result.grid) {
        result.grid = parse_grid(value, options.max_grid);
        if (group === '|') {
          result.flexColumn = true;
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
    let [type, ...args] = parse_value_group(value);
    if (typeof shapes[type] !== 'function') return '';
    let prop = 'clip-path';
    let points = shapes[type](...args);
    let rules = `${ prop }: polygon(${points.join(',')});`;
    return prefixer(prop, rules) + 'overflow: hidden;';
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
