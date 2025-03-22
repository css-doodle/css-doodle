import test from 'node:test';

import property from '../src/property.js';
import compare from './_compare.js';

compare.use(input => {
  return property.grid(input, { is_special_selector: true, max_grid: 64*64 });
});

test('basic settings', () => {
  compare('1 / 100%', {
    clip: true,
    p3d: false,
    grid: { count: 1, ratio: 1, x: 1, y: 1, z: 1 },
    size: 'width:100%;height:100%;'
  });

  compare('1 / 100% / #fff', {
    clip: true,
    p3d: false,
    grid: { count: 1, ratio: 1, x: 1, y: 1, z: 1 },
    size: 'width:100%;height:100%;',
    fill: '#fff'
  });
});

test('aspect ratio', () => {
  compare('1 / 100% auto (3/2) / #fff', {
    clip: true,
    p3d: false,
    grid: { count: 1, ratio: 1, x: 1, y: 1, z: 1 },
    size: 'width:100%;height:auto;aspect-ratio: 3/2;',
    fill: '#fff'
  });

  compare('1 / 100% auto .5 / #fff', {
    clip: true,
    p3d: false,
    grid: { count: 1, ratio: 1, x: 1, y: 1, z: 1 },
    size: 'width:100%;height:auto;aspect-ratio: calc(.5);',
    fill: '#fff'
  });

  compare('1 / 100% auto var(--s) / #fff', {
    clip: true,
    p3d: false,
    grid: { count: 1, ratio: 1, x: 1, y: 1, z: 1 },
    size: 'width:100%;height:auto;aspect-ratio: calc(var(--s));',
    fill: '#fff'
  });
});

test('clip and p3d', () => {
  compare('1 no-clip', {
    clip: false,
    p3d: false,
    grid: { count: 1, ratio: 1, x: 1, y: 1, z: 1 },
  });

  compare('1 noclip p3d', {
    clip: false,
    p3d: true,
    grid: { count: 1, ratio: 1, x: 1, y: 1, z: 1 },
  });

  compare('noclip p3d 1 / 100%', {
    clip: false,
    p3d: true,
    grid: { count: 1, ratio: 1, x: 1, y: 1, z: 1 },
    size: 'width:100%;height:100%;'
  });
});

test('flex', () => {
  compare('| 1 / 100%', {
    clip: true,
    p3d: false,
    flex: 'column',
    grid: { count: 1, ratio: 1, x: 1, y: 1, z: 1 },
    size: 'width:100%;height:100%;'
  });

  compare('- 1 / 100%', {
    clip: true,
    p3d: false,
    flex: 'row',
    grid: { count: 1, ratio: 1, x: 1, y: 1, z: 1 },
    size: 'width:100%;height:100%;'
  });
});

test('transform commands', () => {
  compare('1 / 100% + 1 ^.5 * x 10deg ~ 10px 10px ∆ 100px 50%', {
    clip: true,
    p3d: false,
    grid: { count: 1, ratio: 1, x: 1, y: 1, z: 1 },
    size: 'width:100%;height:100%;',
    scale: '1',
    enlarge: '.5',
    rotate: 'x 10deg',
    translate: '10px 10px',
    persp: ['100px', '50%']
  });
});

test('multiple * commands', () => {
  compare('1 / 100% *10deg *h 10deg', {
    clip: true,
    p3d: false,
    grid: { count: 1, ratio: 1, x: 1, y: 1, z: 1 },
    size: 'width:100%;height:100%;',
    rotate: '10deg',
    hueRotate: '10deg',
  });
});


test('border ß command', () => {
  function compareBorder(input, output) {
    compare(input, {
      clip: true,
      p3d: false,
      border: output,
      grid: { count: 1, ratio: 1, x: 1, y: 1, z: 1 },
    });
  }
  compareBorder('1 ß1', '1px solid');
  compareBorder('1 ß1px', '1px solid');
  compareBorder('1 ßred', 'red 1px solid');
  compareBorder('1 ß#000', '#000 1px solid');
  compareBorder('1 ß 1px solid', '1px solid');
  compareBorder('1 ßsolid', 'solid 1px');
  compareBorder('1 ßdotted', 'dotted 1px');
  compareBorder('1 ßnone', 'none 1px solid');
  compareBorder('1 ß.5', '.5px solid');
  compareBorder('1 ß.5px', '.5px solid');
  compareBorder('1 ß.5px dotted', '.5px dotted');
});
