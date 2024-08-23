import test from 'node:test'

import parseDirection from '../src/parser/parse-direction.js';
import compare from './_compare.js';

test('direction group', () => {

  compare.use(parseDirection);

  compare('', {
    direction: 'auto',
    angle: 0
  });

  compare('auto 90deg', {
    direction: 'auto',
    angle: 90
  });

  compare('90deg', {
    direction: '',
    angle: 90
  });

  compare('auto', {
    direction: 'auto',
    angle: 0
  });

  compare('invalid', {
    direction: 'auto',
    angle: 0
  });

  compare('90deg reverse', {
    direction: 'reverse',
    angle: 90
  });

});

test('direction unit', () => {

  compare.use(input => {
    return parseDirection(input).angle;
  });

  compare('10invalid', 10);
  compare('1turn', 360);
  compare('.5turn', 180);
  compare('100grad', 90);
  compare('.25turn', 90);
  compare('-.25turn', -90);
  compare('1.5708rad', 1.5708 / (Math.PI / 180));

});
