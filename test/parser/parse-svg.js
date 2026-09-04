import test from 'node:test';
import assert from 'node:assert/strict';

import parseSvg from '../../src/parser/parse-svg.js';

const svg = (...value) => ({ type: 'block', name: 'svg', value });
const block = (name, value = [], extra) => ({ type: 'block', name, value, ...extra });
const statement = (name, value, extra) => ({ type: 'statement', name, value, ...extra });

test('empty and malformed input yields an empty svg block', () => {
    assert.deepEqual(parseSvg(''), svg());
    assert.deepEqual(parseSvg('any'), svg());
    assert.deepEqual(parseSvg('{}'), svg());
    assert.deepEqual(parseSvg('{'), svg());
    assert.deepEqual(parseSvg('}'), svg());
    assert.deepEqual(parseSvg('{any}'), svg());
    assert.deepEqual(parseSvg('any:;'), svg(statement('any', '')));
    assert.deepEqual(parseSvg('circle {}'), svg(block('circle')));
    assert.deepEqual(parseSvg('circle { name: } '), svg(block('circle', [statement('name', '')])));
    assert.deepEqual(parseSvg('text { {} }'), svg(block('text')));
});

test('a custom root block gets a value field', () => {
    assert.deepEqual(parseSvg('', { type: 'block', name: 'filter' }), block('filter'));
});

test('statements', () => {
    assert.deepEqual(parseSvg('viewBox: 0 0 0 10'), svg(
        statement('viewBox', '0 0 0 10', { detail: { value: [0, 0, 0, 10] } })
    ));
    assert.deepEqual(parseSvg('viewBox: 0 0 10 10 padding .2'), svg(
        statement('viewBox', '0 0 10 10 padding .2', { detail: { value: [0, 0, 10, 10], padding: .2 } })
    ));
    assert.deepEqual(parseSvg('circle { cx: 5; cy: 5 }'), svg(
        block('circle', [statement('cx', '5'), statement('cy', '5')])
    ));
});

test('a comma list of names declares each with its own value', () => {
    assert.deepEqual(parseSvg('cx, cy: 5'), svg(
        statement('cx', '5', { origin: { name: ['cx', 'cy'], value: '5' } }),
        statement('cy', '5', { origin: { name: ['cx', 'cy'], value: '5' } }),
    ));
    assert.deepEqual(parseSvg('cx, cy: 5 6'), svg(
        statement('cx', '5', { origin: { name: ['cx', 'cy'], value: '5 6' } }),
        statement('cy', '6', { origin: { name: ['cx', 'cy'], value: '5 6' } }),
    ));
});

test('semicolons inside a value list stay in the value', () => {
    assert.deepEqual(parseSvg('values: 60; 100; 180'), svg(statement('values', '60;100;180')));
    assert.deepEqual(parseSvg('values: 20 50; 100; 110; cy: 10'), svg(
        statement('values', '20 50;100;110'),
        statement('cy', '10'),
    ));
    // also right before the closing brace
    assert.deepEqual(parseSvg('animate { values: 1; 2; 3 }'), svg(
        block('animate', [statement('values', '1;2;3')])
    ));
    assert.deepEqual(parseSvg('circle { animate { values: 1; 2; 3 } }'), svg(
        block('circle', [block('animate', [statement('values', '1;2;3')])])
    ));
});

test('namespaced names keep their colon', () => {
    assert.deepEqual(parseSvg('xlink:href: url(#app)'), svg(statement('xlink:href', 'url(#app)')));
    assert.deepEqual(parseSvg('xlink:title: hello:world'), svg(statement('xlink:title', 'hello:world')));
});

test('space-separated names nest, siblings repeat', () => {
    assert.deepEqual(parseSvg('g circle { } '), svg(block('g', [block('circle')])));
    assert.deepEqual(parseSvg('g circle { name: value } '), svg(
        block('g', [block('circle', [statement('name', 'value')])])
    ));
    assert.deepEqual(parseSvg('circle {} circle {}'), svg(block('circle'), block('circle')));
    assert.deepEqual(parseSvg('g > circle { fill: red }'), svg(
        block('g', [block('circle', [statement('fill', 'red')])])
    ));
});

