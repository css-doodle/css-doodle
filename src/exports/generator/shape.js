import generate_shape from '../../generator/shapes.js';

export default function shape(...args) {
  let commands = args.join(',');
  let { points } = generate_shape(commands);
  return `polygon(${points.join(',')})`;
}
