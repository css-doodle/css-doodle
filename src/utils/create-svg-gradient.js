import parse_value_group from '../parser/parse-value-group.js';
import { get_value } from './index.js';

export function create_svg_gradient(type, args) {
  let values = args.map(input => get_value(input()));
  let transform = '';
  let stops = [];

  if (values.length > 0 && /^(rotate|translate|scale|skewX|skewY|matrix)\s*\(/.test(values[0])) {
    transform = `gradientTransform: ${values[0]};`;
    values = values.slice(1);
  }

  for (let value of values) {
    if (!value || typeof value !== 'string' || !value.trim()) continue;
    let parts = parse_value_group(value);
    let color = parts[0];
    if (!color) continue;
    let offset = parts[1] || '';
    if (offset) {
      stops.push(`stop { offset: ${offset}; stop-color: ${color} }`);
    } else {
      stops.push(`stop { stop-color: ${color} }`);
    }
  }

  return `${type} { ${transform} ${stops.join(' ')} }`;
}
