import parse_shape_commands from '../../parser/parse-shape-commands.js';
import { shapes, create_shape_points } from '../../generator/shapes.js';

export default function shape(type = '', ...args) {
  type = String(type).trim();
  let points = [];
  if (type.length) {
    if (typeof shapes[type] === 'function') {
      points = shapes[type](args);
    } else {
      let commands = type;
      let rest = args.join(',');
      if (rest.length) {
        commands = type + ',' + rest;
      }
      let config = parse_shape_commands(commands);
      points = create_shape_points(config, {min: 3, max: 3600});
    }
  }
  return `polygon(${points.join(',')})`;
}
