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
    assert.deepEqual(parsePattern('cond {}'), [block('cond')]);
    assert.deepEqual(parsePattern('cond(x>y) {}'), [block('cond', ['x>y'])]);
    // the legacy name is passed through as written; the generator accepts both
    assert.deepEqual(parsePattern('match(x>y) {}'), [block('match', ['x>y'])]);
    assert.deepEqual(parsePattern('cond(x>y, 2*x-y == 0) {}'), [block('cond', ['x>y', '2*x-y == 0'])]);
    // commas inside calls belong to the argument
    assert.deepEqual(parsePattern('cond(atan(y, x) > 3) {}'), [block('cond', ['atan(y,x) > 3'])]);
    assert.deepEqual(
        parsePattern('cond(max(x, y) > 3, min(a, b) < 1) {}'),
        [block('cond', ['max(x,y) > 3', 'min(a,b) < 1'])]
    );
});

test('a comma list of selectors shares one body', () => {
    assert.deepEqual(parsePattern('a, b {}'), [block('a'), block('b')]);
    assert.deepEqual(parsePattern('cond(2), cond {}'), [block('cond', ['2']), block('cond')]);
    // duplicates and empty entries collapse
    assert.deepEqual(parsePattern('a,,,{}'), [block('a')]);
    assert.deepEqual(parsePattern('a, a {}'), [block('a')]);
});

test('an extra closing paren does not break the block', () => {
    assert.deepEqual(parsePattern('cond()) {}'), [block('cond')]);
    assert.deepEqual(parsePattern('cond(1)) {}'), [block('cond', ['1'])]);
});

test('statements and blocks nest', () => {
    assert.deepEqual(parsePattern(`
        color: red;
        cond(x>y) {
          color: blue;
        }
    `), [
        statement('color', 'red'),
        block('cond', ['x>y'], [statement('color', 'blue')]),
    ]);
});
