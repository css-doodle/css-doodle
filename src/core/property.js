import parse_value_group from '../parser/parse-value-group.js';
import parse_grid from '../parser/parse-grid.js';
import generate_shape from '../generator/shapes.js';

import { is_preset, get_preset } from './preset-size.js';

import { add_alias } from '../utils/fn.js';
import { is_empty } from '../utils/type.js';
import { memo } from '../utils/cache.js';
import { css } from '../utils/tagged-template.js';

const iw = '--_cell-width';
const ih = '--_cell-height';
const cw = `var(${iw}, 25%)`;
const ch = `var(${ih}, 25%)`;

// keywords resolve to edge percentages, remaining values fill x then y
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

const border_styles = /solid|dotted|dashed|double|groove|ridge|inset|outset/;

// fill in the parts a shorthand border value leaves out:
// bare numbers get px, a lone color gets 1px, no style gets solid
function format_border(value) {
  let values = parse_value_group(value, { symbol: ' ' });
  for (let i = 0; i < values.length; i++) {
    if (Number(values[i])) {
      values[i] += 'px';
      break;
    }
  }
  let head = values[0];
  let is_width = /^\.?\d/.test(head) || /^(thin|thick|medium)$/.test(head);
  if (values.length === 1 && !is_width) {
    values.push('1px');
  }
  if (!border_styles.test(value)) {
    values.push('solid');
  }
  return values.join(' ');
}

/*
 * The registry of @-properties: a `@name: value` declaration is only
 * recognized when `name` (or an alias below) exists here, so the
 * pass-through entries register the name and little else
 */
const Property = {};

// @size: width height? ratio? — presets like `vmin` expand to both
// dimensions; with `auto` the ratio (or the grid's) becomes aspect-ratio.
// Cell size is recorded on custom properties for @place-cell to read.
Property.size = (value, { is_special_selector, grid }) => {
  let [w, h = w, ratio] = parse_value_group(value);
  if (is_empty(w)) return '';
  if (is_preset(w)) {
    [w, h] = get_preset(w, h);
  }
  let styles = `width:${w};height:${h};`;
  if (w === 'auto' || h === 'auto') {
    if (ratio) {
      if (/^\(.+\)$/.test(ratio)) {
        ratio = ratio.slice(1, -1);
      } else if (!/^calc/.test(ratio)) {
        ratio = `calc(${ratio})`;
      }
    }
    if (is_special_selector) {
      styles += `aspect-ratio: ${ratio || grid.ratio};`;
    } else if (ratio) {
      styles += `aspect-ratio: ${ratio};`;
    }
  }
  if (!is_special_selector) {
    styles += `${iw}:${w};${ih}:${h};`;
  }
  return styles;
};

// @place-cell: x y — take the cell out of the grid flow and center it
// at the given coords; `extra` carries a rotation in degrees
Property.place = (value, { extra }) => {
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
};

// @grid: the whole option string parsed into a config object.
// Word flags (row/col, border:, no-clip, p3d) are consumed first and
// blanked to '§' so they can't be re-read as grid dimensions; the rest
// splits into symbol-prefixed groups:
//
//   /  size (first occurrence) or fill color (second)
//   +  scale
//   ~  translate
//   ^  enlarge
//   *  rotate, or hue-rotate when the value starts with `h`
//   ∆  perspective
//   _  gap
//   |  backdrop-filter
//   ß  border (β accepted for the same)
//
// and whatever carries no symbol is the grid dimensions themselves.
Property.grid = (value, options) => {
  let result = {
    clip: true,
    p3d: false,
  };
  let temp = parse_value_group(value, { symbol: ' ' }).map(item => {
    if (/^row$/i.test(item)) {
      result.flex = 'row';
      return '§';
    }
    if (/^col$/i.test(item)) {
      result.flex = 'column';
      return '§';
    }
    if (/border:?/i.test(item)) {
      result.borderLegacy = item.split(':')[1] || '';
      return '§';
    }
    if (/^no\-*clip$/i.test(item)) {
      result.clip = false;
      return '§';
    }
    if (/^p3d$/i.test(item)) {
      result.p3d = true;
      return '§';
    }
    if (!result.grid) {
      result.grid = parse_grid(item, options.max_grid);
    }
    return item;
  });

  let groups = parse_value_group(temp.join(' '), {
    symbol: ['/ 2', '+', '^', '*', '~', '∆', '_', 'ß', 'β', '|', '§'],
    noSpace: true,
    verbose: true
  });
  for (let { group, value } of groups) {
    switch (group) {
      case '+': result.scale = value; break;
      case '~': result.translate = value; break;
      case '_': result.gap = value; break;
      case '|': result.backdropFilter = value; break;
      case '^': result.enlarge = parse_value_group(value, { symbol: ' ' }); break;
      case '∆': result.persp = parse_value_group(value, { symbol: ' ' }); break;
      case '*': {
        let [head, ...rest] = parse_value_group(value, { symbol: ' ' });
        if (head === 'h') result.hueRotate = rest.join(' ');
        else result.rotate = value;
        break;
      }
      case '/':
        if (result.size === undefined) result.size = Property.size(value, options);
        else result.fill = value;
        break;
      case 'β':
      case 'ß': result.border = format_border(value); break;
      case '':
        if (!result.grid) result.grid = parse_grid(value, options.max_grid);
        break;
    }
  }
  return result;
};

// @gap: written onto :container by generator/css.js

Property.gap = value => value;

// @seed: read by the component; emits no css

Property.seed = value => value;

// @shape: preset shapes only — custom points go through the
// shape() function instead

Property.shape = memo('shape-property', value => {
  let { points, preset} = generate_shape(value);
  if (!preset) return '';
  return `clip-path: polygon(${points.join(',')});`;
});

// @use: the rules compose separately in generator/css.js

Property.use = rules => {
  if (rules.length > 2) {
    return rules;
  }
};

// @content: collected per cell and applied through the markup

Property.content = value => value;

export default add_alias(Property, {
  // legacy names.
  'place-cell': 'place',
  'offset': 'place',
  'position': 'place',
});
