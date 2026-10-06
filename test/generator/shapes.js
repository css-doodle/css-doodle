import test from 'node:test';
import assert from 'node:assert/strict';

import generateShape from '../../src/generator/shapes.js';

test('preset shapes', () => {
    let { points, preset } = generateShape('triangle');
    assert.equal(preset, true);
    assert.equal(points.length, 3);
    assert.equal(generateShape('circle').points.length, 180);
});

test('commands after a preset add to it or override its own', () => {
    let { points, preset } = generateShape('heart; split: 12');
    assert.equal(preset, true);
    assert.equal(points.length, 12);
    assert.equal(generateShape('clover 5; split: 8').points.length, 8);
    assert.equal(generateShape('clover 5; split: 8').preset, true);
    // a new command keeps the outline
    assert.equal(String(generateShape('heart; gap: 1').points), String(generateShape('heart').points));
    // a formula after the preset overrides its own
    assert.equal(generateShape('heart; r: .5').points.length, 180);
    assert.notEqual(String(generateShape('heart; r: .5').points), String(generateShape('heart').points));
});

test('fitted presets fill the box, centred', () => {
    let bounds = shape => {
        let xs = [], ys = [];
        for (let p of generateShape(shape).points) {
            let [x, y] = String(p).split(' ').map(parseFloat);
            xs.push(x), ys.push(y);
        }
        return [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)].map(Math.round);
    };
    for (let shape of ['squircle', 'squircle 1', 'squircle .5', 'bud 4', 'hypocycloid 4']) {
        assert.deepEqual(bounds(shape), [0, 100, 0, 100], shape);
    }
    // the longer side touches, the shorter one is centred
    assert.deepEqual(bounds('cloud 1'), [0, 100, 7, 93]);
    assert.deepEqual(bounds('triangle'), [0, 100, 7, 93]);
    assert.deepEqual(bounds('hypocycloid 3'), [7, 93, 0, 100]);
});

test('prototype names are not preset shapes', () => {
    assert.equal(generateShape('constructor').preset, false);
    assert.equal(generateShape('toString').preset, false);
});

test('a modifier reshapes the commands before the points are generated', () => {
    let a = generateShape('r: cos(4t)', { min: 1, max: 65536 }, rules => {
        rules.points = 25;
        return rules;
    });
    let b = generateShape('split: 10; r: cos(2t)', { min: 1, max: 65536 }, rules => {
        rules.unit = rules.unit || 'none';
        return rules;
    });
    assert.equal(a.points.length, 25);
    assert.equal(b.points.length, 10);
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

test('a t: command rewrites the angle in terms of the angle', () => {
    // t: 2t used to collapse every point: `t` was a calc cycle, so 0
    let doubled = generateShape('split: 4; r: 1; t: 2t');
    assert.equal(String(doubled.points), '100% 50%,0% 50%,100% 50%,0% 50%');
    let shifted = generateShape('split: 4; r: 1; t: t + 90 * PI / 180');
    assert.equal(String(shifted.points), '50% 0%,0% 50%,50% 100%,100% 50%');
});

test('the unit of r is not a variable', () => {
    assert.equal(String(generateShape('split: 4; r: 10px').points), '10px 0px,0px -10px,-10px 0px,0px 10px');
    // 2i and 2θ are products, like 2t
    assert.equal(String(generateShape('split: 4; r: .1i').points), '55% 50%,50% 40%,35% 50%,50% 70%');
});

test('degenerate commands still give numbers', () => {
    let one = generateShape('x: range(-1, 1); y: 0', { min: 1 }, rules => {
        rules.points = 1;
        return rules;
    });
    assert.equal(String(one.points), '0% 50%');
    assert.doesNotMatch(String(generateShape('split: 3; frame: abc').points), /NaN/);
});


test('a large seed still spreads the scatter samples', () => {
    let scatter = seed => generateShape('square', { min: 1, max: 65536 }, rules => Object.assign(rules, { scatter: 5, seed })).points.map(String);
    for (let seed of [1e15, 1e20]) assert.equal(new Set(scatter(seed)).size, 5, String(seed));
});

test('a density that is nowhere positive scatters uniformly', () => {
    let scatter = density => generateShape('square', { min: 1, max: 65536 }, rules => Object.assign(rules, { scatter: 6, seed: 1, density })).points.map(String);
    assert.equal(scatter('-1').length, 6);
    assert.deepEqual(scatter('-1'), scatter(undefined));
});
