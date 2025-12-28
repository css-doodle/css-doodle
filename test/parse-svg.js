import test  from 'node:test';

import parseSvg from '../src/parser/parse-svg.js';
import compare from './_compare.js';

compare.use(parseSvg);

test('edge cases', () => {

  compare('', {
    type: 'block',
    name: 'svg',
    value: []
  });

  compare('any', {
    type: 'block',
    name: 'svg',
    value: []
  });

  compare('any:;', {
    type: 'block',
    name: 'svg',
    value: [{
      name: 'any',
      type: 'statement',
      value: ''
    }]
  });

  compare('circle {}', {
    type: 'block',
    name: 'svg',
    value: [{
      name: 'circle',
      type: 'block',
      value: []
    }]
  });

  compare('circle { name: } ', {
    type: 'block',
    name: 'svg',
    value: [{
      type: 'block',
      name: 'circle',
      value: [{
        type: 'statement',
        name: 'name',
        value: ''
      }]
    }]
  });

  compare('{}', {
    type: 'block',
    name: 'svg',
    value: []
  });

  compare('{', {
    type: 'block',
    name: 'svg',
    value: []
  });

  compare('}', {
    type: 'block',
    name: 'svg',
    value: []
  });

  compare('{any}', {
    type: 'block',
    name: 'svg',
    value: []
  });

  compare('text { {} }', {
    type: 'block',
    name: 'svg',
    value: [{
      value: [],
      name: 'text',
      type: 'block'
    }]
  });

});

test('statement', () => {

  compare('viewBox: 0 0 0 10', {
    name: 'svg',
    type: 'block',
    value: [{
      type: 'statement',
      name: 'viewBox',
      value: '0 0 0 10',
      detail: {
        value: [0, 0, 0, 10]
      }
    }]
  });

  compare('viewBox: 0 0 10 10 padding .2', {
    name: 'svg',
    type: 'block',
    value: [{
      type: 'statement',
      name: 'viewBox',
      value: '0 0 10 10 padding .2',
      detail: {
        value: [0, 0, 10, 10],
        padding: .2
      }
    }]
  });

  compare('circle { cx: 5; cy: 5 }', {
    name: 'svg',
    type: 'block',
    value: [{
      type: 'block',
      name: 'circle',
      value: [
        { type: 'statement', name: 'cx', value: '5' },
        { type: 'statement', name: 'cy', value: '5' },
      ]
    }]
  });

});

test('group property', () => {
  compare('cx, cy: 5', {
    name: 'svg',
    type: 'block',
    value: [
      { type: 'statement', origin: { name: ['cx', 'cy'], value: '5' }, name: 'cx', value: '5'},
      { type: 'statement', origin: { name: ['cx', 'cy'], value: '5' }, name: 'cy', value: '5'},
    ]
  });

  compare('cx, cy: 5 6', {
    name: 'svg',
    type: 'block',
    value: [
      { type: 'statement', origin: { name: ['cx', 'cy'], value: '5 6' }, name: 'cx', value: '5'},
      { type: 'statement', origin: { name: ['cx', 'cy'], value: '5 6' }, name: 'cy', value: '6'},
    ]
  });
});

test('semicolon separated values', () => {
  compare('values: 60; 100; 180', {
    name: 'svg',
    type: 'block',
    value: [
      { type: 'statement', name: 'values', value: '60;100;180' }
    ]
  });

  compare('values: 20 50; 100; 110; cy: 10', {
    name: 'svg',
    type: 'block',
    value: [
      { type: 'statement', name: 'values', value: '20 50;100;110' },
      { type: 'statement', name: 'cy', value: '10' }
    ]
  });
});

test('colon separated properties', () => {
  compare('xlink:href: url(#app)', {
    name: 'svg',
    type: 'block',
    value: [
      { type: 'statement', name: 'xlink:href', value: 'url(#app)' }
    ]
  });

  compare('xlink:title: hello:world', {
    name: 'svg',
    type: 'block',
    value: [
      { type: 'statement', name: 'xlink:title', value: 'hello:world' }
    ]
  });
});

test('block names', () => {
  compare('g circle { } ', {
    name: 'svg',
    type: 'block',
    value: [{
      type: 'block',
      name: 'g',
      value: [{
        type: 'block',
        name: 'circle',
        value: []
      }]
    }]
  });

  compare('g circle { name: value } ', {
    type: 'block',
    name: 'svg',
    value: [{
      type: 'block',
      name: 'g',
      value: [{
        type: 'block',
        name: 'circle',
        value: [{
          type: 'statement',
          name: 'name',
          value: 'value'
        }]
      }]
    }]
  });

  compare(`
    circle {}
    circle {}
  `, {
    type: 'block',
    name: 'svg',
    value: [
      {
        type: 'block',
        name: 'circle',
        value: []
      },
      {
        type: 'block',
        name: 'circle',
        value: []
      }
    ]
  });
});

test('id expand', () => {
  compare('g circle#id { } ', {
    type: 'block',
    name: 'svg',
    value: [{
      type: 'block',
      name: 'g',
      value: [{
        type: 'block',
        name: 'circle',
        value: [{
          type: 'statement',
          name: 'id',
          value: 'id'
        }]
      }]
    }]
  });

  compare('g#id circle {} ', {
    name: 'svg',
    type: 'block',
    value: [{
      type: 'block',
      name: 'g',
      value: [
        {
          type: 'block',
          name: 'circle',
          value: []
        },
        {
          type: 'statement',
          name: 'id',
          value: 'id'
        },
      ]
    }]
  });
});

