import parse_value_group from './parser/parse-value-group';
import parse_grid from './parser/parse-grid';
import Shapes from './shapes';
import prefixer from './prefixer';
import memo from './utils/memo';

export default {

  ['@size'](value, { is_special_selector }) {
    let [w, h = w] = parse_value_group(value);
    return `
      width: ${ w };
      height: ${ h };
      ${ is_special_selector ? '' : `
        --internal-cell-width: ${ w };
        --internal-cell-height: ${ h };
      `}
    `;
  },

  ['@min-size'](value) {
    let [w, h = w] = parse_value_group(value);
    return `min-width: ${ w }; min-height: ${ h };`;
  },

  ['@max-size'](value) {
    let [w, h = w] = parse_value_group(value);
    return `max-width: ${ w }; max-height: ${ h };`;
  },

  ['@place-cell']: (() => {
    let map_left_right = {
      'center': '50%', '0': '0%',
      'left': '0%', 'right': '100%',
      'top': '50%', 'bottom': '50%'
    };
    let map_top_bottom = {
      'center': '50%', '0': '0%',
      'top': '0%', 'bottom': '100%',
      'left': '50%', 'right': '50%',
    };

    return value => {
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
        margin-left: calc(${ cw } / -2) !important;
        margin-top: calc(${ ch } / -2) !important;
        grid-area: unset !important;
      `;
    }
  })(),

  ['@grid'](value, options) {
    let [grid, size] = value.split('/').map(s => s.trim());
    return {
      grid: parse_grid(grid),
      size: size ? this['@size'](size, options) : ''
    };
  },

  ['@shape']: memo('shape-property', value => {
    let [type, ...args] = parse_value_group(value);
    let prop = 'clip-path';
    if (!Shapes[type]) return '';
    let rules = `${ prop }: ${ Shapes[type].apply(null, args) };`;
    return prefixer(prop, rules) + 'overflow: hidden;';
  }),

  ['@use'](rules) {
    if (rules.length > 2) {
      return rules;
    }
  }

}
