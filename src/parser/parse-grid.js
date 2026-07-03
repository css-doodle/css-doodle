import { clamp } from '../utils/index.js';

export default function parse_grid(size, GRID = 64) {
  let [x, y, z] = String(size)
    .replace(/\s+/g, '')
    .split(/[,，xX]+/)
    .map(n => parseInt(n));

  const total = GRID * GRID;
  const max_xy = (x == 1 || y == 1) ? total : GRID;
  const max_z = (x == 1 && y == 1) ? total : 1;

  x = clamp(x || 1, 1, max_xy);
  y = clamp(y || x, 1, max_xy);
  z = clamp(z || 1, 1, max_z);

  return { x, y, z, count: x * y * z, ratio: x / y };
}
