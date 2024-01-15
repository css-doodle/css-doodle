import test from 'ava';

import property from '../src/property.js';
import compare from './_compare.js';

compare.use(input => {
  return property.grid(input, { is_special_selector: true, max_grid: 64*64 });
});

test('basic settings', t => {
  compare(t, '1 / 100%', {
    clip: true,
    p3d: false,
    grid: { count: 1, ratio: 1, x: 1, y: 1, z: 1 },
    size: 'width:100%;height:100%;'
  });

  compare(t, '1 / 100% / #fff', {
    clip: true,
    p3d: false,
    grid: { count: 1, ratio: 1, x: 1, y: 1, z: 1 },
    size: 'width:100%;height:100%;',
    fill: '#fff'
  });
});

test('aspect ratio', t => {
  compare(t, '1 / 100% auto (3/2) / #fff', {
    clip: true,
    p3d: false,
    grid: { count: 1, ratio: 1, x: 1, y: 1, z: 1 },
    size: 'width:100%;height:auto;aspect-ratio: 3/2;',
    fill: '#fff'
  });

  compare(t, '1 / 100% auto .5 / #fff', {
    clip: true,
    p3d: false,
    grid: { count: 1, ratio: 1, x: 1, y: 1, z: 1 },
    size: 'width:100%;height:auto;aspect-ratio: calc(.5);',
    fill: '#fff'
  });

  compare(t, '1 / 100% auto var(--s) / #fff', {
    clip: true,
    p3d: false,
    grid: { count: 1, ratio: 1, x: 1, y: 1, z: 1 },
    size: 'width:100%;height:auto;aspect-ratio: calc(var(--s));',
    fill: '#fff'
  });
});

test('clip and p3d', t => {
  compare(t, '1 no-clip', {
    clip: false,
    p3d: false,
    grid: { count: 1, ratio: 1, x: 1, y: 1, z: 1 },
  });

  compare(t, '1 noclip p3d', {
    clip: false,
    p3d: true,
    grid: { count: 1, ratio: 1, x: 1, y: 1, z: 1 },
  });

  compare(t, 'noclip p3d 1 / 100%', {
    clip: false,
    p3d: true,
    grid: { count: 1, ratio: 1, x: 1, y: 1, z: 1 },
    size: 'width:100%;height:100%;'
  });
});

test('flex', t => {
  compare(t, '| 1 / 100%', {
    clip: true,
    p3d: false,
    flexCol: true,
    grid: { count: 1, ratio: 1, x: 1, y: 1, z: 1 },
    size: 'width:100%;height:100%;'
  });

  compare(t, '- 1 / 100%', {
    clip: true,
    p3d: false,
    flexRow: true,
    grid: { count: 1, ratio: 1, x: 1, y: 1, z: 1 },
    size: 'width:100%;height:100%;'
  });
});

test('transform commands', t => {
  compare(t, '1 / 100% + 1 ^.5 * 10deg ~ 10px 10px ∆ 100px 50%', {
    clip: true,
    p3d: false,
    grid: { count: 1, ratio: 1, x: 1, y: 1, z: 1 },
    size: 'width:100%;height:100%;',
    scale: '1',
    enlarge: '.5',
    rotate: '10deg',
    translate: '10px 10px',
    persp: ['100px', '50%']
  });
});
