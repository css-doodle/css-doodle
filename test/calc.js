import test from 'ava';
import calc from '../src/calc';
import compare from './_compare';

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

  compare(t, 'π * 2', Math.PI * 2);
  compare(t, 'cos(2)', Math.cos(2));
  compare(t, 'sin(π) * cos(2)', Math.sin(Math.PI) * Math.cos(2));

});

test('context values', t => {

  compare(t, ['a + b + 2', { a: 2, b: 3 }], 7);

  compare(t, ['a + x + 2', { a: 2 }], 4);

  compare(t, ['-a + 2', { a: 2 }], 0);

});
