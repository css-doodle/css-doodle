import test from 'node:test';
import assert from 'node:assert/strict';

import selector from '../../src/core/selector.js';
import seedrandom from '../../src/lib/seedrandom.js';

// a cell at (x, y) with 1-based index `count` in a 4x4 grid
const cell = (x, y, count) => ({ x, y, count, grid: { count: 16, x: 4, y: 4 } });
// the environment of the pass: a random stream and the per-call-site memo
const env = { random: Math.random, context: {} };

// the indices of the 16 cells `select` picks in one seeded pass
function picked(select, seed = 'a') {
    let env = { random: seedrandom(seed), context: {} };
    let list = [];
    for (let i = 1; i <= 16; ++i) {
        if (select(cell((i - 1) % 4 + 1, Math.ceil(i / 4), i), env)) list.push(i);
    }
    return list;
}

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

test('nth counts n from 0, so b itself matches, and a negative a takes the first b', () => {
    let nth = (count, expr) => selector.nth(cell(1, 1, count))(expr);
    assert.deepEqual([1, 2, 3, 4, 5, 6, 7].map(i => nth(i, '3n + 1')), [true, false, false, true, false, false, true]);
    assert.deepEqual([1, 2, 3, 4, 5].map(i => nth(i, '-n + 3')), [true, true, true, false, false]);
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

test('z matches the depth and depth is its alias', () => {
    let a = { x: 1, y: 2, z: 3, count: 7, grid: { count: 16, x: 2, y: 2, z: 4 } };
    assert.equal(selector.z(a)(3), true);
    assert.equal(selector.z(a)(1), false);
    assert.equal(selector.z(a)('odd'), true);
    assert.equal(selector.z(a)('2n'), false);
    assert.equal(selector.depth, selector.z);
    // z and Z are in scope for expression selectors
    assert.equal(selector.match(a, env)({}, 'z == 3'), true);
    assert.equal(selector.match(a, env)({}, 'z == Z - 1'), true);
});

test('match evaluates an expression over the cell variables', () => {
    let match = expr => selector.match(cell(2, 3, 10), env)({}, expr);
    assert.equal(match('x = 2'), true);
    assert.equal(match('y = 3'), true);
    assert.equal(match('x = 2 && y = 3'), true);
    assert.equal(match('x == 2 && y == 3'), true);
    assert.equal(match('x < 3'), true);
});

test('nth, row, col and depth warn about an expression that is not an+b', () => {
    let warnings = [];
    let rules = { warn: message => warnings.push(message) };
    let a = cell(2, 3, 10);
    assert.equal(selector.row(a, { ...env, rules })('4/2'), false);
    assert.equal(selector.col(a, { ...env, rules })('x > 2'), false);
    assert.equal(selector.nth(a, { ...env, rules })('2n + 1 of'), false);
    assert.deepEqual(warnings.map(m => /an\+b/.test(m)), [true, true, true]);
    assert.match(warnings[0], /4\/2/);
});

test('cell accepts comma lists, keywords and index checks', () => {
    let match = (...args) => selector.cell(cell(2, 3, 10), env, 0)({}, ...args);
    assert.equal(match('x = 2, y = 3'), true);
    assert.equal(match('x = 2 && y = 3'), true);
    assert.equal(match('even'), true);
    assert.equal(match('false'), false);
    assert.equal(match('x > 3'), false);
    assert.equal(match('i = 10'), true);
    assert.equal(match(), true);
});

test('cell(even) and cell(odd) follow the checkerboard, not the index', () => {
    // (1, 2) is the 5th cell of a 4-column grid: odd by index, even on the board
    let a = cell(1, 2, 5);
    assert.equal(selector.cell(a, env, 0)({}, 'even'), true);
    assert.equal(selector.cell(a, env, 0)({}, 'odd'), false);
    assert.equal(selector.nth(a)('even'), false);
});

test('random(n) picks exactly n distinct cells from n = 1, below 1 it is a chance per cell', () => {
    let random = n => picked((c, env) => selector.random(c, env, 0)({}, n));
    for (let n of [1, 3, 15, 16]) assert.equal(random(n).length, n);
    assert.equal(random(40).length, 16);
    assert.equal(random(0).length, 0);
    assert.equal(random(-1).length, 0);
    let half = random(.5).length;
    assert.ok(half > 3 && half < 13, half);
    // the seed decides which cells
    let sets = ['a', 'b', 'c', 'd'].map(seed => picked((c, env) => selector.random(c, env, 0)({}, 3), seed).join());
    assert.ok(new Set(sets).size > 1, sets);
});

test('cell(random n) picks n cells', () => {
    assert.equal(picked((c, env) => selector.cell(c, env, 0)({}, 'random 3')).length, 3);
});

test('random() in a selector expression draws from the stream of the pass', () => {
    // 2 is out of reach of Math.random: only the pass stream gives it
    let env = { random: () => 2, context: {} };
    let a = cell(2, 3, 10);
    assert.equal(selector.match(a, env)({}, 'random() > 1'), true);
    assert.equal(selector.cell(a, env, 0)({}, 'random() > 1'), true);
    assert.equal(selector.random(a, env, 0)({}, 'random() * 8'), true);
});

test('each random argument of cell picks its own cells', () => {
    let env = { random: Math.random, context: {} };
    let picked = 0;
    for (let i = 1; i <= 16; ++i) {
        if (selector.cell(cell((i - 1) % 4 + 1, Math.ceil(i / 4), i), env, 0)({}, 'random 1', 'random 12')) picked++;
    }
    assert.ok(picked >= 12, picked);
});
