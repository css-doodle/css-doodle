import test from 'node:test';
import assert from 'node:assert/strict';

import { svg } from '../../src/exports/generator/index.js';

const doc = 'svg { viewBox: 0 0 10 10; circle { r: @r(1, 5); } }';

test('the same seed draws the same picture', () => {
    assert.equal(svg(doc, { seed: 'abc' }), svg(doc, { seed: 'abc' }));
    assert.equal(svg(doc, { seed: 42 }), svg(doc, { seed: '42' }));
    assert.notEqual(svg(doc, { seed: 'abc' }), svg(doc, { seed: 'xyz' }));
});

test('without a seed the call still draws', () => {
    assert.match(svg(doc), /<circle r="[\d.]+"\/>/);
});
