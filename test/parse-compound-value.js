import test from 'node:test';

import parseCompoundValue from '../src/parser/parse-compound-value.js';
import compare from './_compare.js';

test('direction group', () => {

  compare.use(parseCompoundValue);

  compare('', {});

  compare('10', {
    value: 10,
  });

  compare('10em', {
    value: 10,
    unit: 'em'
  });

  compare('-10.5vw', {
    value: -10.5,
    unit: 'vw'
  });

  compare('-10.5 vw', {
    value: -10.5,
  });

  compare('10%', {
    value: 10,
    unit: '%'
  });

  // should be treated as expression
  compare('10%2', {
    value: 10,
  });

  compare('1/sin(t)', {
    value: 1,
  });

});
