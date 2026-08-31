import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { sequence } from '../src/core/arguments.js';

const indices = (count) => sequence(count, i => i);

describe('sequence', () => {

  test('plain counts', () => {
    assert.deepStrictEqual(indices(3), [1, 2, 3]);
    assert.deepStrictEqual(indices('3'), [1, 2, 3]);
    assert.deepStrictEqual(indices(3.2), [1, 2, 3, 4]);
    assert.deepStrictEqual(indices(0), []);
  });

  test('grid counts', () => {
    assert.deepStrictEqual(indices('2x3'), [1, 2, 3, 4, 5, 6]);
    assert.deepStrictEqual(
      sequence('2x3', (i, x, y) => [x, y]),
      [[1, 1], [2, 1], [1, 2], [2, 2], [1, 3], [2, 3]]
    );
  });

  test('range counts', () => {
    assert.deepStrictEqual(indices('1-4'), [1, 2, 3, 4]);
    assert.deepStrictEqual(indices('4-1'), [4, 3, 2, 1]);
    assert.deepStrictEqual(indices('5-5'), [5]);
  });

  test('negative counts produce nothing', () => {
    assert.deepStrictEqual(indices(-3), []);
    assert.deepStrictEqual(indices(-1), []);
    assert.deepStrictEqual(indices('-5'), []);
    assert.deepStrictEqual(indices('-2x3'), []);
  });

  test('grid product is capped', () => {
    assert.ok(indices('65536x65536').length <= 65536);
    assert.ok(indices('1000x1000').length <= 65536);
    assert.strictEqual(indices('100x100').length, 10000);
  });

});
