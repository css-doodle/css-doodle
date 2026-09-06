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

test('@flipH/@flipV/@flip/@invert: mirror path data around its start point', () => {
    const flipH = Function.flipH(), flipV = Function.flipV();
    const flip = Function.flip(), invert = Function.invert();
    // relative h and v
    assert.equal(flipH('M 0 0 h 5 v 5'), 'M0 0 h-5 v5');
    assert.equal(flipV('M 0 0 h 5 v 5'), 'M0 0 h5 v-5');
    assert.equal(flip('M 0 0 h 5 v 5'), 'M0 0 h-5 v-5');
    assert.equal(invert('M 0 0 h 5 v 5'), 'M0 0 v5 h5');
    // commas split the arguments, every one of them is part of the path
    assert.equal(flipH('M 0', '0 h 5', '5'), 'M0 0 h-5 -5');
    assert.equal(flipH('h1 v1', 'h2 v2'), 'h-1 v1 h-2 v2');
    // lines, curves and arcs
    assert.equal(flipH('M 10 10 l 5 5 c 5 -5 10 5 15 0'), 'M10 10 l-5 5 c-5 -5 -10 5 -15 0');
    assert.equal(flipV('M 0 0 q 5 -5 10 0 t 10 0'), 'M0 0 q5 5 10 0 t10 0');
    assert.equal(invert('M 0 0 c 1 2 3 4 5 6'), 'M0 0 c2 1 4 3 6 5');
    // a reflection negates the arc rotation and toggles the sweep flag,
    // a swap exchanges the radii, a half turn keeps them all
    assert.equal(flipH('M 0 0 a 5 3 30 0 1 10 0'), 'M0 0 a5 3 -30 0 0 -10 0');
    assert.equal(invert('M 0 0 a 5 3 30 0 1 10 0'), 'M0 0 a3 5 -30 0 0 0 10');
    assert.equal(flip('M 0 0 a 5 3 30 0 1 10 0'), 'M0 0 a5 3 30 0 1 -10 0');
    // absolute commands mirror around the start point, which stays put
    assert.equal(flipH('M 10 10 L 15 20 H 30 V 0'), 'M10 10 L5 20 H-10 V0');
    assert.equal(invert('M 10 20 L 15 30 H 30 V 0'), 'M10 20 L20 25 V40 H-10');
    assert.equal(flip('M 10 10 L 15 20 Z'), 'M10 10 L5 0 Z');
    assert.equal(flipH('M 10 10 h 5 M 20 10 h 5'), 'M10 10 h-5 M0 10 h-5');
    assert.equal(flipH('m 1 -2 h -3 v -4 z'), 'm1 -2 h3 v-4 z');
    assert.equal(flipH('M .1 0 L .3 0'), 'M0.1 0 L-0.1 0');
    // flipH then flipV is flip, twice is the identity
    let path = 'M 2 3 l 1 2 c 1 2 3 4 5 6 a 5 3 30 0 1 10 0 H 9 V 1 z';
    assert.equal(flipV(flipH(path)), flip(path));
    assert.equal(invert(invert(path)), 'M2 3 l1 2 c1 2 3 4 5 6 a5 3 30 0 1 10 0 H9 V1 z');
    // anything that is not path data passes through
    assert.equal(flipH('#000', '#fff'), '#000,#fff');
    assert.equal(flipH('M 0 0 a5 5 0 0110 0'), 'M 0 0 a5 5 0 0110 0');
    assert.equal(flipH(''), '');
});

test('@reverse: arguments back to front, path data command by command', () => {
    const reverse = Function.reverse();
    assert.deepEqual(reverse('#000', '#333', '#666'), ['#666', '#333', '#000']);
    // bare command letters are a list, not a path
    assert.deepEqual(reverse('a', 'c', 's'), ['s', 'c', 'a']);
    assert.equal(reverse('h1 v2 h3'), 'h3 v2 h1');
    // the leading moveto and the closing z stay put
    assert.equal(reverse('M 0 0 h 5 v 5'), 'M0 0 v5 h5');
    assert.equal(reverse('M 0 0 h 5 v 5 z'), 'M0 0 v5 h5 z');
    assert.equal(reverse('M 1 1', 'h 5', 'v 5'), 'M1 1 v5 h5');
    assert.equal(reverse('M 0 0'), 'M0 0');
    assert.equal(reverse(''), '');
});
