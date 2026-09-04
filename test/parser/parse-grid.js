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

test('values clamp to the allowed range and truncate', () => {
    assert.deepEqual(parseGrid('0'), one);
    assert.deepEqual(parseGrid('0x1'), one);
    assert.deepEqual(parseGrid('70000,1'), { x: 4096, y: 1, z: 1, count: 4096, ratio: 4096 });
    assert.deepEqual(parseGrid('70000'), { x: 64, y: 64, z: 1, count: 4096, ratio: 1 });
    assert.deepEqual(parseGrid('0.5'), one);
    assert.deepEqual(parseGrid('1x5.2'), { x: 1, y: 5, z: 1, count: 5, ratio: 1 / 5 });
});
