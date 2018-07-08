import parse_value_group from '../../src/parser/parse-value-group.js';

describe('parse_value_group', () => {

  it('should recognize width', () => {
    const input = '100%';
    let [w, h] = parse_value_group(input);
    expect(w).toBe(input);
  });

  it('should recognize width & height', () => {
    const input = '100%, 50%';
    let [w, h] = parse_value_group(input);
    expect(w).toBe('100%');
    expect(h).toBe('50%');
  });

  it('should be ok to use spaces as seperator ', () => {
    const input = '100% 50%';
    let [w, h] = parse_value_group(input);
    expect(w).toBe('100%');
    expect(h).toBe('50%');
  });

  it('should be work with calc', () => {
    const input = 'calc(50% * 2) 50%';
    let [w, h] = parse_value_group(input);
    expect(w).toBe('calc(50% * 2)');
    expect(h).toBe('50%');
  });

  it('should work with complex values', () => {
    const input = 'calc(var(--a) * calc(100% / var(--b)))';
    let [w] = parse_value_group(input);
    expect(w).toBe(input);
  });

});
