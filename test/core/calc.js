import test from 'node:test';
import assert from 'node:assert/strict';

import calc, { deref } from '../../src/core/calc.js';

test('basic operations', () => {
    assert.equal(calc('2 + 2'), 4);
    assert.equal(calc('2 - 2'), 0);
    assert.equal(calc('2 * 2'), 4);
    assert.equal(calc('2 / 2'), 1);
    assert.equal(calc('2 % 7'), 2);
});

test('precedence', () => {
    assert.equal(calc('(1 + 2) * 10'), 30);
    assert.equal(calc('1 + 2 * 10'), 21);
    assert.equal(calc('10 - (5 - 2 / 2)'), 6);
});

test('Math functions and constants', () => {
    assert.equal(calc('π * 2'), Math.PI * 2);
    assert.equal(calc('cos(2)'), Math.cos(2));
    assert.equal(calc('sin(π) * cos(2)'), Math.sin(Math.PI) * Math.cos(2));
    assert.equal(calc('2π'), 2 * Math.PI);
    assert.equal(calc('3π + 1'), 3 * Math.PI + 1);
    assert.equal(calc('2π * 0.5'), 2 * Math.PI * 0.5);
    assert.equal(calc('.5π'), 0.5 * Math.PI);
});

test('context values', () => {
    assert.equal(calc('a + b + 2', { a: 2, b: 3 }), 7);
    assert.equal(calc('a + x + 2', { a: 2 }), 4);
    assert.equal(calc('-a + 2', { a: 2 }), 0);
});

test('negated functions', () => {
    assert.equal(calc('-fn()', { fn: () => 5 }), -5);
    assert.equal(calc('-fn() + 2', { fn: () => 5 }), -3);
    assert.equal(calc('--fn()', { fn: () => 5 }), 5);
});

test('cyclic references resolve to zero', () => {
    assert.equal(calc('cos(t)', { t: '2t' }), Math.cos(0));
    assert.equal(calc('cos(t)', { t: '2*t' }), Math.cos(0));
    assert.equal(calc('cos(t)', { t: 'x(t)' }), Math.cos(0));
    assert.equal(calc('cos(t)', { t: 'x' }), Math.cos(0));
    // x is unresolvable, so the value "2x" reads as a dimensioned 2
    assert.equal(calc('cos(t)', { t: '2x' }), Math.cos(2));
    assert.equal(calc('cos(t)', { t: 'sin(t)' }), Math.cos(0));
    // a self-reference is cut at its first recurrence
    assert.equal(calc('cos(t)', { t: 'cos(t)' }), Math.cos(Math.cos(0)));
    assert.equal(calc('t', { t: 'sin(t)' }), 0);
    assert.equal(calc('sin(t)', { t: '2s', s: 't', b: 'sin(a)', a: 'b' }), 0);
});

test('repeated string-valued variables are not cycles', () => {
    // the 4th reference to a variable holding a string used to be
    // mistaken for a cyclic reference and evaluated to 0
    assert.equal(calc('x+x+x+x', { x: '5' }), 20);
    assert.equal(calc('x*x*x*x', { x: 'y', y: 2 }), 16);
    assert.equal(calc('sin(x)+cos(x)+x+x', { x: '1' }), Math.sin(1) + Math.cos(1) + 2);
});

test('prototype names stay inert', () => {
    // valueOf(1) used to throw through Object.prototype lookups
    assert.equal(calc('valueOf(1)'), 0);
    assert.equal(calc('hasOwnProperty(1)'), 0);
    assert.equal(calc('constructor(8)'), 0);
    assert.equal(calc('toString(16)'), 0);
    assert.equal(calc('__proto__'), 0);
});

test('exponentiation is right-associative', () => {
    assert.equal(calc('2 ^ 3'), 8);
    assert.equal(calc('2 ^ 0'), 1);
    assert.equal(calc('4 ^ 0.5'), 2);
    assert.equal(calc('2 ^ 3 ^ 2'), 512);
    assert.equal(calc('(2 ^ 3) ^ 2'), 64);
    assert.equal(calc('2**3'), 8);
    assert.equal(calc('2 ** 3'), 8);
    assert.equal(calc('4**0.5'), 2);
    assert.equal(calc('2**3**2'), 512);
    assert.equal(calc('.618^4 * cos(2π*.618)'), 0.618 ** 4 * Math.cos(2 * Math.PI * 0.618));
});

