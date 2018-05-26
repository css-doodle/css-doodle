import parse_css from '../../src/parser/parse-css';
import generator from '../../src/generator';

describe('issues', () => {
  let input = `
    :doodle { @grid: 2 / 10em; }
    color: red;
  `;

  it('should not have duplicate rule for nth-of-type(1)', () => {
    let ast = parse_css(input);
    let style = generator(ast).styles.cells;
    let value = style.includes('color: red;\ncolor: red');
    expect(value).toBe(false);
  });
});
