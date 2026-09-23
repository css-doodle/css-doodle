import test from 'node:test';
import assert from 'node:assert/strict';

import parseSvg from '../../src/parser/parse-svg.js';
import sourceOf from '../../src/parser/svg-source.js';

const source = input => sourceOf(parseSvg(input));

test('the source of a parsed svg is compact and wrapped in svg', () => {
    assert.equal(source('circle {}'), 'svg{circle{}}');
});

test('times syntax becomes an @M call', () => {
    assert.equal(source('circle*10 {}'), 'svg{@M(10,circle{})}');
    assert.equal(source('g circle*10x10 {}'), 'svg{g{@M(10x10,circle{})}}');
    assert.equal(
        source('path { href: defs g circle*2 {} }'),
        'svg{path{href:defs{g{@M(2,circle{})}}}}'
    );
});

test('resolved selectors and style blocks survive the round trip', () => {
    assert.equal(source('circle.dot*3 { style: { fill: red; stroke: blue } }'),
        'svg{@M(3,circle{style:{fill:red;stroke:blue};class:dot;})}');
    assert.equal(source('circle*2 { style: fill:red }'), 'svg{@M(2,circle{style:fill:red;})}');
});

test('a computed count becomes the first @M argument', () => {
    assert.equal(source('circle*@n {}'), 'svg{@M(@n,circle{})}');
    assert.equal(source('circle*$(2^@n) {}'), 'svg{@M($(2^@n),circle{})}');
});
