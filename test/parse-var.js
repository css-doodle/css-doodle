import test from 'ava';

import compare from './_compare';
import parseVar from '../src/parser/parse-var';
compare.use(parseVar);

test('basic utility', t => {

  compare(t, '', []);

  compare(t, 'var', []);

  compare(t, 'var(', []);

  compare(t, 'var()', []);

  compare(t, 'var(--)', []);

  compare(t, 'var(---)', []);

  compare(t, 'var(abc)', []);

  compare(t, 'var(-abc)', []);

  compare(t, 'var(--abc)', [{ name: '--abc' }]);

  compare(t, 'var(--abc-d)', [{ name: '--abc-d' }]);

  compare(t, 'var(--abc--d)', [{ name: '--abc--d' }]);

});


test('fallback values', t => {

  compare(t, 'var(--a, var(--b))', [{
    name: '--a',
    fallback: [{ name: '--b' }]
  }]);

  compare(t, 'var(--a, var(--b), var(--c))', [{
    name: '--a',
    fallback: [{ name: '--b' }, { name: '--c' }]
  }]);

  compare(t, 'var(--a, var(--b, var(--c))', [{
    name: '--a',
    fallback: [{ name: '--b', fallback: [{ name: '--c' }] }]
  }]);

});


test('multiple vars', t => {

  compare(t, 'var(--a), var(--b)', [
    { name: '--a' },
    { name: '--b' },
  ]);

  compare(t, 'var(--a),, var(--b)', [
    { name: '--a' },
    { name: '--b' },
  ]);

  compare(t, 'var(--a), var(abc)', [
    { name: '--a' },
  ]);

  compare(t, 'var(--a), var(--b,,var(--c), d)', [
    { name: '--a' },
    { name: '--b', fallback: [{ name: '--c' }] },
  ]);

});