test('class expand', () => {
  compare('g.container circle { } ', {
    type: 'block',
    name: 'svg',
    value: [{
      type: 'block',
      name: 'g',
      value: [
        {
          type: 'block',
          name: 'circle',
          value: []
        },
        {
          type: 'statement',
          name: 'class',
          value: 'container'
        },
      ]
    }]
  });

  compare('g circle.highlight { } ', {
    type: 'block',
    name: 'svg',
    value: [{
      type: 'block',
      name: 'g',
      value: [{
        type: 'block',
        name: 'circle',
        value: [{
          type: 'statement',
          name: 'class',
          value: 'highlight'
        }]
      }]
    }]
  });

  // Multiple classes
  compare('g.foo.bar { } ', {
    type: 'block',
    name: 'svg',
    value: [{
      type: 'block',
      name: 'g',
      value: [{
        type: 'statement',
        name: 'class',
        value: 'foo bar'
      }]
    }]
  });

  // Combined id and class
  compare('g#myid.myclass { } ', {
    type: 'block',
    name: 'svg',
    value: [{
      type: 'block',
      name: 'g',
      value: [
        {
          type: 'statement',
          name: 'id',
          value: 'myid'
        },
        {
          type: 'statement',
          name: 'class',
          value: 'myclass'
        },
      ]
    }]
  });
});

test('empty id expand', () => {
  compare('#abc {}', {
    type: 'block',
    name: 'svg',
    value: [{
      type: 'block',
      name: '#abc',
      value: []
    }]
  });
});

test('ignore tail semicolons', () => {
  compare('path {};', {
    type: 'block',
    name: 'svg',
    value: [{
      type: 'block',
      name: 'path',
      value: []
    }]
  });
});

test('statement end on quotes', () => {
  compare(`
    text { content: '' }
    g {}
  `, {
    type: 'block',
    name: 'svg',
    value: [{
      type: 'block',
      name: 'text',
      value: [{
        name: 'content',
        type: 'statement',
        value: '\'\''
      }]
    }, {
      name: 'g',
      type: 'block',
      value: []
    }]
  });
});

test('content values', () => {
  compare(`
    text { content: "world;}" }
  `, {
    type: 'block',
    name: 'svg',
    value: [{
      type: 'block',
      name: 'text',
      value: [{
        name: 'content',
        type: 'statement',
        value: '"world;}"'
      }]
    }]
  });

  compare(`
    text { content: "}"; }
  `, {
    type: 'block',
    name: 'svg',
    value: [{
      type: 'block',
      name: 'text',
      value: [{
        name: 'content',
        type: 'statement',
        value: '"}"'
      }]
    }]
  });
});

test('style with css selectors', () => {
  compare('style { a { fill: red } }', {
    type: 'block',
    name: 'svg',
    value: [{
      type: 'block',
      name: 'style',
      value: 'a{fill:red}'
    }]
  });

  compare('style a { fill: red }', {
    type: 'block',
    name: 'svg',
    value: [{
      type: 'block',
      name: 'style',
      value: 'a{fill:red}'
    }]
  });

  compare('style .cls { stroke: blue }', {
    type: 'block',
    name: 'svg',
    value: [{
      type: 'block',
      name: 'style',
      value: '.cls{stroke:blue}'
    }]
  });
});

test('times syntax', () => {
  compare(`
    circle*10 {}
  `, {
    type: 'block',
    name: 'svg',
    value: [{
      type: 'block',
      name: 'circle*10',
      pureName: 'circle',
      times: '10',
      value: []
    }]
  });

  compare(`
    circle * 5 {}
  `, {
    type: 'block',
    name: 'svg',
    value: [{
      type: 'block',
      name: 'circle*5',
      pureName: 'circle',
      times: '5',
      value: []
    }]
  });
});

test('complex values with parens', () => {
  compare(`
    p {
      d: @plot(r: 1; unit: none);
    }
  `, {
    type: 'block',
    name: 'svg',
    value: [{
      type: 'block',
      name: 'p',
      value: [{
        type: 'statement',
        name: 'd',
        value: '@plot(r:1;unit:none)'
      }]
    }]
  });
});

test('svg variable', () => {
  compare('--a: 1', {
    name: 'svg',
    type: 'block',
    value: [{
      type: 'statement',
      name: '--a',
      value: '1',
      variable: true
    }]
  });

  compare('--a: 1; svg {}', {
    name: 'svg',
    type: 'block',
    value: [{
      type: 'statement',
      name: '--a',
      value: '1',
      variable: true
    }]
  });
});


test('svg variable order', () => {
  compare('--a: 1; svg { --a: 2 }', {
    name: 'svg',
    type: 'block',
    value: [{
      type: 'statement',
      name: '--a',
      value: '2',
      variable: true
    }]
  });

  compare('--b: 1; svg { --a: 2 }', {
    name: 'svg',
    type: 'block',
    value: [{
      type: 'statement',
      name: '--b',
      value: '1',
      variable: true
    }, {
      type: 'statement',
      name: '--a',
      value: '2',
      variable: true
    }]
  });
});
