import test from 'ava';

import parse from '../src/parser/parse-linear-expr.js';
import compare from './_compare.js';
compare.use(parse);

test('linear expression', t => {

  compare(t, '2n + 3', { a: 2, b: 3 });
  compare(t, '2n - 3', { a: 2, b: -3 });
  compare(t, '2n', { a: 2, b: 0 });
  compare(t, '2n 3', { a: 0, b: 0, error: 'Syntax error' });
  compare(t, '2n * 3', { a: 0, b: 0, error: 'Unexpected *' });
  compare(t, '2', { a: 0, b: 2 });
  compare(t, '-10n + 3', { a: -10, b: 3 });
  compare(t, '2n + 3n + 5', { a: 5, b: 5 });
  compare(t, '', { a: 0, b: 0 });

});
