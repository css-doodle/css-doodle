import test from 'node:test';
import assert from 'node:assert/strict';

import selector from '../../src/core/selector.js';

// a cell at (x, y) with 1-based index `count` in a 4x4 grid
const cell = (x, y, count) => ({ x, y, count, grid: { count: 16, x: 4, y: 4 } });

test('at matches the exact coordinates', () => {
    let at = selector.at(cell(2, 3, 10));
    assert.equal(at(2, 3), true);
    assert.equal(at(1, 4), false);
    assert.equal(selector.at(cell(1, 4, 10))(1, 4), true);
});

test('nth matches the cell index against an+b expressions', () => {
    let nth = selector.nth(cell(2, 3, 10));
    assert.equal(nth(10), true);
    assert.equal(nth(9), false);
    assert.equal(nth('2n'), true);
    assert.equal(nth('n'), true);
    assert.equal(nth('2n + 2'), true);
    assert.equal(nth('2n+2'), true);

    nth = selector.nth(cell(3, 1, 3));
    assert.equal(nth('odd'), true);
    assert.equal(nth('n + 1'), true);
    assert.equal(nth('3n'), true);
});

test('x and y match the column and row', () => {
    let a = cell(2, 3, 10);
    assert.equal(selector.y(a)(3), true);
    assert.equal(selector.y(a)('odd'), true);
    assert.equal(selector.y(a)('even'), false);
    assert.equal(selector.x(a)(2), true);
    assert.equal(selector.x(a)('even'), true);
    assert.equal(selector.x(a)('odd'), false);

    let b = cell(3, 2, 7);
    assert.equal(selector.y(b)('odd'), false);
    assert.equal(selector.y(b)('even'), true);
});

test('even and odd follow the checkerboard, not the index', () => {
    assert.equal(selector.even(cell(2, 3, 10))(), true);
    assert.equal(selector.odd(cell(2, 3, 10))(), false);
    assert.equal(selector.even(cell(3, 1, 3))(), false);
    assert.equal(selector.odd(cell(3, 1, 3))(), true);
});

test('match evaluates an expression over the cell variables', () => {
    let match = selector.match(cell(2, 3, 10));
    assert.equal(match('x = 2'), true);
    assert.equal(match('y = 3'), true);
    assert.equal(match('x = 2 && y = 3'), true);
    assert.equal(match('x == 2 && y == 3'), true);
    assert.equal(match('x < 3'), true);
});

test('cell accepts comma lists, keywords and index checks', () => {
    let match = selector.cell(cell(2, 3, 10));
    assert.equal(match('x = 2, y = 3'), true);
    assert.equal(match('x = 2 && y = 3'), true);
    assert.equal(match('even'), true);
    assert.equal(match('false'), false);
    assert.equal(match('x > 3'), false);
    assert.equal(match('i = 10'), true);
    assert.equal(match(), true);
});
