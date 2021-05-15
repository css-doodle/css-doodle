import ava from 'ava';
import parseSvg from '../src/parser/parse-svg';

function compare(fn) {
  return t => {
    fn((code, result, print) => {
      let applied = parseSvg(code);
      if (print) console.log(applied);
      t.deepEqual(result, applied);
    });
  }
}

function test(name, fn) {
  ava(name, compare(fn));
}

for (let m in ava) {
  test[m] = (name, fn) => ava[m](name, compare(fn));
}


test('edge cases', t => {

  t('', {
    type: 'block',
    name: 'svg',
    value: []
  });

  t('any', {
    type: 'block',
    name: 'svg',
    value: []
  });

  t('any:;', {
    type: 'block',
    name: 'svg',
    value: [{
      name: 'any',
      type: 'statement',
      value: ''
    }]
  });

  t('circle {}', {
    type: 'block',
    name: 'svg',
    value: [{
      name: 'circle',
      type: 'block',
      value: []
    }]
  });

  t('circle { name: } ', {
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

  t('{}', {
    type: 'block',
    name: 'svg',
    value: []
  });

  t('{', {
    type: 'block',
    name: 'svg',
    value: []
  });

  t('}', {
    type: 'block',
    name: 'svg',
    value: []
  });

  t('{any}', {
    type: 'block',
    name: 'svg',
    value: []
  });

  t('text { {} }', {
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

  t('viewBox: 0 0 0 10', {
    name: 'svg',
    type: 'block',
    value: [{
      type: 'statement',
      name: 'viewBox',
      value: '0 0 0 10'
    }]
  });

  t('circle { cx: 5; cy: 5 }', {
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
  t('cx, cy: 5', {
    name: 'svg',
    type: 'block',
    value: [
      { type: 'statement', name: 'cx', value: '5'},
      { type: 'statement', name: 'cy', value: '5'},
    ]
  });
});
