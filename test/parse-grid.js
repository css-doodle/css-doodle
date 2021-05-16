import ava from 'ava';
import parseGrid from '../src/parser/parse-grid';

function compare(fn) {
  return t => {
    fn((code, result, print) => {
      let applied = parseGrid(code);
      if (print) console.log(applied);
      t.deepEqual(result, applied);
    });
  }
}

function test(name, fn) {
  ava(name, compare(fn));
}

for (let m in ava) {
  test[m] = (name, fn) => ava[m](name, compare(fn));
}

const defaultGrid = {
  x: 1, y: 1, z: 1, count: 1, ratio: 1
};

test('invalid values', t => {
  t('random', defaultGrid);
  t('', defaultGrid);
  t('-1', defaultGrid);
});

test('seperator', t => {

  t('1x1', defaultGrid);

  t('1X1', defaultGrid);

  t('1,1', defaultGrid);

  t('1，1', defaultGrid);

  t('1，   1', defaultGrid);

  t('1 x 1', defaultGrid);

});

test('clamp value', t => {

  t('0', defaultGrid);

  t('0x1', defaultGrid);

  t('2000,1', { x: 1024, y: 1, z: 1, count: 1024, ratio: 1024 });

  t('2000', { x: 32, y: 32, z: 1, count: 1024, ratio: 1 });

  t('0.5', defaultGrid);

  t('1x5.2', { x: 1, y: 5, z: 1, count: 5, ratio: 1/5 });

});
