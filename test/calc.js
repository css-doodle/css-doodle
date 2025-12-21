import test from 'node:test';

import calc from '../src/calc.js';
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
  compare(['cos(t)', { t: '2x' }], Math.cos(0));
  compare(['cos(t)', { t: 'sin(t)' }], Math.cos(0));
  compare(['cos(t)', { t: 'cos(t)' }], Math.cos(Math.cos(Math.cos(Math.cos(0)))));
  compare(['t', { t: 'sin(t)' }], 0);
  compare(['t', { t: 'sin(t)' }], 0);
  compare(['sin(t)', { t: '2s', s: 't', 'b': 'sin(a)', a: 'b' }], 0);
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
