import test from 'node:test';
import assert from 'node:assert/strict';

import calc, { deref } from '../src/core/calc.js';
import compare from './_compare.js';

compare.use(calc);

test('basic operations', () => {
    compare('2 + 2', 4);
    compare('2 - 2', 0);
    compare('2 * 2', 4);
    compare('2 / 2', 1);
    compare('2 % 7', 2);
});

test('precedence', () => {
    compare('(1 + 2) * 10', 30);
    compare('1 + 2 * 10', 21);
    compare('10 - (5 - 2 / 2)', 6);
});

test('Math functions and constants', () => {
    compare('π * 2', Math.PI * 2);
    compare('cos(2)', Math.cos(2));
    compare('sin(π) * cos(2)', Math.sin(Math.PI) * Math.cos(2));
    compare('2π', 2 * Math.PI);
    compare('3π + 1', 3 * Math.PI + 1);
    compare('2π * 0.5', 2 * Math.PI * 0.5);
    compare('.5π', 0.5 * Math.PI);
});

test('context values', () => {
    compare(['a + b + 2', { a: 2, b: 3 }], 7);
    compare(['a + x + 2', { a: 2 }], 4);
    compare(['-a + 2', { a: 2 }], 0);
});

test('negative functions', t => {
    compare(['-fn()', { fn: () => 5 }], -5);
    compare(['-fn() + 2', { fn: () => 5 }], -3);
    compare(['--fn()', { fn: () => 5 }], 5); // double negative = positive
});

test('cyclic reference', () => {
    compare(['cos(t)', { t: '2t' }], Math.cos(0));
    compare(['cos(t)', { t: '2*t' }], Math.cos(0));
    compare(['cos(t)', { t: 'x(t)' }], Math.cos(0));
    compare(['cos(t)', { t: 'x' }], Math.cos(0));
    // x is unresolvable, so the value "2x" reads as a dimensioned 2
    compare(['cos(t)', { t: '2x' }], Math.cos(2));
    compare(['cos(t)', { t: 'sin(t)' }], Math.cos(0));
    // Self-reference is cut at its first recurrence
    compare(['cos(t)', { t: 'cos(t)' }], Math.cos(Math.cos(0)));
    compare(['t', { t: 'sin(t)' }], 0);
    compare(['t', { t: 'sin(t)' }], 0);
    compare(['sin(t)', { t: '2s', s: 't', 'b': 'sin(a)', a: 'b' }], 0);
});

test('repeated string-valued variables', () => {
    // The 4th reference to a variable holding a string used to be
    // mistaken for a cyclic reference and evaluated to 0
    compare(['x+x+x+x', { x: '5' }], 20);
    compare(['x*x*x*x', { x: 'y', y: 2 }], 16);
    compare(['sin(x)+cos(x)+x+x', { x: '1' }], Math.sin(1) + Math.cos(1) + 2);
});

test('prototype names stay inert', () => {
    // valueOf(1) used to throw through Object.prototype lookups
    compare('valueOf(1)', 0);
    compare('hasOwnProperty(1)', 0);
    compare('constructor(8)', 0);
    compare('toString(16)', 0);
    compare('__proto__', 0);
});

test('exponentiation', () => {
    compare('2 ^ 3', 8);
    compare('2 ^ 0', 1);
    compare('4 ^ 0.5', 2);
    compare('2 ^ 3 ^ 2', 512); // right-associative: 2^(3^2) = 2^9 = 512
    compare('(2 ^ 3) ^ 2', 64); // explicit left grouping
    // ** operator (JS style)
    compare('2**3', 8);
    compare('2 ** 3', 8);
    compare('4**0.5', 2);
    compare('.618^4 * cos(2π*.618)', (0.618**4 * Math.cos(2*Math.PI*0.618)));
    compare('2**3**2', 512); // right-associative like JS
});

test('comparison operators', () => {
    compare('3>2', 1);
    compare('2 > 3', 0);
    compare('3 < 2', 0);
    compare('2 < 3', 1);
    compare(['n< 3', { n: 2 }], 1);
    compare('2 < 3', 1);
    compare('3 >= 3', 1);
    compare('3 <= 3', 1);
    compare('3 == 3', 1);
    compare('3 != 2', 1);
    compare('3 = 3', 1);
    compare('3 ≤ 4', 1);
    compare('3 ≥ 2', 1);
    compare('3 ≠ 3', 0);
});

test('logical operators', () => {
    compare('1 && 1', 1);
    compare('1 && 0', 0);
    compare('0 || 1', 1);
    compare('0 || 0', 0);
    compare('1 ∧ 1', 1);
    compare('0 ∨ 1', 1);
});

test('bitwise operators', () => {
    compare('5 & 3', 1);
    compare('5 | 3', 7);
    compare('8 >> 2', 2);
    compare('2 << 2', 8);
});

