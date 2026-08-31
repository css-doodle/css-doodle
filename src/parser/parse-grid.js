import { clamp } from '../utils/math.js';

export default function parseGrid(size, GRID = 64) {
    let [x, y, z] = String(size)
        .replace(/\s+/g, '')
        .split(/[,，xX]+/)
        .map(n => parseInt(n));

    const total = GRID * GRID;
    const maxXy = (x == 1 || y == 1) ? total : GRID;
    const maxZ = (x == 1 && y == 1) ? total : 1;

    x = clamp(x || 1, 1, maxXy);
    y = clamp(y || x, 1, maxXy);
    z = clamp(z || 1, 1, maxZ);

    return { x, y, z, count: x * y * z, ratio: x / y };
}
