import { create_shape } from '../../generator/shapes.js';

export default function shape(...args) {
  let commands = args.join(',');
  let { points } = create_shape(commands);
  return `polygon(${points.join(',')})`;
}
