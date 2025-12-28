import parse_value_group from '../parser/parse-value-group.js';
import parse_direction from '../parser/parse-direction.js';
import { get_value } from '../utils/index.js';

export default function create_svg_gradient(type, args) {
  let values = args.map(input => get_value(input()));
  let transform = '';
  let colorStops = [];

  if (values.length > 0) {
    let first = values[0];
    if (/^-?[\d.]/.test(first)) {
      let { angle } = parse_direction(first);
      transform = `gradientTransform: rotate(${angle});`;
    } else if (/^(rotate|translate|scale|skewX|skewY|matrix)\s*\(/.test(first)) {
      transform = `gradientTransform: ${first};`;
    }
  }

  if (transform) {
    values = values.slice(1);
  }

  for (let value of values) {
    if (typeof value === 'string') {
      let [color, offset, opacity] = parse_value_group(value);
      if (!color) continue;
      colorStops.push({ color, offset, opacity });
    }
  }

  let total = colorStops.length;
  let stops = colorStops.map(({ color, offset, opacity}, i) => {
    if (!offset && total >= 1) {
      offset = `${total > 1 ? (i / (total - 1)) * 100 : 0}%`;
    }
    let props = `stop-color: ${color}`;
    if (opacity) {
      props += `; stop-opacity: ${opacity}`;
    }
    return `stop { ${ offset ? `offset: ${offset};` : '' } ${props} }`;
  });

  return `${type} { ${transform} ${stops.join(' ')} }`;
}
