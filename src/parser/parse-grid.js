import { clamp } from '../utils/index';

const [ min, max, total ] = [ 1, 32, 32 * 32 ];

export default function parse_grid(size) {
  let [x, y, z] = (size + '')
    .replace(/\s+/g, '')
    .replace(/[,，xX]+/g, 'x')
    .split('x')
    .map(Number);

  const max_val = (x == 1 || y == 1) ? total : max;

  const ret = {
    x: clamp(x || min, 1, max_val),
    y: clamp(y || x || min, 1, max_val),
    z: clamp(z || min, 1, max_val)
  };

  return Object.assign({}, ret,
    { count: ret.x * ret.y }
  );
}