test('comparison operators', () => {
    assert.equal(calc('3>2'), 1);
    assert.equal(calc('2 > 3'), 0);
    assert.equal(calc('3 < 2'), 0);
    assert.equal(calc('2 < 3'), 1);
    assert.equal(calc('n< 3', { n: 2 }), 1);
    assert.equal(calc('3 >= 3'), 1);
    assert.equal(calc('3 <= 3'), 1);
    assert.equal(calc('3 == 3'), 1);
    assert.equal(calc('3 != 2'), 1);
    assert.equal(calc('3 = 3'), 1);
    assert.equal(calc('3 ≤ 4'), 1);
    assert.equal(calc('3 ≥ 2'), 1);
    assert.equal(calc('3 ≠ 3'), 0);
});

test('logical operators', () => {
    assert.equal(calc('1 && 1'), 1);
    assert.equal(calc('1 && 0'), 0);
    assert.equal(calc('0 || 1'), 1);
    assert.equal(calc('0 || 0'), 0);
    assert.equal(calc('1 ∧ 1'), 1);
    assert.equal(calc('0 ∨ 1'), 1);
});

test('bitwise operators', () => {
    assert.equal(calc('5 & 3'), 1);
    assert.equal(calc('5 | 3'), 7);
    assert.equal(calc('8 >> 2'), 2);
    assert.equal(calc('2 << 2'), 8);
});

test('scientific notation', () => {
    assert.equal(calc('1e2'), 100);
    assert.equal(calc('1e-2'), 0.01);
    assert.equal(calc('2.5e3'), 2500);
    assert.equal(calc('1e2 + 1'), 101);
    assert.equal(calc('-1e2'), -100);
    assert.equal(calc('1E2'), 100);
    assert.equal(calc('1.5e+2'), 150);
});

test('negative numbers', () => {
    assert.equal(calc('-5'), -5);
    assert.equal(calc('-5 + 3'), -2);
    assert.equal(calc('3 + -5'), -2);
    assert.equal(calc('3 * -2'), -6);
    assert.equal(calc('-3 * -2'), 6);
    assert.equal(calc('(-5)'), -5);
});

test('decimal numbers', () => {
    assert.equal(calc('0.5 + 0.5'), 1);
    assert.equal(calc('.5 + .5'), 1);
    assert.equal(calc('3.14159'), 3.14159);
    assert.equal(calc('0.1 * 10'), 1);
});

test('nested parentheses', () => {
    assert.equal(calc('((1 + 2))'), 3);
    assert.equal(calc('((1 + 2) * (3 + 4))'), 21);
    assert.equal(calc('(((1)))'), 1);
    assert.equal(calc('(1 + (2 * (3 + 4)))'), 15);
});

test('multi-argument functions', () => {
    assert.equal(calc('max(1, 2, 3)'), 3);
    assert.equal(calc('min(5, 2, 8)'), 2);
    assert.equal(calc('pow(2, 3)'), 8);
    assert.equal(calc('gcd(12, 8)'), 4);
    assert.equal(calc('hypot(3, 4)'), 5);
});

test('nested and composed functions', () => {
    assert.equal(calc('sin(cos(0))'), Math.sin(Math.cos(0)));
    assert.equal(calc('abs(sin(-1))'), Math.abs(Math.sin(-1)));
    assert.equal(calc('sqrt(abs(-16))'), 4);
    assert.equal(calc('max(sin(0), cos(0))'), 1);
    assert.equal(calc('sqrt.abs(-16)'), 4);
});

test('variables with a coefficient', () => {
    assert.equal(calc('2x', { x: 5 }), 10);
    assert.equal(calc('3x + 2y', { x: 2, y: 3 }), 12);
    assert.equal(calc('-2x', { x: 3 }), -6);
    assert.equal(calc('0.5x', { x: 10 }), 5);
    assert.equal(calc('2t', { t: 3 }), 6);
    assert.equal(calc('5t + 3', { t: 2 }), 13);
    assert.equal(calc('.5t', { t: 4 }), 2);
    // a variable followed by a negative number is a subtraction
    assert.equal(calc('k-1', { k: 3 }), 2);
    assert.equal(calc('x-2', { x: 5 }), 3);
    assert.equal(calc('(k-1)*2', { k: 4 }), 6);
});

