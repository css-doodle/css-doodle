import parseValueGroup from '../parser/parse-value-group.js';
import parseDirection from '../parser/parse-direction.js';
import { getValue } from '../utils/type.js';

export default function createSvgGradient(type, args) {
  let values = args.map(input => getValue(input()));
  let transform = '';
  let colorStops = [];

  if (values.length == 1 && typeof values[0] === 'string' && values[0].indexOf(',') > -1) {
    let groups = parseValueGroup(values[0], { noSpace: true });
    if (groups.length > 1) {
      values = groups;
    }
  }

  if (values.length > 0) {
    let first = values[0];
    if (/^-?[\d.]/.test(first)) {
      let { angle } = parseDirection(first);
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
      let [color, offset, opacity] = parseValueGroup(value);
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
