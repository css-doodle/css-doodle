import parse_css from '../../../src/parser/parse-css';

describe('arguments', () => {
  it('should parse basic arguments', () => {
    let parsed = parse_css(`
      prop: @fun(v1, v2);
    `);
    expect(get_arguments(parsed)).toEqual([
      [{ type: 'text', value: 'v1' }],
      [{ type: 'text', value: 'v2' }]
    ]);
  });

  it('should work properly with nested parens', () => {
    let parsed = parse_css(`
      prop: @fun(calc(1 + (2)));
    `);
    expect(get_arguments(parsed)).toEqual([
      [{ type: 'text', value: 'calc(1 + (2))' }]
    ]);
  });

  it('should work properly with nested quotes', () => {
    let parsed = parse_css(`
      prop: @fun('calc("1 + 2")')
    `);
    expect(get_arguments(parsed)).toEqual([
      [{ type: 'text', value: "calc(\"1 + 2\")" }]
    ])
  });

  it('should ignore invalid arguments', () => {
    let parsed = parse_css(`
      prop: @fun(3, 'hello);
    `);
    expect(get_arguments(parsed)).toEqual([
      [{ type: 'text', value: 3 }]
    ]);
  });

  it('should replace \` width \"', () => {
    let parsed = parse_css('prop: @fun(calc(`1 + 2`))');
    expect(get_arguments(parsed)).toEqual([
      [{ type: 'text', value: 'calc("1 + 2")' }]
    ]);
  });

  it('should remove pairs at both ends', () => {
    let parsed_a = parse_css(`
      prop: @func('fun(v1, v2)');
    `);
    let parsed_b = parse_css(`
      prop: @func((fun(v1, v2)));
    `);
    let parsed_c = parse_css('prop: @func(`fun(v1, v2)`)');
    const result = [
      [{ type: 'text', value: 'fun(v1, v2)' }]
    ];
    expect(get_arguments(parsed_a)).toEqual(result);
    expect(get_arguments(parsed_b)).toEqual(result);
    expect(get_arguments(parsed_c)).toEqual(result);
  });

  it('should keep the types of input args', () => {
    let parsed = parse_css(`
      prop: @fun(2, "3");
    `);
    expect(get_arguments(parsed)).toEqual([
      [{ type: 'text', value: 2 }],
      [{ type: 'text', value: "3" }]
    ]);
  });

});


function get_arguments(parsed) {
  return parsed[0].value[0][0].arguments;
}