test('chained operations', () => {
    assert.equal(calc('1 + 2 + 3 + 4'), 10);
    assert.equal(calc('2 * 3 * 4'), 24);
    assert.equal(calc('100 / 10 / 2'), 5);
    assert.equal(calc('10 - 3 - 2'), 5);
});

test('mixed operations', () => {
    assert.equal(calc('2 + 3 * 4 - 5'), 9);
    assert.equal(calc('(2 + 3) * (4 - 1)'), 15);
    assert.equal(calc('10 / 2 + 3 * 4'), 17);
    assert.equal(calc('2 ^ 3 + 1'), 9);
});

test('empty input, division by zero and NaN', () => {
    assert.equal(calc('0'), 0);
    assert.equal(calc(''), 0);
    assert.equal(calc('   '), 0);
    assert.equal(calc('1 / 0'), Infinity);
    assert.equal(calc('-1 / 0'), -Infinity);
    // NaN falls back to 0
    assert.equal(calc('0 / 0'), 0);
    assert.equal(calc('sqrt(-1)'), 0);
});

test('context functions', () => {
    assert.equal(calc('double(5)', { double: x => x * 2 }), 10);
    assert.equal(calc('add(2, 3)', { add: (a, b) => a + b }), 5);
    assert.equal(calc('triple(double(2))', { double: x => x * 2, triple: x => x * 3 }), 12);
});

test('unicode operators', () => {
    assert.equal(calc('6 ÷ 2'), 3);
    assert.equal(calc('π'), Math.PI);
});

test('expressions held in context variables', () => {
    const k = 3;
    const t = 6.230825429619756;
    const context = {
        px: '(k-1)*cos(t) + cos((k-1)*t)',
        py: '(k-1)*sin(t) - sin((k-1)*t)',
        k, t,
    };
    assert.equal(calc('px', context), (k - 1) * Math.cos(t) + Math.cos((k - 1) * t));
    assert.equal(calc('py', context), (k - 1) * Math.sin(t) - Math.sin((k - 1) * t));
});

test('implicit multiplication', () => {
    // a variable followed by a digit is one name (x1, y2), not a product
    assert.equal(calc('x1', { x1: 99 }), 99);
    assert.equal(calc('y2', { y2: 88 }), 88);
    assert.equal(calc('x1', { x: 5 }), 0);

    assert.equal(calc('xπ', { x: 2 }), 2 * Math.PI);
    assert.equal(calc('πx', { x: 2 }), Math.PI * 2);
    assert.equal(calc('bb', { b: 2 }), 0);
    assert.equal(calc('ππ'), Math.PI * Math.PI);

    assert.equal(calc('2(3+4)'), 14);
    assert.equal(calc('3(2+1)'), 9);
    assert.equal(calc('(2+3)4'), 20);
    assert.equal(calc('(2+3)x', { x: 2 }), 10);
    assert.equal(calc('(1+2)(3+4)'), 21);
    assert.equal(calc('2(3)(4)'), 24);

    assert.equal(calc('1e2x', { x: 3 }), 300);
    assert.equal(calc('2e1y', { y: 5 }), 100);
});

test('subtraction after a closing parenthesis', () => {
    // ')-81' used to tokenize as ')' followed by the number -81
    assert.equal(calc('(1+2)-3'), 0);
    assert.equal(calc('(1+2) - 3'), 0);
    let t = Math.PI / 4;
    let expected = 50 * Math.abs(Math.sin(2.5 * t)) - 81;
    assert.equal(calc('50*abs.sin(2.5t)-81', { t }), expected);
    assert.equal(calc('50*abs.sin(2.5t) - 81', { t }), expected);
});

test('implicit multiplication with functions', () => {
    // '2sin(1)' used to glue into a single unknown function name
    assert.equal(calc('2sin(1)'), 2 * Math.sin(1));
    assert.equal(calc('-2sin(1)'), -2 * Math.sin(1));
    assert.equal(calc('2min(3, 4)'), 6);
    // everything after a glued '2π' used to be dropped
    assert.equal(calc('2πsin(1)'), 2 * Math.PI * Math.sin(1));
    assert.equal(calc('sin(2πt)', { t: 0.25 }), Math.sin(2 * Math.PI * 0.25));
    assert.equal(calc('2πx', { x: 3 }), 2 * Math.PI * 3);
    assert.equal(calc('3 + -2x', { x: 4 }), -5);
});

