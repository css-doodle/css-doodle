import test from 'node:test';
import assert from 'node:assert/strict';

import parseSvg from '../../src/parser/parse-svg.js';
import sourceOf from '../../src/parser/svg-source.js';

const source = input => sourceOf(parseSvg(input));

test('the source of a parsed svg is compact and wrapped in svg', () => {
    assert.equal(source('circle {}'), 'svg{circle{}}');
});

test('times syntax becomes an @M call', () => {
    assert.equal(source('circle*10 {}'), 'svg{@M10(circle{})}');
    assert.equal(source('g circle*10x10 {}'), 'svg{g{@M10x10(circle{})}}');
    assert.equal(
        source('path { href: defs g circle*2 {} }'),
        'svg{path{href:defs{g{@M2(circle{})}}}}'
    );
});
