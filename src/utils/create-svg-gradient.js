import parse_value_group from '../parser/parse-value-group.js';
import parse_direction from '../parser/parse-direction.js';
import { get_value } from './index.js';

export function create_svg_gradient(type, args) {
  let values = args.map(input => get_value(input()));
  let transform = '';
  let colorStops = [];

  if (values.length > 0) {
    let first = values[0];
    if (/^-?[\d.]/.test(first)) {
      let { angle } = parse_direction(first);
      transform = `gradientTransform: rotate(${angle});`;
      values = values.slice(1);
    } else if (/^(rotate|translate|scale|skewX|skewY|matrix)\s*\(/.test(first)) {
      transform = `gradientTransform: ${first};`;
      values = values.slice(1);
    }
  }

  for (let value of values) {
    if (!value || typeof value !== 'string' || !value.trim()) continue;
    let parts = parse_value_group(value);
    let color = parts[0];
    if (!color) continue;
    let offset = parts[1] || null;
    let opacity = parts[2] || null;
    colorStops.push({ color, offset, opacity });
  }

  let total = colorStops.length;
  let stops = colorStops.map((stop, i) => {
    let offset = stop.offset;
    if (!offset && total >= 1) {
      offset = `${total > 1 ? (i / (total - 1)) * 100 : 0}%`;
    }
    let props = `stop-color: ${stop.color}`;
    if (stop.opacity) {
      props += `; stop-opacity: ${stop.opacity}`;
    }
    if (offset) {
      return `stop { offset: ${offset}; ${props} }`;
    }
    return `stop { ${props} }`;
  });

  return `${type} { ${transform} ${stops.join(' ')} }`;
}
