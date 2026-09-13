import test from 'node:test';
import assert from 'node:assert/strict';

import parsePattern from '../../src/parser/parse-pattern.js';

const block = (name, args = [], value = []) => ({ type: 'block', name, args, value });
const statement = (name, value) => ({ type: 'statement', name, value });

test('statements', () => {
    assert.deepEqual(parsePattern('color: red'), [statement('color', 'red')]);
    assert.deepEqual(parsePattern('color: red;'), [statement('color', 'red')]);
});

test('blocks with argument lists', () => {
    assert.deepEqual(parsePattern('match {}'), [block('match')]);
    assert.deepEqual(parsePattern('match(x>y) {}'), [block('match', ['x>y'])]);
    // commas inside calls belong to the argument
    assert.deepEqual(parsePattern('match(atan(y, x) > 3) {}'), [block('match', ['atan(y,x) > 3'])]);
});

test('a comma list of selectors shares one body', () => {
    assert.deepEqual(parsePattern('a, b {}'), [block('a'), block('b')]);
    assert.deepEqual(parsePattern('match(2), match {}'), [block('match', ['2']), block('match')]);
    // duplicates and empty entries collapse
    assert.deepEqual(parsePattern('a,,,{}'), [block('a')]);
    assert.deepEqual(parsePattern('a, a {}'), [block('a')]);
});

test('an extra closing paren does not break the block', () => {
    assert.deepEqual(parsePattern('match()) {}'), [block('match')]);
    assert.deepEqual(parsePattern('match(1)) {}'), [block('match', ['1'])]);
});

test('statements and blocks nest', () => {
    assert.deepEqual(parsePattern(`
        color: red;
        match(x>y) {
          color: blue;
        }
    `), [
        statement('color', 'red'),
        block('match', ['x>y'], [statement('color', 'blue')]),
    ]);
});

test('repeat headers and nested repeats use the existing block grammar', () => {
    assert.deepEqual(parsePattern(`
        repeat(4 as outer) {
          value: outer*2;
          repeat(3 as inner, value > 8) {
            value: value + inner;
          }
        }
    `), [
        block('repeat', ['4 as outer'], [
            statement('value', 'outer*2'),
            block('repeat', ['3 as inner', 'value > 8'], [
                statement('value', 'value + inner'),
            ]),
        ]),
    ]);
});

test('selector deduplication tells the arguments apart', () => {
    assert.deepEqual(parsePattern('match(a, b), match(ab), match(a, b) {}'), [
        block('match', ['a', 'b']),
        block('match', ['ab']),
    ]);
});