test('scientific notation', () => {
    compare('1e2', 100);
    compare('1e-2', 0.01);
    compare('2.5e3', 2500);
    compare('1e2 + 1', 101);
    compare('-1e2', -100);
    compare('1E2', 100); // uppercase E
    compare('1.5e+2', 150);
});

test('negative numbers', () => {
    compare('-5', -5);
    compare('-5 + 3', -2);
    compare('3 + -5', -2);
    compare('3 * -2', -6);
    compare('-3 * -2', 6);
    compare('(-5)', -5);
});

test('decimal numbers', () => {
    compare('0.5 + 0.5', 1);
    compare('.5 + .5', 1);
    compare('3.14159', 3.14159);
    compare('0.1 * 10', 1);
});

test('nested parentheses', () => {
    compare('((1 + 2))', 3);
    compare('((1 + 2) * (3 + 4))', 21);
    compare('(((1)))', 1);
    compare('(1 + (2 * (3 + 4)))', 15);
});

test('multi-argument functions', () => {
    compare('max(1, 2, 3)', 3);
    compare('min(5, 2, 8)', 2);
    compare('pow(2, 3)', 8);
    compare(['gcd(12, 8)', {}], 4);
    compare('hypot(3, 4)', 5);
});

test('nested functions', () => {
    compare('sin(cos(0))', Math.sin(Math.cos(0)));
    compare('abs(sin(-1))', Math.abs(Math.sin(-1)));
    compare('sqrt(abs(-16))', 4);
    compare('max(sin(0), cos(0))', 1);
    compare('sqrt.abs(-16)', 4);
});

test('variable with coefficient', () => {
    compare(['2x', { x: 5 }], 10);
    compare(['3x + 2y', { x: 2, y: 3 }], 12);
    compare(['-2x', { x: 3 }], -6);
    compare(['0.5x', { x: 10 }], 5);
    compare(['2t', { t: 3 }], 6);
    compare(['5t + 3', { t: 2 }], 13);
    compare(['.5t', { t: 4 }], 2);
    // Variable followed by negative number should be subtraction
    compare(['k-1', { k: 3 }], 2);
    compare(['x-2', { x: 5 }], 3);
    compare(['(k-1)*2', { k: 4 }], 6);
});

test('chained operations', () => {
    compare('1 + 2 + 3 + 4', 10);
    compare('2 * 3 * 4', 24);
    compare('100 / 10 / 2', 5);
    compare('10 - 3 - 2', 5);
});

test('mixed operations', () => {
    compare('2 + 3 * 4 - 5', 9);
    compare('(2 + 3) * (4 - 1)', 15);
    compare('10 / 2 + 3 * 4', 17);
    compare('2 ^ 3 + 1', 9);
});

test('edge cases', () => {
    compare('0', 0);
    compare('', 0);
    compare('   ', 0);
    compare('1 / 0', Infinity);
    compare('-1 / 0', -Infinity);
    // 0/0 returns 0 due to NaN || 0 fallback in calc
    compare('0 / 0', 0);
    // sqrt(-1) returns 0 due to NaN || 0 fallback
    compare('sqrt(-1)', 0);
});

test('context functions', () => {
    compare(['double(5)', { double: x => x * 2 }], 10);
    compare(['add(2, 3)', { add: (a, b) => a + b }], 5);
    compare(['triple(double(2))', { double: x => x * 2, triple: x => x * 3 }], 12);
});

test('unicode operators', () => {
    compare('6 ÷ 2', 3);
    compare('π', Math.PI);
});

test('complex nested context', () => {
    const k = 3;
    const t = 6.230825429619756;
    const context = {
        px: '(k-1)*cos(t) + cos((k-1)*t)',
        py: '(k-1)*sin(t) - sin((k-1)*t)',
        k: k,
        t: t
    };

    compare(['px', context], (k-1)*Math.cos(t) + Math.cos((k-1)*t));
    compare(['py', context], (k-1)*Math.sin(t) - Math.sin((k-1)*t));
});

test('implicit multiplication edge cases', () => {
    // Variable followed by number - treated as variable name (like x₁, y₂)
    compare(['x1', { x1: 99 }], 99);
    compare(['y2', { y2: 88 }], 88);
    compare(['x1', { x: 5 }], 0); // x1 is undefined, returns 0

    // Variable followed by constant - implicit multiplication
    compare(['xπ', { x: 2 }], 2 * Math.PI);

    // Constant followed by variable - implicit multiplication
    compare(['πx', { x: 2 }], Math.PI * 2);

    compare(['bb', { b: 2 }], 0)

    // Constant followed by constant - implicit multiplication
    compare('ππ', Math.PI * Math.PI);

    // Number followed by parenthesis - implicit multiplication
    compare('2(3+4)', 14);
    compare('3(2+1)', 9);

    // Parenthesis followed by number/variable/parenthesis - implicit multiplication
    compare('(2+3)4', 20);
    compare(['(2+3)x', { x: 2 }], 10);
    compare('(1+2)(3+4)', 21);
    compare('2(3)(4)', 24);

    // Scientific notation followed by variable - implicit multiplication
    compare(['1e2x', { x: 3 }], 300);
    compare(['2e1y', { y: 5 }], 100);
});

