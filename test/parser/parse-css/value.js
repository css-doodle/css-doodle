import parse_css from '../../../src/parser/parse-css';

describe('parse_css', () => {
  describe('arguments', () => {

    it('should treat break lines as a single space', () => {
      let parsed = parse_css(`
        prop:
          v1
          v2;
      `);

      expect(parsed[0].value).toEqual(
        [{ "type": "text", "value": "v1 v2" }]
      );
    });

  });
});

function log(input) {
  console.log(JSON.stringify(input, null, 2));
}
