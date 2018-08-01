import { unitify } from '../../src/utils';

function transform(...args) {
  return args;
}

function test(a, b) {
  expect(a).toEqual(b);
}

describe('unitify', () => {
  it('should normalize any unit', () => {
    let fn = unitify(transform);
    test(
      fn('10px', '20'), ['10px', '20px']
    );
    test(
      fn('10px', '20px'), ['10px', '20px']
    );
  });
});
