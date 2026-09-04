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
    assert.deepEqual(parsePattern('match(x>y, 2*x-y == 0) {}'), [block('match', ['x>y', '2*x-y == 0'])]);
    // commas inside calls belong to the argument
    assert.deepEqual(parsePattern('match(atan(y, x) > 3) {}'), [block('match', ['atan(y,x) > 3'])]);
    assert.deepEqual(
        parsePattern('match(max(x, y) > 3, min(a, b) < 1) {}'),
        [block('match', ['max(x,y) > 3', 'min(a,b) < 1'])]
    );
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
