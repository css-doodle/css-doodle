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
    let [w, h = w] = parse_value_group(value);
    if (is_preset(w)) {
      [w, h] = get_preset(w, h);
    }
    let styles = `
      width: ${ w };
      height: ${ h };
    `;
    if (is_special_selector) {
      if (w === 'auto' || h === 'auto') {
        styles += `aspect-ratio: ${ grid.ratio };`;
      }
    } else {
      styles += `
        --internal-cell-width: ${ w };
        --internal-cell-height: ${ h };
      `;
    }
    return styles;
  },

  position(value, { extra }) {
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
      transform: rotate(${ extra || 0 }deg);
    `;
  },

  grid(value, options) {
    let [grid, ...size] = value.split('/').map(s => s.trim());
    size = size.join(' / ');
    return {
      grid: parse_grid(grid),
      size: size ? this.size(size, options) : ''
    };
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

}, {

  // legacy names.
  'place-cell': 'position',
  'offset': 'position',

});
