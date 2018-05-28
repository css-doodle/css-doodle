import parse_var from '../../src/parser/parse-var';

function test(expr, v2) {
  expect(parse_var(expr)).toEqual(v2);
}

describe('parse_var', () => {

  it('should get var name', () => {
    test(
      'var(--name)',
      [{ name: '--name' }]
    );
  });

  it('should get its alternatives', () => {
    test(
      'var(--a, var(--b))',
      [{ name: '--a', alternative: [{ name: '--b'}] }]
    );
  });


  it('should get a group of vars', () => {
    test(
      'var(--a), var(--b)',
      [{ name: '--a' }, { name: '--b' }]
    );
  });

  it('should get an empty result', () => {
    test(
      'var(--)', []
    );
  });

  it('should ignore bad vars', () => {
    test('xvar(--a)', []);
    test('--a', []);
    test('color red', []);
  });

});