test('#id and .class expand into statements', () => {
    assert.deepEqual(parseSvg('g circle#id { } '), svg(
        block('g', [block('circle', [statement('id', 'id')])])
    ));
    assert.deepEqual(parseSvg('g#id circle {} '), svg(
        block('g', [block('circle'), statement('id', 'id')])
    ));
    assert.deepEqual(parseSvg('g.container circle { } '), svg(
        block('g', [block('circle'), statement('class', 'container')])
    ));
    assert.deepEqual(parseSvg('g circle.highlight { } '), svg(
        block('g', [block('circle', [statement('class', 'highlight')])])
    ));
    assert.deepEqual(parseSvg('g.foo.bar { } '), svg(
        block('g', [statement('class', 'foo bar')])
    ));
    assert.deepEqual(parseSvg('g#myid.myclass { } '), svg(
        block('g', [statement('id', 'myid'), statement('class', 'myclass')])
    ));
    // a bare #id is a block name
    assert.deepEqual(parseSvg('#abc {}'), svg(block('#abc')));
});

test('trailing semicolons and stray words after a block are dropped', () => {
    assert.deepEqual(parseSvg('path {};'), svg(block('path')));
    assert.deepEqual(parseSvg('circle { cx: 5 } junk;'), svg(block('circle', [statement('cx', '5')])));
    assert.deepEqual(parseSvg('circle { cx: 5 } junk'), svg(block('circle', [statement('cx', '5')])));
});

test('quoted values keep their quotes and braces', () => {
    assert.deepEqual(parseSvg(`text { content: '' } g {}`), svg(
        block('text', [statement('content', "''")]),
        block('g'),
    ));
    assert.deepEqual(parseSvg('text { content: "world;}" }'), svg(
        block('text', [statement('content', '"world;}"')])
    ));
    assert.deepEqual(parseSvg('text { content: "}"; }'), svg(
        block('text', [statement('content', '"}"')])
    ));
});

test('a style block keeps its css as text', () => {
    assert.deepEqual(parseSvg('style { a { fill: red } }'), svg(block('style', 'a{fill:red}')));
    assert.deepEqual(parseSvg('style a { fill: red }'), svg(block('style', 'a{fill:red}')));
    assert.deepEqual(parseSvg('style .cls { stroke: blue }'), svg(block('style', '.cls{stroke:blue}')));
});

test('times syntax records the count and the pure name', () => {
    assert.deepEqual(parseSvg('circle*10 {}'), svg(
        block('circle*10', [], { pureName: 'circle', times: '10' })
    ));
    assert.deepEqual(parseSvg('circle * 5 {}'), svg(
        block('circle*5', [], { pureName: 'circle', times: '5' })
    ));
    assert.deepEqual(parseSvg('circle#a*4 {}'), svg(
        block('circle', [statement('id', 'a')], { pureName: 'circle#a', times: '4' })
    ));
    assert.deepEqual(parseSvg('circle.big*3 {}'), svg(
        block('circle', [statement('class', 'big')], { pureName: 'circle.big', times: '3' })
    ));
});

test('values keep nested parens and their contents', () => {
    assert.deepEqual(parseSvg('p { d: @plot(r: 1; unit: none); }'), svg(
        block('p', [statement('d', '@plot(r:1;unit:none)')])
    ));
});

test('--name declares a variable, hoisted before the elements', () => {
    assert.deepEqual(parseSvg('--a: 1'), svg(statement('--a', '1', { variable: true })));
    assert.deepEqual(parseSvg('--a: 1; svg {}'), svg(statement('--a', '1', { variable: true })));
    // an inner declaration overrides an outer one
    assert.deepEqual(parseSvg('--a: 1; svg { --a: 2 }'), svg(
        statement('--a', '2', { variable: true })
    ));
    assert.deepEqual(parseSvg('--b: 1; svg { --a: 2 }'), svg(
        statement('--b', '1', { variable: true }),
        statement('--a', '2', { variable: true }),
    ));
});

test('comma selectors share one body, each with its own id and class', () => {
    assert.deepEqual(parseSvg('circle, rect { fill: red }'), svg(
        block('circle', [statement('fill', 'red')]),
        block('rect', [statement('fill', 'red')]),
    ));
    assert.deepEqual(parseSvg('circle#a, rect.b {}'), svg(
        block('circle', [statement('id', 'a')]),
        block('rect', [statement('class', 'b')]),
    ));
});
