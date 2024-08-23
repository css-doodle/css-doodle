import test from 'node:test';
import parseSvgPath from '../src/parser/parse-svg-path.js';

import compare from './_compare.js';

compare.use(parseSvgPath);

test('svg path', () => {

  compare('', {
    valid: true,
    commands: []
  });

  compare('M', {
    valid: true,
    commands: [
      {name: 'M', 'type': 'absolute', value: []}
    ]
  });

  compare('M 0 0 m 0 0', {
    valid: true,
    commands: [
      {name: 'M', 'type': 'absolute', value: [0, 0]},
      {name: 'm', 'type': 'relative', value: [0, 0]}
    ]
  });

  compare('x 0 0 m 0 0', {
    valid: false,
    commands: [
      {name: 'x', 'type': 'unknown', value: [0, 0]},
      {name: 'm', 'type': 'relative', value: [0, 0]}
    ]
  });

  compare('M 0,0 l -100,0', {
    valid: true,
    commands: [
      {name: 'M', 'type': 'absolute', value: [0, 0]},
      {name: 'l', 'type': 'relative', value: [-100, 0]}
    ]
  });

  compare('0,0 l -100,0', {
    valid: false,
    commands: [
      {name: 'l', 'type': 'relative', value: [-100, 0]}
    ]
  });

});
