import test, { beforeEach, describe } from 'node:test';

import compare from './_compare.js';
import selector from '../src/selector.js';

describe('selector logic', () => {

  let cell = {};

  beforeEach(() => {
    cell = {
      x: 2, y: 3, count: 10,
      grid: { count: 16, x: 4, y: 4 }
    };
  });


  compare.use(selector, (fn, input) => {
    return fn(cell);
  });


  test('selector at', () => {
    compare.at([2, 3], true);
    compare.at([1, 4], false);

    cell.x = 1;
    cell.y = 4;
    compare.at([1, 4], true);
  });

  test('selector nth', () => {
    compare.nth([10], true);
    compare.nth([9], false);
    compare.nth(['2n'], true);
    compare.nth(['n'], true);
    compare.nth(['2n + 2'], true);
    compare.nth(['2n+2'], true);

    cell.x = 3;
    cell.y = 1;
    cell.count = 3;
    compare.nth(['odd'], true);
    compare.nth(['n + 1'], true);
    compare.nth(['3n'], true);
  });

  test('selector y', () => {
    compare.y([3], true);
    compare.y(['odd'], true);
    compare.y(['even'], false);

    cell.x = 3;
    cell.y = 2;
    cell.count = 7;
    compare.y(['odd'], false);
    compare.y(['even'], true);

  });

  test('selector x', () => {
    compare.x([2], true);
    compare.x(['even'], true);
    compare.x(['odd'], false);
  });

  test('selector even', () => {
    compare.even([], true);

    cell.x = 3;
    cell.y = 1;
    cell.count = 3;
    compare.even([], false);
  });

  test('selector odd', () => {
    compare.odd([], false);

    cell.x = 3;
    cell.y = 1;
    cell.count = 3;
    compare.odd([], true);
  });

  test('selector match', () => {
    compare.match(['x = 2'], true);
    compare.match(['y = 3'], true);
    compare.match(['x = 2 && y = 3'], true);
    compare.match(['x == 2 && y == 3'], true);
    compare.match(['x < 3'], true);
  });

  test('selector cell', () => {
    compare.cell(['x = 2, y = 3'], true);
    compare.cell(['x = 2 && y = 3'], true);
    compare.cell(['even'], true);
    compare.cell(['false'], false);
    compare.cell(['x > 3'], false);
    compare.cell(['i = 10'], true);
    compare.cell([], true);
  });

});