test('space-separated adjacency multiplies', () => {
    assert.equal(calc('2 sin(1)'), 2 * Math.sin(1));
    assert.equal(calc('2 x', { x: 3 }), 6);
    assert.equal(calc('2 (3)'), 6);
    // '-1' after a space is still a subtraction
    assert.equal(calc('k -1', { k: 3 }), 2);
    assert.equal(calc('2 -1'), 1);
});

test('unary minus in arguments', () => {
    assert.equal(calc('sin(-x)', { x: 2 }), Math.sin(-2));
    assert.equal(calc('max(1, -x)', { x: 2 }), 1);
    assert.equal(calc('max(-x, 5)', { x: 2 }), 5);
    assert.equal(calc('sin(-(3))'), Math.sin(-3));
    assert.equal(calc('-x1', { x1: 5 }), -5);
});

test('variables holding dimensioned values', () => {
    // the numeric part joins the math; units attach back via $ suffixes
    assert.equal(calc('w * 2', { w: '10px' }), 20);
    assert.equal(calc('w + 4', { w: '10px' }), 14);
    assert.equal(calc('-w', { w: '10px' }), -10);
    assert.equal(calc('2w', { w: '10px' }), 20);
    assert.equal(calc('p / 2', { p: '50%' }), 25);
    assert.equal(calc('t * 2', { t: '2.5s' }), 5);
    assert.equal(calc('a', { a: '.5turn' }), 0.5);
    assert.equal(calc('a', { a: '-45deg' }), -45);
    assert.equal(calc('sin(w)', { w: '1rad' }), Math.sin(1));
    assert.equal(calc('b * 2', { b: 'a', a: '10px' }), 20);
    // a resolvable word wins over the unit reading: 2s stays 2*s
    assert.equal(calc('d', { d: '2s', s: 5 }), 10);
    assert.equal(calc('v', { v: '2t', t: 3 }), 6);
    // unresolvable words act as units, no validation
    assert.equal(calc('v', { v: '2t' }), 2);
    assert.equal(calc('a * 2', { a: '3vmin' }), 6);
    assert.equal(calc('v', { v: '2π' }), 2 * Math.PI);
    assert.equal(calc('c + 1', { c: 'red' }), 1);
});

test('deref: a lone variable name acts as a generation-time var()', () => {
    const ctx = {
        c: 'tomato', t: 'rotate(30deg)', w: '10px',
        s: 'calc(100px + 10em)', n: '3', e: 'n + 2',
        a: 'b', b: 'tomato', 'my-color': 'gold',
    };
    // non-math values pass through verbatim
    assert.equal(deref('c', ctx), 'tomato');
    assert.equal(deref('t', ctx), 'rotate(30deg)');
    assert.equal(deref('w', ctx), '10px');
    assert.equal(deref('s', ctx), 'calc(100px + 10em)');
    assert.equal(deref('my-color', ctx), 'gold');
    // single-name chains resolve to the final value
    assert.equal(deref('a', ctx), 'tomato');
    // values that read as math stay on the numeric path
    assert.equal(deref('n', ctx), undefined);
    assert.equal(deref('e', ctx), undefined);
    // operations and unknown names are not references
    assert.equal(deref('n + 2', ctx), undefined);
    assert.equal(deref('x', ctx), undefined);
});

test('subtraction between coefficient terms', () => {
    // 'x-9.01' used to tokenize as x followed by the number -9.01
    let ctx = { x: 2, t: 0.5 };
    assert.equal(calc('2x-3t', ctx), 2 * 2 - 3 * 0.5);
    assert.equal(calc('2x - 3t', ctx), 2 * 2 - 3 * 0.5);
    assert.equal(calc('13.6x-9.01t', ctx), 13.6 * 2 - 9.01 * 0.5);
    assert.equal(calc('13.6x - 9.01t', ctx), 13.6 * 2 - 9.01 * 0.5);
    // inside function arguments, where spaces used to be lost
    assert.equal(calc('sin(2x-3t)', ctx), Math.sin(2 * 2 - 3 * 0.5));
    assert.equal(calc('sin(2x - 3t)', ctx), Math.sin(2 * 2 - 3 * 0.5));
    assert.equal(calc('sin(13.6x-9.01t)', ctx), Math.sin(13.6 * 2 - 9.01 * 0.5));
});

