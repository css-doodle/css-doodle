import test from 'ava';

import parseSvg from '../src/parser/parse-svg';
import compare from './_compare';
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
});


test('semicolon seperated values', t => {
  compare(t, 'values: 60; 100; 110', {
    name: 'svg',
    type: 'block',
    values: [
      { type: 'statement', name: 'values', value: '60; 100; 110' }
    ]
  }, true);
});


test('colon seperated properties', t => {
  compare(t, 'xlink:href: url(#app)', {
    name: 'svg',
    type: 'block',
    values: [
      { type: 'statement', name: 'xlink:href', value: 'url(#app)' }
    ]
  }, true);
});
