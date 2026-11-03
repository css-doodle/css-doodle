import test from 'node:test';
import assert from 'node:assert/strict';

import { getEasingPoints, getEasingFunction } from '../../src/core/easing.js';

test('easing keywords and cubic-bezier() give their control points', () => {
    assert.deepEqual(getEasingPoints('ease-in-out'), [.42, 0, .58, 1]);
    assert.deepEqual(getEasingPoints('easeIn'), [.42, 0, 1, 1]);
    assert.deepEqual(getEasingPoints('Ease Out'), [0, 0, .58, 1]);
    assert.deepEqual(getEasingPoints('cubic-bezier(.2, 0, 0, 1)'), [.2, 0, 0, 1]);
    for (let str of ['linear', 'bounce', 'cubic-bezier(1, 2, 3)', 'constructor', 't*t']) {
        assert.equal(getEasingPoints(str), null);
    }
});

test('an easing function is a keyword, a bezier or a calc expression in t', () => {
    const at = (easing, t) => +getEasingFunction(easing)(t).toFixed(3);
    assert.equal(at('linear', .25), .25);
    assert.equal(at('ease-in', .25) < .25, true);
    assert.equal(at('ease-out', .25) > .25, true);
    assert.equal(at('cubic-bezier(.42, 0, 1, 1)', .25), at('ease-in', .25));
    assert.equal(at('t*t', .5), .25);
    assert.equal(at('ease', 0), 0);
    assert.equal(at('ease', 1), 1);
});

// y at x on a cubic bezier, x solved by plain bisection
function reference([x1, y1, x2, y2], x) {
    let at = (a, b, t) => 3 * a * t * (1 - t) ** 2 + 3 * b * t * t * (1 - t) + t ** 3;
    let lo = 0, hi = 1;
    for (let i = 0; i < 60; i++) {
        let t = (lo + hi) / 2;
        at(x1, x2, t) < x ? lo = t : hi = t;
    }
    return at(y1, y2, lo);
}

test('a bezier follows the curve, also where its slope flattens and Newton gives up', () => {
    // (1, 0, 0, 1) stands still in x at the middle, (0, 1, 1, 0) at both ends
    let xs = [.4999, .5001, ...Array.from({ length: 99 }, (_, i) => (i + 1) / 100)];
    for (let points of [[.25, .1, .25, 1], [1, 0, 0, 1], [0, 1, 1, 0], [.9, 0, .1, 1]]) {
        let ease = getEasingFunction(`cubic-bezier(${points})`);
        for (let x of xs) {
            let diff = Math.abs(ease(x) - reference(points, x));
            assert.ok(diff < 1e-3, `${points} at ${x.toFixed(2)} is off by ${diff}`);
        }
    }
});
