import test from 'node:test';
import assert from 'node:assert/strict';

import parseGrid from '../../src/parser/parse-grid.js';

const one = { x: 1, y: 1, z: 1, count: 1, ratio: 1 };

test('invalid values fall back to 1x1', () => {
    assert.deepEqual(parseGrid('random'), one);
    assert.deepEqual(parseGrid(''), one);
    assert.deepEqual(parseGrid('-1'), one);
});

test('separators: x, X, comma, fullwidth comma, spaces', () => {
    assert.deepEqual(parseGrid('1x1'), one);
    assert.deepEqual(parseGrid('1X1'), one);
    assert.deepEqual(parseGrid('1,1'), one);
    assert.deepEqual(parseGrid('1，1'), one);
    assert.deepEqual(parseGrid('1，   1'), one);
    assert.deepEqual(parseGrid('1 x 1'), one);
});

test('depth applies to any grid, clamped so the leaf level stays within GRID²', () => {
    assert.deepEqual(parseGrid('1x1x8'), { x: 1, y: 1, z: 8, count: 8, ratio: 1 });
    assert.deepEqual(parseGrid('1x2x8'), { x: 1, y: 2, z: 8, count: 16, ratio: 1 / 2 });
    assert.deepEqual(parseGrid('1x3x6'), { x: 1, y: 3, z: 6, count: 18, ratio: 1 / 3 });
    assert.deepEqual(parseGrid('2x3x4'), { x: 2, y: 3, z: 4, count: 24, ratio: 2 / 3 });
    // (x·y)^z leaves may not pass GRID², the largest flat grid
    assert.deepEqual(parseGrid('1x1x70000'), { x: 1, y: 1, z: 4096, count: 4096, ratio: 1 });
    assert.deepEqual(parseGrid('2x2x70000'), { x: 2, y: 2, z: 6, count: 24, ratio: 1 });
    assert.deepEqual(parseGrid('8x8x3'), { x: 8, y: 8, z: 2, count: 128, ratio: 1 });
    assert.deepEqual(parseGrid('64x64x2'), { x: 64, y: 64, z: 1, count: 4096, ratio: 1 });
});

test('values clamp to the allowed range and truncate', () => {
    assert.deepEqual(parseGrid('0'), one);
    assert.deepEqual(parseGrid('0x1'), one);
    assert.deepEqual(parseGrid('70000,1'), { x: 4096, y: 1, z: 1, count: 4096, ratio: 4096 });
    assert.deepEqual(parseGrid('70000'), { x: 64, y: 64, z: 1, count: 4096, ratio: 1 });
    assert.deepEqual(parseGrid('0.5'), one);
    assert.deepEqual(parseGrid('1x5.2'), { x: 1, y: 5, z: 1, count: 5, ratio: 1 / 5 });
});
