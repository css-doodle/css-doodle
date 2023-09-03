import test from 'ava';
import calc from '../src/calc.js';
import compare from './_compare.js';
import { round } from '../src/utils/index.js';

compare.use(calc);

test('basic operations', t => {
  compare(t, '2 + 2', 4);
  compare(t, '2 - 2', 0);
  compare(t, '2 * 2', 4);
  compare(t, '2 / 2', 1);
  compare(t, '2 % 7', 2);
});

test('precedence', t => {
  compare(t, '(1 + 2) * 10', 30);
  compare(t, '1 + 2 * 10', 21);
  compare(t, '10 - (5 - 2 / 2)', 6);
});

test('Math functions and constants', t => {
  compare(t, 'π * 2', round(Math.PI * 2));
  compare(t, 'cos(2)', round(Math.cos(2)));
  compare(t, 'sin(π) * cos(2)', round(Math.sin(Math.PI) * Math.cos(2)));
});

test('context values', t => {
  compare(t, ['a + b + 2', { a: 2, b: 3 }], 7);
  compare(t, ['a + x + 2', { a: 2 }], 4);
  compare(t, ['-a + 2', { a: 2 }], 0);
});

test('negative functions', t => {
  compare(t, ['-fn()', { fn: () => 5 }], -5);
  compare(t, ['-fn() + 2', { fn: () => 5 }], -3);
  compare(t, ['--fn()', { fn: () => 5 }], 0);
});

test('cyclic reference', t => {
  compare(t, ['cos(t)', { t: '2t' }], Math.cos(0));
  compare(t, ['cos(t)', { t: '2*t' }], Math.cos(0));
  compare(t, ['cos(t)', { t: 'x(t)' }], Math.cos(0));
  compare(t, ['cos(t)', { t: 'x' }], Math.cos(0));
  compare(t, ['cos(t)', { t: '2x' }], Math.cos(0));
  compare(t, ['cos(t)', { t: 'sin(t)' }], Math.cos(0));
  compare(t, ['cos(t)', { t: 'cos(t)' }], round(Math.cos(Math.cos(Math.cos(Math.cos(0))))));
  compare(t, ['t', { t: 'sin(t)' }], 0);
  compare(t, ['t', { t: 'sin(t)' }], 0);
  compare(t, ['sin(t)', { t: '2s', s: 't', 'b': 'sin(a)', a: 'b' }], 0);
});
