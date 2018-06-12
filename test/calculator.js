import calculate from '../src/calculator'

describe('calcucator', () => {
  it('should calculate sum properly', () => {
    expect(calculate('1 + 2')).toBe(3);
  });
});
