import test from 'node:test';
import assert from 'node:assert/strict';

import Function from '../../src/core/function.js';

test('@arc: path data of an arc, degrees clockwise from 3 o\'clock', () => {
    const arc = Function.arc();
    assert.equal(arc('r: 40; from: 0; to: 90'), 'M 40 0 A 40 40 0 0 1 0 40');
    // more than a half turn sets the large-arc flag
    assert.equal(arc('r: 40; from: 0; to: 270'), 'M 40 0 A 40 40 0 1 1 0 -40');
    // backwards is counter-clockwise
    assert.equal(arc('r: 40; from: 90; to: 0'), 'M 0 40 A 40 40 0 0 0 40 0');
    // from defaults to 0, to to a full circle, drawn as two arcs
    assert.equal(arc('r: 40'), 'M 40 0 A 40 40 0 1 1 -40 0 A 40 40 0 1 1 40 0');
    assert.equal(arc('r: 40; from: 0; to: 400'), arc('r: 40'));
    // two radii, a center, angle units, tidy numbers
    assert.equal(arc('r: 40 20; from: 0; to: 180; move: 50 50'), 'M 90 50 A 40 20 0 0 1 10 50');
    assert.equal(arc('r: 40; to: .25turn'), arc('r: 40; to: 90'));
    assert.equal(arc('r: 40; from: 30deg; to: -30'), 'M 34.6410161514 20 A 40 40 0 0 0 34.6410161514 -20');
    assert.equal(arc('r: 10; from: 0; to: 120'), 'M 10 0 A 10 10 0 0 1 -5 8.66025403784');
    // every parameter takes arithmetic
    assert.equal(arc('r: 80/2; from: 135; to: 135 + 270 * .7'), 'M -28.2842712475 28.2842712475 A 40 40 0 1 1 32.360679775 -23.5114100917');
});
