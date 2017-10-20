import parse_value_group from './parser/parse-value-group';
import parse_grid  from './parser/parse-grid';
import Shapes from './shapes';
import { memo, prefix } from './utils';

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
  ['size'](value, options) {
    return this['@size'](value, options);
  },

  ['@min-size'](value) {
    let [w, h = w] = parse_value_group(value);
    return `min-width: ${ w }; min-height: ${ h };`;
  },
  ['min-size'](value) {
    return this['@min-size'](value);
  },

  ['@max-size'](value) {
    let [w, h = w] = parse_value_group(value);
    return `max-width: ${ w }; max-height: ${ h };`;
  },
  ['max-size'](value) {
    return this['@max-size'](value);
  },

  ['@place-cell'](value) {
    let [left, top = left] = parse_value_group(value);
    const map = ({ 'center': '50%', '0': '0%' });
    const bound = '-100vmax';
    left = map[left] || left;
    top = map[top] || top;
    return `
      position: absolute;
      right: ${ bound }; bottom: ${ bound };
      left: calc(${ bound } - 100% + ${ left } * 2);
      top: calc(${ bound } - 100% + ${ top } * 2);
      width: var(--internal-cell-width, 25%);
      height: var(--internal-cell-height, 25%);
      grid-area: unset !important;
      margin: auto !important;
    `;
  },

  ['@grid'](value, options) {
    let [grid, size] = value.split('/').map(s => s.trim());
    return {
      grid: parse_grid(grid),
      size: size ? this['@size'](size, options) : ''
    };
  },

  ['@shape']: memo('shape-property', function(value) {
    let [type, ...args] = parse_value_group(value);
    return Shapes[type]
      ? prefix(`clip-path: ${ Shapes[type].apply(null, args) };`)
        + 'overflow: hidden;'
      : '';
  })

}
