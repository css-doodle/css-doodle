import test from 'ava';

import parseDirection from '../src/parser/parse-direction.js';
import compare from './_compare.js';

test('direction group', t => {

  compare.use(parseDirection);

  compare(t, '', {
    direction: 'auto',
    angle: 0
  });

  compare(t, 'auto 90deg', {
    direction: 'auto',
    angle: 90
  });

  compare(t, '90deg', {
    direction: '',
    angle: 90
  });

  compare(t, 'auto', {
    direction: 'auto',
    angle: 0
  });

  compare(t, 'invalid', {
    direction: 'auto',
    angle: 0
  });

  compare(t, '90deg reverse', {
    direction: 'reverse',
    angle: 90
  });

});

test('direction unit', t => {

  compare.use(input => {
    return parseDirection(input).angle;
  });

  compare(t, '10invalid', 10);
  compare(t, '1turn', 360);
  compare(t, '.5turn', 180);
  compare(t, '100grad', 90);
  compare(t, '.25turn', 90);
  compare(t, '-.25turn', -90);
  compare(t, '1.5708rad', 1.5708 / (Math.PI / 180));

});
