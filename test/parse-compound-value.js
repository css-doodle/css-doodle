import test from 'ava';

import parseCompoundValue from '../src/parser/parse-compound-value.js';
import compare from './_compare.js';

test('direction group', t => {

  compare.use(parseCompoundValue);

  compare(t, '', {});

  compare(t, '10', {
    value: 10,
  });

  compare(t, '10em', {
    value: 10,
    unit: 'em'
  });

  compare(t, '-10.5vw', {
    value: -10.5,
    unit: 'vw'
  });

  compare(t, '-10.5 vw', {
    value: -10.5,
  });

  compare(t, '10%', {
    value: 10,
    unit: '%'
  });

  // should be treated as expression
  compare(t, '10%2', {
    value: 10,
  });

  compare(t, '1/sin(t)', {
    value: 1,
  });

});
