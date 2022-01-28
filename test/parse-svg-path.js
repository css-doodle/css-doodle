import test from 'ava';

import parseSvgPath from '../src/parser/parse-svg-path.js';
import compare from './_compare.js';

compare.use(parseSvgPath);

test('svg path', t => {

  compare(t, '', {
    valid: true,
    commands: []
  });

  compare(t, 'M', {
    valid: true,
    commands: [
      {name: 'M', 'type': 'absolute', value: []}
    ]
  });

  compare(t, 'M 0 0 m 0 0', {
    valid: true,
    commands: [
      {name: 'M', 'type': 'absolute', value: [0, 0]},
      {name: 'm', 'type': 'relative', value: [0, 0]}
    ]
  });

  compare(t, 'x 0 0 m 0 0', {
    valid: false,
    commands: [
      {name: 'x', 'type': 'unknown', value: [0, 0]},
      {name: 'm', 'type': 'relative', value: [0, 0]}
    ]
  });

  compare(t, 'M 0,0 l -100,0', {
    valid: true,
    commands: [
      {name: 'M', 'type': 'absolute', value: [0, 0]},
      {name: 'l', 'type': 'relative', value: [-100, 0]}
    ]
  });

  compare(t, '0,0 l -100,0', {
    valid: false,
    commands: [
      {name: 'l', 'type': 'relative', value: [-100, 0]}
    ]
  });

});