test('subtraction after closing parenthesis', () => {
    // Issue: ')-81' was being tokenized as ')' followed by '-81' (negative number)
    // instead of ')' '-' '81' (subtraction operator)
    compare('(1+2)-3', 0);
    compare('(1+2) - 3', 0);
    compare(['50*abs.sin(2.5t)-81', { t: Math.PI / 4 }], 50 * Math.abs(Math.sin(2.5 * Math.PI / 4)) - 81);
    compare(['50*abs.sin(2.5t) - 81', { t: Math.PI / 4 }], 50 * Math.abs(Math.sin(2.5 * Math.PI / 4)) - 81);
});

test('implicit multiplication with functions', () => {
    // Issue: '2sin(1)' was glued into a single unknown function name '2sin' → 0
    compare('2sin(1)', 2 * Math.sin(1));
    compare('-2sin(1)', -2 * Math.sin(1));
    compare('2min(3, 4)', 6);
    // Issue: everything after a glued '2π' was silently dropped
    compare('2πsin(1)', 2 * Math.PI * Math.sin(1));
    compare(['sin(2πt)', { t: 0.25 }], Math.sin(2 * Math.PI * 0.25));
    compare(['2πx', { x: 3 }], 2 * Math.PI * 3);
    compare(['3 + -2x', { x: 4 }], -5);
});

test('space-separated adjacency', () => {
    // Issue: a space between two values dropped the second one
    compare('2 sin(1)', 2 * Math.sin(1));
    compare(['2 x', { x: 3 }], 6);
    compare('2 (3)', 6);
    // '-1' tokenized as a negative number after a space → subtraction
    compare(['k -1', { k: 3 }], 2);
    compare('2 -1', 1);
});

test('unary minus in arguments', () => {
    compare(['sin(-x)', { x: 2 }], Math.sin(-2));
    compare(['max(1, -x)', { x: 2 }], 1);
    compare(['max(-x, 5)', { x: 2 }], 5);
    compare('sin(-(3))', Math.sin(-3));
    compare(['-x1', { x1: 5 }], -5);
});

test('variables holding dimensioned values', () => {
    // The numeric part joins the math; units attach back via $ suffixes
    compare(['w * 2', { w: '10px' }], 20);
    compare(['w + 4', { w: '10px' }], 14);
    compare(['-w', { w: '10px' }], -10);
    compare(['2w', { w: '10px' }], 20);
    compare(['p / 2', { p: '50%' }], 25);
    compare(['t * 2', { t: '2.5s' }], 5);
    compare(['a', { a: '.5turn' }], 0.5);
    compare(['a', { a: '-45deg' }], -45);
    compare(['sin(w)', { w: '1rad' }], Math.sin(1));
    // Through variable references
    compare(['b * 2', { b: 'a', a: '10px' }], 20);
    // A resolvable word wins over the unit reading: 2s stays 2*s
    compare(['d', { d: '2s', s: 5 }], 10);
    compare(['v', { v: '2t', t: 3 }], 6);
    // Unresolvable words act as units, no validation
    compare(['v', { v: '2t' }], 2);
    compare(['a * 2', { a: '3vmin' }], 6);
    // π keeps implicit multiplication
    compare(['v', { v: '2π' }], 2 * Math.PI);
    compare(['c + 1', { c: 'red' }], 1);
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
    // operations and unknown names aren't references
    assert.equal(deref('n + 2', ctx), undefined);
    assert.equal(deref('x', ctx), undefined);
});

test('subtraction with implicit multiplication', () => {
    // Issue: 'x-9.01' was being tokenized as 'x' followed by '-9.01' (negative number)
    // causing implicit multiplication parsing bugs
    compare(['2x-3t', { x: 2, t: 0.5 }], 2*2 - 3*0.5);  // 4 - 1.5 = 2.5
    compare(['2x - 3t', { x: 2, t: 0.5 }], 2*2 - 3*0.5);
    compare(['13.6x-9.01t', { x: 2, t: 0.5 }], 13.6*2 - 9.01*0.5);  // 22.695
    compare(['13.6x - 9.01t', { x: 2, t: 0.5 }], 13.6*2 - 9.01*0.5);

    // Inside function arguments - previously parseFunctionArgs lost spaces
    compare(['sin(2x-3t)', { x: 2, t: 0.5 }], Math.sin(2*2 - 3*0.5));
    compare(['sin(2x - 3t)', { x: 2, t: 0.5 }], Math.sin(2*2 - 3*0.5));
    compare(['sin(13.6x-9.01t)', { x: 2, t: 0.5 }], Math.sin(13.6*2 - 9.01*0.5));
});
