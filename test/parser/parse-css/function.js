import parse_css from '../../../src/parser/parse-css';

describe('dynamic function', () => {

  it('should recognize dynamic function', () => {
    let parsed = parse_css(`
      prop: @fun10(v2);
    `);
    expect(get_arguments(parsed)).toEqual([
      [{ type: 'text', value: '10' }],
      [{ type: 'text', value: 'v2' }]
    ]);
  });

});


function get_arguments(parsed) {
  return parsed[0].value[0][0].arguments;
}
