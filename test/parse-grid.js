import test from 'node:test';

import parseGrid from '../src/parser/parse-grid.js';
import compare from './_compare.js';

compare.use(parseGrid);

const defaultGrid = {
  x: 1, y: 1, z: 1, count: 1, ratio: 1
};

test('invalid values', () => {
  compare('random', defaultGrid);
  compare('', defaultGrid);
  compare('-1', defaultGrid);
});

test('seperator', () => {
  compare('1x1', defaultGrid);
  compare('1X1', defaultGrid);
  compare('1,1', defaultGrid);
  compare('1，1', defaultGrid);
  compare('1，   1', defaultGrid);
  compare('1 x 1', defaultGrid);

});

test('clamp value', () => {

  compare('0', defaultGrid);
  compare('0x1', defaultGrid);
  compare('70000,1', { x: 4096, y: 1, z: 1, count: 4096, ratio: 4096 });
  compare('70000', { x: 64, y: 64, z: 1, count: 4096, ratio: 1 });

  compare('0.5', defaultGrid);
  compare('1x5.2', { x: 1, y: 5, z: 1, count: 5, ratio: 1/5 });

});
