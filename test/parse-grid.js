import test from 'ava';

import parseGrid from '../src/parser/parse-grid.js';
import compare from './_compare.js';
compare.use(parseGrid);

const defaultGrid = {
  x: 1, y: 1, z: 1, count: 1, ratio: 1
};

test('invalid values', t => {
  compare(t, 'random', defaultGrid);

  compare(t, '', defaultGrid);

  compare(t, '-1', defaultGrid);
});

test('seperator', t => {

  compare(t, '1x1', defaultGrid);

  compare(t, '1X1', defaultGrid);

  compare(t, '1,1', defaultGrid);

  compare(t, '1，1', defaultGrid);

  compare(t, '1，   1', defaultGrid);

  compare(t, '1 x 1', defaultGrid);

});

test('clamp value', t => {

  compare(t, '0', defaultGrid);

  compare(t, '0x1', defaultGrid);

  compare(t, '70000,1', { x: 65536, y: 1, z: 1, count: 65536, ratio: 65536 });

  compare(t, '70000', { x: 256, y: 256, z: 1, count: 65536, ratio: 1 });

  compare(t, '0.5', defaultGrid);

  compare(t, '1x5.2', { x: 1, y: 5, z: 1, count: 5, ratio: 1/5 });

});
