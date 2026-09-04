import test from 'node:test';
import assert from 'node:assert/strict';

import parseDirection from '../../src/parser/parse-direction.js';

test('direction keyword and angle', () => {
    assert.deepEqual(parseDirection(''), { direction: 'auto', angle: 0 });
    assert.deepEqual(parseDirection('auto 90deg'), { direction: 'auto', angle: 90 });
    assert.deepEqual(parseDirection('90deg'), { direction: '', angle: 90 });
    assert.deepEqual(parseDirection('auto'), { direction: 'auto', angle: 0 });
    assert.deepEqual(parseDirection('invalid'), { direction: 'auto', angle: 0 });
    assert.deepEqual(parseDirection('90deg reverse'), { direction: 'reverse', angle: 90 });
});

test('angle units convert to degrees', () => {
    const angle = input => parseDirection(input).angle;
    assert.equal(angle('10invalid'), 10);
    assert.equal(angle('1turn'), 360);
    assert.equal(angle('.5turn'), 180);
    assert.equal(angle('100grad'), 90);
    assert.equal(angle('.25turn'), 90);
    assert.equal(angle('-.25turn'), -90);
    assert.equal(angle('1.5708rad'), 1.5708 / (Math.PI / 180));
});
