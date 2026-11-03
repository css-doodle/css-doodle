import test from 'node:test';
import assert from 'node:assert/strict';

import { shape } from '../../src/exports/generator/index.js';

test('shape() returns the polygon of a preset or of commands', () => {
    assert.match(shape('star'), /^polygon\((-?[\d.]+% -?[\d.]+%,){9}-?[\d.]+% -?[\d.]+%\)$/);
    assert.equal(shape('points: 4; r: 1'), 'polygon(100% 50%,50% 0%,0% 50%,50% 100%)');
});

test('shape() reads each argument as one more command', () => {
    assert.equal(shape('points: 4', 'r: 1'), shape('points: 4; r: 1'));
});
