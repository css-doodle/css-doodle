import test from 'ava';

import parseSvg from '../src/parser/parse-svg.js';
import compare from './_compare.js';
compare.use(parseSvg);

test('edge cases', t => {

  compare(t, '', {
    type: 'block',
    name: 'svg',
    value: []
  });

  compare(t, 'any', {
    type: 'block',
    name: 'svg',
    value: []
  });

  compare(t, 'any:;', {
    type: 'block',
    name: 'svg',
    value: [{
      name: 'any',
      type: 'statement',
      value: ''
    }]
  });

  compare(t, 'circle {}', {
    type: 'block',
    name: 'svg',
    value: [{
      name: 'circle',
      type: 'block',
      value: []
    }]
  });

  compare(t, 'circle { name: } ', {
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

  compare(t, '{}', {
    type: 'block',
    name: 'svg',
    value: []
  });

  compare(t, '{', {
    type: 'block',
    name: 'svg',
    value: []
  });

  compare(t, '}', {
    type: 'block',
    name: 'svg',
    value: []
  });

  compare(t, '{any}', {
    type: 'block',
    name: 'svg',
    value: []
  });

  compare(t, 'text { {} }', {
    type: 'block',
    name: 'svg',
    value: [{
      value: [],
      name: 'text',
      type: 'block'
    }]
  });

});


test('statement', t => {

  compare(t, 'viewBox: 0 0 0 10', {
    name: 'svg',
    type: 'block',
    value: [{
      type: 'statement',
      name: 'viewBox',
      value: '0 0 0 10'
    }]
  });

  compare(t, 'circle { cx: 5; cy: 5 }', {
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


test('group property', t => {
  compare(t, 'cx, cy: 5', {
    name: 'svg',
    type: 'block',
    value: [
      { type: 'statement', name: 'cx', value: '5'},
      { type: 'statement', name: 'cy', value: '5'},
    ]
  });

  compare(t, 'cx, cy: 5 6', {
    name: 'svg',
    type: 'block',
    value: [
      { type: 'statement', name: 'cx', value: '5'},
      { type: 'statement', name: 'cy', value: '6'},
    ]
  });

});


test('semicolon separated values', t => {
  compare(t, 'values: 60; 100; 180', {
    name: 'svg',
    type: 'block',
    value: [
      { type: 'statement', name: 'values', value: '60;100;180' }
    ]
  });

  compare(t, 'values: 20 50; 100; 110; cy: 10', {
    name: 'svg',
    type: 'block',
    value: [
      { type: 'statement', name: 'values', value: '20 50;100;110' },
      { type: 'statement', name: 'cy', value: '10' }
    ]
  });
});


test('colon separated properties', t => {
  compare(t, 'xlink:href: url(#app)', {
    name: 'svg',
    type: 'block',
    value: [
      { type: 'statement', name: 'xlink:href', value: 'url(#app)' }
    ]
  });

  compare(t, 'xlink:title: hello:world', {
    name: 'svg',
    type: 'block',
    value: [
      { type: 'statement', name: 'xlink:title', value: 'hello:world' }
    ]
  });
});


test('block names', t => {
  compare(t, 'g circle { } ', {
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

  compare(t, 'g circle { name: value } ', {
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

  compare(t, `
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

test('id expand', t => {
  compare(t, 'g circle#id { } ', {
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
});

test('empty id expand', t => {
  compare(t, '#abc {}', {
    type: 'block',
    name: 'svg',
    value: [{
      type: 'block',
      name: '#abc',
      value: []
    }]
  });
});

test('ignore tail semicolons', t => {
  compare(t, 'path {};', {
    type: 'block',
    name: 'svg',
    value: [{
      type: 'block',
      name: 'path',
      value: []
    }]
  });
});
