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
    assert.deepEqual(parsePattern('match(x>y) {}'), [block('match', ['x>y'])]);
    // commas inside calls belong to the argument
    assert.deepEqual(parsePattern('match(atan(y, x) > 3) {}'), [block('match', ['atan(y,x) > 3'])]);
});

test('match {} holds arms, each head is its test', () => {
    const arm = (test, value = []) => ({ type: 'arm', test, value });
    assert.deepEqual(parsePattern('match {}'), [{ type: 'block', name: 'match', arms: [] }]);
    assert.deepEqual(parsePattern(`
        match {
          x > y { color: red }
          mod(x, 2) == 0 { match(y>1) {} }
          else { color: blue }
        }
        color: red
    `), [
        { type: 'block', name: 'match', arms: [
            arm('x > y', [statement('color', 'red')]),
            arm('mod(x,2) == 0', [block('match', ['y>1'])]),
            arm('else', [statement('color', 'blue')]),
        ] },
        statement('color', 'red'),
    ]);
    assert.deepEqual(parsePattern('match { a: 1; x {} }').at(0).arms, [statement('a', '1'), arm('x')]);
});

test('a comma list of selectors is no block', () => {
    assert.deepEqual(parsePattern('a, b {}'), [{ type: 'text', value: 'a,b {}' }]);
    assert.deepEqual(parsePattern('match(x > 1), repeat(3) { fill: red }'), [{ type: 'text', value: 'match(x > 1),repeat(3) {}' }]);
});

test('line comments are whitespace, a head without a colon is text', () => {
    assert.deepEqual(parsePattern('fill: red; // a note\n size: .5'), [statement('fill', 'red'), statement('size', '.5')]);
    assert.deepEqual(parsePattern('fill #fff; k = 1'), [{ type: 'text', value: 'fill #fff' }, { type: 'text', value: 'k = 1' }]);
    assert.deepEqual(parsePattern('fill: red; k = 1; size: .5'), [statement('fill', 'red'), { type: 'text', value: 'k = 1' }, statement('size', '.5')]);
    assert.deepEqual(parsePattern('match(x) { fill: red; junk }'), [block('match', ['x'], [statement('fill', 'red'), { type: 'text', value: 'junk' }])]);
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
