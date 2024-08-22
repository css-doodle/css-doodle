import it from 'node:test';

import parse from '../src/parser/parse-linear-expr.js';
import compare from './_compare.js';

compare.use(parse);

it('linear expression', () => {

  compare('2n + 3', { a: 2, b: 3 });
  compare('2n - 3', { a: 2, b: -3 });
  compare('2n', { a: 2, b: 0 });
  compare('2n 3', { a: 0, b: 0, error: 'Syntax error' });
  compare('2n * 3', { a: 0, b: 0, error: 'Unexpected *' });
  compare('2', { a: 0, b: 2 });
  compare('-10n + 3', { a: -10, b: 3 });
  compare('2n + 3n + 5', { a: 5, b: 5 });
  compare('', { a: 0, b: 0 });

});
