import by_unit from '../../src/utils/by-unit';

function transform(...args) {
  return args;
}

function test(a, b) {
  expect(a).toEqual(b);
}

describe('unitify', () => {
  it('should normalize any unit', () => {
    let fn = by_unit(transform);
    test(
      fn('10px', '20'), ['10px', '20px']
    );
    test(
      fn('10px', '20px'), ['10px', '20px']
    );
    test(
      fn('0', '100%'), ['0%', '100%']
    );
  });
});
