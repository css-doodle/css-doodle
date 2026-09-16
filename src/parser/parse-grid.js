import { clamp } from '../lib/math.js';

function maxDepth(xy, budget) {
    if (xy === 1 || !Number.isFinite(budget)) return budget;
    let z = 0;
    for (let leaves = xy; leaves <= budget; leaves *= xy) z++;
    return Math.max(z, 1);
}

export default function parseGrid(size, GRID = 64) {
    let [x, y, z] = String(size)
        .replace(/\s+/g, '')
        .split(/[,，xX]+/)
        .map(n => Math.trunc(n));

    const total = GRID * GRID;
    const maxXy = (x == 1 || y == 1) ? total : GRID;

    x = clamp(x || 1, 1, maxXy);
    y = clamp(y || x, 1, maxXy);
    z = clamp(z || 1, 1, maxDepth(x * y, total));

    return { x, y, z, count: x * y * z, ratio: x / y };
}
