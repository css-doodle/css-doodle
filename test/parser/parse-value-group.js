import test from 'node:test';
import assert from 'node:assert/strict';

import parseValueGroup from '../../src/parser/parse-value-group.js';

test('commas and spaces separate values, quotes and parens group', () => {
    assert.deepEqual(parseValueGroup(undefined), []);
    assert.deepEqual(parseValueGroup(''), []);
    assert.deepEqual(parseValueGroup('a'), ['a']);
    assert.deepEqual(parseValueGroup('a, b'), ['a', 'b']);
    assert.deepEqual(parseValueGroup('a, b, c'), ['a', 'b', 'c']);
    assert.deepEqual(parseValueGroup('a, b-c'), ['a', 'b-c']);
    assert.deepEqual(parseValueGroup('a, var(--a,b)'), ['a', 'var(--a,b)']);
    assert.deepEqual(parseValueGroup('a b'), ['a', 'b']);
    assert.deepEqual(parseValueGroup('a @p(a, b)'), ['a', '@p(a,b)']);
    assert.deepEqual(parseValueGroup('a "hello world"'), ['a', '"hello world"']);
    assert.deepEqual(parseValueGroup('a, "hello, world"'), ['a', '"hello, world"']);
    assert.deepEqual(parseValueGroup('a, , @p(a,b)'), ['a', '', '@p(a,b)']);
    assert.deepEqual(parseValueGroup('10px calc(10px / 5)'), ['10px', 'calc(10px / 5)']);
});

test('noSpace keeps space-separated words together', () => {
    const group = input => parseValueGroup(input, { noSpace: true });
    assert.deepEqual(group('a b'), ['a b']);
    assert.deepEqual(group('a  b'), ['a b']);
    assert.deepEqual(group('a "hello, world"'), ['a "hello, world"']);
    assert.deepEqual(group('a,b'), ['a', 'b']);
    assert.deepEqual(group('a, b'), ['a', 'b']);
});

test('a custom symbol, as used by @grid', () => {
    const group = input => parseValueGroup(input, { symbol: '/', noSpace: true });
    assert.deepEqual(group('5 / 100%'), ['5', '100%']);
    assert.deepEqual(group('5/100%'), ['5', '100%']);
    assert.deepEqual(group('5 / calc(100% / 5)'), ['5', 'calc(100% / 5)']);
    assert.deepEqual(group('5x10 / @r(100px)'), ['5x10', '@r(100px)']);
});

test('space as the symbol makes commas part of the value', () => {
    const group = input => parseValueGroup(input, { symbol: ' ' });
    assert.deepEqual(group('5  100%'), ['5', '100%']);
    assert.deepEqual(group('5,100%'), ['5,100%']);
    assert.deepEqual(group('5, 100% 5'), ['5,100%', '5']);
    assert.deepEqual(group('5, 100% 5 8'), ['5,100%', '5', '8']);
});

test('verbose reports which symbol opened each group', () => {
    let groups = parseValueGroup('v 10 h -10 v 5', { symbol: ['v', 'h'], noSpace: true, verbose: true });
    assert.deepEqual(groups, [
        { group: 'v', value: '10' },
        { group: 'h', value: '-10' },
        { group: 'v', value: '5' },
    ]);
});

test('a symbol glued to a leading dot', () => {
    assert.deepEqual(parseValueGroup('1 _.5px', { symbol: '_', noSpace: true }), ['1', '.5px']);
});

test('a symbol with a max count stops splitting after it', () => {
    const group = input => parseValueGroup(input, { symbol: '/ 2', noSpace: true });
    assert.deepEqual(group('1 / 2 / 3'), ['1', '2', '3']);
    assert.deepEqual(group('1 / 2 / 3 / 4'), ['1', '2', '3 / 4']);
});
