import test from 'node:test';
import assert from 'node:assert/strict';

import image from '../../src/exports/generator/image.js';

test('renders the doodle as one sized svg', async () => {
    let { svg, seed, needs, warnings } = await image('@grid: 2 / 96px; background: @p(red, blue);', { seed: 3, width: 96, height: '48px' });
    assert.equal(seed, 3);
    assert.deepEqual(needs, []);
    assert.deepEqual(warnings, []);
    assert.match(svg, /^<svg width="96px" height="48px" [^>]*viewBox="0 0 96 48"/);
    assert.equal(svg.match(/<cell /g).length, 4);
});

test('without a size the svg has none', async () => {
    let { svg } = await image('@grid: 2; background: red;', { seed: 1 });
    assert.match(svg, /^<svg\s+xmlns/);
});

test('the same input renders the same svg', async () => {
    let code = '@grid: 4; background: hsl(@r(360) 50% 50%);';
    let a = await image(code, { seed: 'alice@example.com' });
    let b = await image(code, { seed: 'alice@example.com' });
    let c = await image(code, { seed: 'bob' });
    let d = await image(code);
    assert.equal(a.svg, b.svg);
    assert.notEqual(a.svg, c.svg);
    assert.equal(d.svg, (await image(code)).svg);
});

test('nested doodles stay inside the outer image', async () => {
    let { svg } = await image('@grid: 1; background: @doodle(@grid: 2; background: red);', { width: 50, height: 50 });
    assert.match(svg, /^<svg width="50px"/);
    assert.match(svg, /url\("data:image\/svg\+xml,/);
});

test('shader images are left out', async () => {
    let { svg, needs } = await image('@grid: 1; background: @pattern(fill: red);');
    assert.ok(svg.startsWith('<svg'));
    assert.deepEqual(needs, ['shader']);
});
