import calc from '../../src/utils/calc'

function test(expr, result) {
  expect(calc(expr)).toBe(result);
}

describe('calcucator', () => {
  it('should calculate with basic operators', () => {
    test('4 + 2', 6);
    test('4 - 2', 2);
    test('2 - 4', -2);
    test('4 * 2', 8);
    test('4 / 2', 2);
    test('4 % 2', 0);
    test('2 % 4', 2);
  });

  it('should handle signed numbers', () => {
    test('-2 + 4', 2);
    test('4 * 2 + -3', 5);
    test('-2 / 4', -.5);
  })

  it('should be able to handle the scientific notation', () => {
    test('8.045977011494252e-8 + 2', 2.00000008045977)
  });

  it('should work properly with parathesis', () => {
    test('4 * (2 + 3)', 20);
    test('4 / (2 - 3)', -4);
    test('4 * 2 + 3', 11);
    test('4 * 2 + -3', 5);
  });

});
