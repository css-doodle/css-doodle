import test from 'ava';
import parseGrid from '../src/parser/parse-grid';

const defaultGrid = {
  x: 1, y: 1, z: 1, count: 1, ratio: 1
};

test.only('invalid values', t => {
  t.deepEqual(parseGrid('random'), defaultGrid);
  t.deepEqual(parseGrid(''), defaultGrid);
  t.deepEqual(parseGrid('-1'), defaultGrid);
});

test.only('seperator', t => {

  t.deepEqual(parseGrid('1x1'), defaultGrid);

  t.deepEqual(parseGrid('1X1'), defaultGrid);

  t.deepEqual(parseGrid('1,1'), defaultGrid);

  t.deepEqual(parseGrid('1，1'), defaultGrid);

  t.deepEqual(parseGrid('1，   1'), defaultGrid);

  t.deepEqual(parseGrid('1 x 1'), defaultGrid);

});

test.only('clamp value', t => {

  t.deepEqual(parseGrid('0'), defaultGrid);

  t.deepEqual(parseGrid('0x1'), defaultGrid);

  t.deepEqual(parseGrid('2000,1'), {
    x: 1024, y: 1, z: 1, count: 1024, ratio: 1024
  });

  t.deepEqual(parseGrid('2000'), {
    x: 32, y: 32, z: 1, count: 1024, ratio: 1
  });

  t.deepEqual(parseGrid('0.5'), defaultGrid);

  t.deepEqual(parseGrid('1x5.2'), {
    x: 1, y: 5, z: 1, count: 5, ratio: 1/5
  });

});
