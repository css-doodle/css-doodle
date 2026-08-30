import test from 'node:test';
import assert from 'node:assert/strict';

import generateShape from '../src/generator/shapes.js';

test('preset shapes', () => {
  let { points, preset } = generateShape('triangle');
  assert.equal(preset, true);
  assert.equal(points.length, 3);

  let circle = generateShape('circle');
  assert.equal(circle.points.length, 180);
});

test('cache key includes count from modifiers', () => {
  // Issue: @plot() modifiers close over the grid count, but the cache key
  // ignored it, so a second call with a different count got stale points
  let a = generateShape('r: cos(4t)', { min: 1, max: 65536, count: 25 }, rules => {
    rules.points = 25;
    return rules;
  });
  let b = generateShape('r: cos(4t)', { min: 1, max: 65536, count: 100 }, rules => {
    rules.points = 100;
    return rules;
  });
  assert.equal(a.points.length, 25);
  assert.equal(b.points.length, 100);
});

test('cache key includes unit flag', () => {
  // @plot vs @Plot differ only by unit handling in their modifiers
  let a = generateShape('split: 10; r: cos(2t)', { min: 1, max: 65536, count: 10 }, rules => rules);
  let b = generateShape('split: 10; r: cos(2t)', { min: 1, max: 65536, count: 10, unit: true }, rules => {
    rules.unit = rules.unit || 'none';
    return rules;
  });
  assert.match(String(a.points[0]), /%/);
  assert.doesNotMatch(String(b.points[0]), /%/);
});

test('scale, rotate and move apply per point', () => {
  let plain = generateShape('split: 4; x: cos(t); y: sin(t)');
  let moved = generateShape('split: 4; move: .1 .2; x: cos(t); y: sin(t)');
  let scaled = generateShape('split: 4; scale: .5; x: cos(t); y: sin(t)');
  assert.notEqual(String(plain.points), String(moved.points));
  assert.notEqual(String(plain.points), String(scaled.points));
  assert.equal(plain.points.length, 4);
  assert.equal(moved.points.length, 4);
});
