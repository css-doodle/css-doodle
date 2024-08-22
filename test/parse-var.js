import it from 'node:test';

import compare from './_compare.js';
import parseVar from '../src/parser/parse-var.js';

compare.use(parseVar);

it('basic utility', () => {

  compare('', []);

  compare('var', []);

  compare('var(', []);

  compare('var()', []);

  compare('var(--)', []);

  compare('var(---)', []);

  compare('var(abc)', []);

  compare('var(-abc)', []);

  compare('var(--abc)', [{ name: '--abc' }]);

  compare('var(--abc-d)', [{ name: '--abc-d' }]);

  compare('var(--abc--d)', [{ name: '--abc--d' }]);

});


it('fallback values', () => {

  compare('var(--a, var(--b))', [{
    name: '--a',
    fallback: [{ name: '--b' }]
  }]);

  compare('var(--a, var(--b), var(--c))', [{
    name: '--a',
    fallback: [{ name: '--b' }, { name: '--c' }]
  }]);

  compare('var(--a, var(--b, var(--c))', [{
    name: '--a',
    fallback: [{ name: '--b', fallback: [{ name: '--c' }] }]
  }]);

});


it('multiple vars', () => {

  compare('var(--a), var(--b)', [
    { name: '--a' },
    { name: '--b' },
  ]);

  compare('var(--a),, var(--b)', [
    { name: '--a' },
    { name: '--b' },
  ]);

  compare('var(--a), var(abc)', [
    { name: '--a' },
  ]);

  compare('var(--a), var(--b,,var(--c), d)', [
    { name: '--a' },
    { name: '--b', fallback: [{ name: '--c' }] },
  ]);

});
