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
    assert.equal(getEasingFunction(t => 1 - t)(.25), .75);
});
