import parse_css from '../../../src/parser/parse-css';

describe('value', () => {

  it('should treat break lines as a single space', () => {
    let parsed = parse_css(`
      prop:
        v1
        v2;
    `);

    expect(parsed[0].value[0]).toEqual(
      [{ "type": "text", "value": "v1 v2" }]
    );
  });

});

