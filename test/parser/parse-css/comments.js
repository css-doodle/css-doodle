import parse_css from '../../../src/parser/parse-css';

describe('comments', () => {

  it('should ignore comments', () => {
    let parsed = parse_css(`
      /* helo */
      // /* hello */
      // hello
    `);
    expect(parsed).toEqual([]);
  });

  it('should work properly with comments', () => {
    let parsed = parse_css(`
      // color: red;
      color: red;
    `);
    expect(parsed).toEqual([{
      "type": "rule",
      "property": "color",
      "value": [[{
        "type": "text",
        "value": "red"
      }]]
    }]);
  });

});