test('logical not', () => {
    // `!` used to be a silent no-op that corrupted the expression
    assert.equal(calc('!0'), 1);
    assert.equal(calc('!1'), 0);
    assert.equal(calc('!!5'), 1);
    assert.equal(calc('!(1 > 2)'), 1);
    assert.equal(calc('!x', { x: 5 }), 0);
    assert.equal(calc('!x', { x: 0 }), 1);
    assert.equal(calc('1 + !0'), 2);
    assert.equal(calc('!0 + 1'), 2);
    assert.equal(calc('!-1'), 0);
});

test('conventional operator precedence', () => {
    // & over |, shifts over comparisons, && over ||
    assert.equal(calc('1|2&2'), 3);
    assert.equal(calc('1==4>>2'), 1);
    assert.equal(calc('2<<1+1'), 8);
    assert.equal(calc('1 || 0 && 0'), 1);
    assert.equal(calc('2^3^2'), 512);
});

test('short-circuit evaluation', () => {
    const boom = () => { throw new Error('evaluated'); };
    assert.equal(calc('x == 1 && boom(1)', { x: 0, boom }), 0);
    assert.equal(calc('1 || boom(1)', { boom }), 1);
    assert.equal(calc('match(1, 2, boom(1))', { boom }), 2);
    assert.equal(calc('match(0, boom(1), 3)', { boom }), 3);
    // a context value shadowing the built-in still wins
    assert.equal(calc('match(1, 2, 3)', { match: () => 99 }), 99);
    assert.equal(calc('-match(1, 2, 3)'), -2);
});

test('a bare reference to a zero-argument function calls it', () => {
    // the selector context passes `random` as a function; `random > .5`
    // used to read it as 0 and compile the function source
    assert.equal(calc('random', { random: () => 0.25 }), 0.25);
    assert.equal(calc('random > .2', { random: () => 0.25 }), 1);
    assert.equal(calc('-random', { random: () => 0.25 }), -0.25);
    assert.equal(calc('2random', { random: () => 0.25 }), 0.5);
    assert.equal(calc('random * 2 + 1', { random: () => 0.25 }), 1.5);
    assert.equal(calc('random < 1'), 1);
    // functions that need arguments stay a miss
    assert.equal(calc('abs'), 0);
    assert.equal(calc('sin + 1'), 1);
    assert.equal(calc('-fn', { fn: x => x }), 0);
});

test('dashed names the context defines read as one variable', () => {
    // font-size used to tokenize as font - size; a name the context
    // has wins over subtraction, longest defined name first
    assert.equal(calc('font-size * 2', { 'font-size': 5 }), 10);
    assert.equal(calc('-font-size', { 'font-size': 5 }), -5);
    assert.equal(calc('2font-size', { 'font-size': 5 }), 10);
    assert.equal(calc('sin(font-size)', { 'font-size': 0 }), 0);
    assert.equal(calc('cell-w - cell-h', { 'cell-w': 5, 'cell-h': 2 }), 3);
    assert.equal(calc('a-b-c', { 'a-b-c': 7 }), 7);
    assert.equal(calc('a-b-c', { 'a-b': 7, c: 1 }), 6);
    assert.equal(calc('a-b-c', { a: 7, b: 1, c: 1 }), 5);
    assert.equal(calc('w-1', { w: 5 }), 4);
    assert.equal(calc('w-1', { w: 5, 'w-1': 7 }), 7);
    assert.equal(calc('w - 1', { w: 5, 'w-1': 7 }), 4);
    assert.equal(calc('x1-y', { 'x1-y': 3 }), 3);
    assert.equal(calc('x1-y', { x1: 3, y: 1 }), 2);
    assert.equal(calc('a-b^2', { 'a-b': 3 }), 9);
    assert.equal(calc('my-fn(2)', { 'my-fn': x => x * 2 }), 4);
    assert.equal(calc('größe-2 * 2', { 'größe-2': 4 }), 8);
    // through a variable value
    assert.equal(calc('a', { a: 'cell-w * 2', 'cell-w': 5 }), 10);
    // scientific notation stays a number
    assert.equal(calc('1e-3', { 'e-3': 9 }), 0.001);
    // the same input compiles per shape of the context
    assert.equal(calc('a-b', { a: 3, b: 1 }), 2);
    assert.equal(calc('a-b', { 'a-b': 9, a: 3, b: 1 }), 9);
    assert.equal(calc('a-b', { a: 3, b: 1 }), 2);
});
