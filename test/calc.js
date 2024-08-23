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
});

test('context values', () => {
  compare(['a + b + 2', { a: 2, b: 3 }], 7);
  compare(['a + x + 2', { a: 2 }], 4);
  compare(['-a + 2', { a: 2 }], 0);
});

test('negative functions', t => {
  compare(['-fn()', { fn: () => 5 }], -5);
  compare(['-fn() + 2', { fn: () => 5 }], -3);
  compare(['--fn()', { fn: () => 5 }], 0);
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
