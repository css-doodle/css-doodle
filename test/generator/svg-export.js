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

test('a computed count reads the enclosing sequence', () => {
    let out = svg('g*3 { circle*$(2^@n) {} }');
    assert.deepEqual(out.match(/<g>.*?<\/g>/g).map(g => g.split('<circle').length - 1), [2, 4, 8]);
});

test('a count can be picked: the comma stays inside the call, the seed decides', () => {
    let counts = [1, 2, 3, 4].map(seed => svg('circle*@p(10, 20) {}', { seed }).split('<circle').length - 1);
    assert.deepEqual([...new Set(counts)].sort(), [10, 20]);
    assert.deepEqual(counts, [1, 2, 3, 4].map(seed => svg('circle*@p(10, 20) {}', { seed }).split('<circle').length - 1));
});
