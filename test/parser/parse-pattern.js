import test from 'node:test';
import assert from 'node:assert/strict';

import parsePattern from '../../src/parser/parse-pattern.js';

const block = (name, args = [], value = []) => ({ type: 'block', name, args, value });
const statement = (name, value) => ({ type: 'statement', name, value });
const match = (test, value = []) => ({ type: 'block', name: 'match', arms: [{ type: 'arm', test, value }] });

test('statements', () => {
    assert.deepEqual(parsePattern('color: red'), [statement('color', 'red')]);
    assert.deepEqual(parsePattern('color: red;'), [statement('color', 'red')]);
    // a ; inside parentheses stays in the value
    assert.deepEqual(parsePattern('fill: f(a; b); color: red;'), [statement('fill', 'f(a;b)'), statement('color', 'red')]);
});

test('several names take a value each, or all the whole value', () => {
    assert.deepEqual(parsePattern('a, b: 1, vec2(2, 3)'), [statement('a', '1'), statement('b', 'vec2(2,3)')]);
    assert.deepEqual(parsePattern('p.x, p.y: 1, 2'), [statement('p.x', '1'), statement('p.y', '2')]);
    assert.deepEqual(parsePattern('a, b: 0'), [statement('a', '0'), statement('b', '0')]);
    assert.deepEqual(parsePattern('a, b: 1, 2, 3'), [statement('a', '1,2,3'), statement('b', '1,2,3')]);
    // a space before the colon is no part of the name, as in the other languages
    assert.deepEqual(parsePattern('k : 1'), [statement('k', '1')]);
});

test('blocks with argument lists', () => {
    assert.deepEqual(parsePattern('match(x>y) {}'), [match('x>y')]);
    // commas inside calls belong to the argument
    assert.deepEqual(parsePattern('match(atan(y, x) > 3) {}'), [match('atan(y,x) > 3')]);
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
            arm('mod(x,2) == 0', [match('y>1')]),
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
    assert.deepEqual(parsePattern('texture { background: url(https://a/b.png) }'), [{ type: 'texture', name: 'texture', value: 'background:url(https://a/b.png)' }]);
    assert.deepEqual(parsePattern('fill #fff; k = 1'), [{ type: 'text', value: 'fill #fff' }, { type: 'text', value: 'k = 1' }]);
    assert.deepEqual(parsePattern('fill: red; k = 1; size: .5'), [statement('fill', 'red'), { type: 'text', value: 'k = 1' }, statement('size', '.5')]);
    assert.deepEqual(parsePattern('match(x) { fill: red; junk }'), [match('x', [statement('fill', 'red'), { type: 'text', value: 'junk' }])]);
});

test('an extra closing paren does not break the block', () => {
    assert.deepEqual(parsePattern('match()) {}'), [match('')]);
    assert.deepEqual(parsePattern('match(1)) {}'), [match('1')]);
});

test('statements and blocks nest', () => {
    assert.deepEqual(parsePattern(`
        color: red;
        match(x>y) {
          color: blue;
        }
    `), [
        statement('color', 'red'),
        match('x>y', [statement('color', 'blue')]),
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

test('k*n {} is repeat(n as k) {}, but an arm test inside match {}', () => {
    assert.deepEqual(parsePattern('j*4 { k * n { a: j*k } }'), [
        block('repeat', ['4 as j'], [block('repeat', ['n as k'], [statement('a', 'j*k')])]),
    ]);
    assert.deepEqual(parsePattern('k*1-n {} k*1000-1 {}'), [block('repeat', ['1-n as k']), block('repeat', ['1000-1 as k'])]);
    assert.deepEqual(parsePattern('match { k*2 {} }').at(0).arms, [{ type: 'arm', test: 'k*2', value: [] }]);
});

test('loop heads side by side nest, the first outermost', () => {
    let nested = parsePattern('i*2 { j * n { k*5-1 { a: i } } }');
    assert.deepEqual(parsePattern('i*2 j * n k*5-1 { a: i }'), nested);
    assert.deepEqual(parsePattern('i*2 foo {}'), [{ type: 'text', value: 'i*2 foo {}' }]);
    assert.deepEqual(parsePattern('i*2j*3 {}'), [{ type: 'text', value: 'i*2j*3 {}' }]);
    assert.deepEqual(parsePattern('k*1 - 4 {}'), [{ type: 'text', value: 'k*1 - 4 {}' }]);
    assert.deepEqual(parsePattern('match { i*2 j*3 {} }').at(0).arms, [{ type: 'arm', test: 'i*2 j*3', value: [] }]);
});
