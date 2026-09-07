import test from 'node:test';
import assert from 'node:assert/strict';

import generateShape from '../../src/generator/shapes.js';

test('preset shapes', () => {
    let { points, preset } = generateShape('triangle');
    assert.equal(preset, true);
    assert.equal(points.length, 3);
    assert.equal(generateShape('circle').points.length, 180);
});

test('prototype names are not preset shapes', () => {
    assert.equal(generateShape('constructor').preset, false);
    assert.equal(generateShape('toString').preset, false);
});

test('the cache key includes the count from the modifier', () => {
    // @plot() modifiers close over the grid count, but the cache key
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

test('the cache key includes the unit flag', () => {
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

test('point coordinates are tidied', () => {
    assert.equal(String(generateShape('split: 4; r: 1').points), '100% 50%,50% 0%,0% 50%,50% 100%');
    let plot = generateShape('split: 4; r: 1', { unit: true }, rules => {
        rules.unit = 'none';
        return rules;
    });
    assert.equal(String(plot.points), '1 0,0 -1,-1 0,0 1');
});

test('the fill rule leads the points', () => {
    let { points } = generateShape('split: 3; fill: evenodd');
    assert.equal(String(points).split(',')[0], 'evenodd');
});

test('direction angles are tidy and ignore move', () => {
    let angles = code => generateShape(code).points.map(p => p.extra);
    assert.deepEqual(angles('split: 4; r: 1; move: .1 .2'), [0, -90, -180, 90]);
    assert.deepEqual(angles('split: 4; r: 1; direction: reverse 30'), [-150, -240, -330, -60]);
    assert.deepEqual(angles('split: 4; r: 1; direction: 30'), [120, 120, 120, 120]);
});
