import { clamp } from '../utils/index.js';

const [ min, max, total ] = [ 1, 256, 256 * 256 ];

export default function parse_grid(size) {
  let [x, y, z] = (size + '')
    .replace(/\s+/g, '')
    .replace(/[,，xX]+/g, 'x')
    .split('x')
    .map(n => parseInt(n));

  const max_xy = (x == 1 || y == 1) ? total : max;
  const max_z = (x == 1 && y == 1) ? total : min;

  const ret = {
    x: clamp(x || min, 1, max_xy),
    y: clamp(y || x || min, 1, max_xy),
    z: clamp(z || min, 1, max_z)
  };

  return Object.assign({}, ret, {
    count: ret.x * ret.y * ret.z,
    ratio: ret.x / ret.y
  });
}
