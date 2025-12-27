import test, { describe } from 'node:test';

import { create_svg_gradient } from '../src/utils/create-svg-gradient.js';
import compare from './_compare.js';

describe('create_svg_gradient', () => {

  const gradient = (type, ...values) => create_svg_gradient(type, values.map(v => () => v));

  compare.use({
    linear: (...args) => gradient('linearGradient', ...args),
    radial: (...args) => gradient('radialGradient', ...args),
  });

  test('linearGradient with transformation and color stops', () => {
    compare.linear(['rotate(30)', 'deeppink 50%', 'yellow 100%'],
      'linearGradient { gradientTransform: rotate(30); stop { offset: 50%; stop-color: deeppink } stop { offset: 100%; stop-color: yellow } }');
  });

  test('radialGradient with transformation and color stops', () => {
    compare.radial(['rotate(45)', 'red 0%', 'blue 100%'],
      'radialGradient { gradientTransform: rotate(45); stop { offset: 0%; stop-color: red } stop { offset: 100%; stop-color: blue } }');
  });

  test('linearGradient without transformation', () => {
    compare.linear(['deeppink 50%', 'yellow 100%'],
      'linearGradient {  stop { offset: 50%; stop-color: deeppink } stop { offset: 100%; stop-color: yellow } }');
  });

  test('radialGradient without transformation', () => {
    compare.radial(['red 0%', 'blue 100%'],
      'radialGradient {  stop { offset: 0%; stop-color: red } stop { offset: 100%; stop-color: blue } }');
  });

  test('color stops without offset', () => {
    compare.linear(['red', 'green', 'blue'],
      'linearGradient {  stop { offset: 0%; stop-color: red } stop { offset: 50%; stop-color: green } stop { offset: 100%; stop-color: blue } }');
  });

  test('mixed color stops with and without offset', () => {
    compare.linear(['red 0%', 'green', 'blue 100%'],
      'linearGradient {  stop { offset: 0%; stop-color: red } stop { offset: 50%; stop-color: green } stop { offset: 100%; stop-color: blue } }');
  });

  test('combined transformations', () => {
    compare.linear(['skewX(20) translate(185, 0)', 'red 0%', 'blue 100%'],
      'linearGradient { gradientTransform: skewX(20) translate(185, 0); stop { offset: 0%; stop-color: red } stop { offset: 100%; stop-color: blue } }');
  });

  test('scale transformation', () => {
    compare.radial(['scale(1.5)', 'white 0%', 'black 100%'],
      'radialGradient { gradientTransform: scale(1.5); stop { offset: 0%; stop-color: white } stop { offset: 100%; stop-color: black } }');
  });

  test('translate transformation', () => {
    compare.linear(['translate(50, 50)', 'orange 25%', 'purple 75%'],
      'linearGradient { gradientTransform: translate(50, 50); stop { offset: 25%; stop-color: orange } stop { offset: 75%; stop-color: purple } }');
  });

  test('matrix transformation', () => {
    compare.linear(['matrix(1, 0, 0, 1, 0, 0)', 'cyan 50%'],
      'linearGradient { gradientTransform: matrix(1, 0, 0, 1, 0, 0); stop { offset: 50%; stop-color: cyan } }');
  });

  test('single color stop', () => {
    compare.radial(['red'],
      'radialGradient {  stop { offset: 0%; stop-color: red } }');
  });

  test('empty args', () => {
    compare.linear([],
      'linearGradient {   }');
  });

  test('tail extra ,', () => {
    compare.linear(['red', 'green', ','],
      'linearGradient {  stop { offset: 0%; stop-color: red } stop { offset: 100%; stop-color: green } }');
  });

  test('head extra ,', () => {
    compare.linear([',', 'red', 'green'],
      'linearGradient {  stop { offset: 0%; stop-color: red } stop { offset: 100%; stop-color: green } }');
  });

  test('number shorthand for rotate', () => {
    compare.linear(['45', 'red', 'blue'],
      'linearGradient { gradientTransform: rotate(45); stop { offset: 0%; stop-color: red } stop { offset: 100%; stop-color: blue } }');
  });

  test('negative number shorthand for rotate', () => {
    compare.linear(['-30', 'pink', 'purple'],
      'linearGradient { gradientTransform: rotate(-30); stop { offset: 0%; stop-color: pink } stop { offset: 100%; stop-color: purple } }');
  });

  test('angle with deg unit', () => {
    compare.linear(['90deg', 'red', 'blue'],
      'linearGradient { gradientTransform: rotate(90); stop { offset: 0%; stop-color: red } stop { offset: 100%; stop-color: blue } }');
  });

  test('angle with turn unit', () => {
    compare.linear(['0.25turn', 'red', 'blue'],
      'linearGradient { gradientTransform: rotate(90); stop { offset: 0%; stop-color: red } stop { offset: 100%; stop-color: blue } }');
  });

  test('color stop with opacity', () => {
    compare.linear(['red 0% 0.5', 'blue 100% 1'],
      'linearGradient {  stop { offset: 0%; stop-color: red; stop-opacity: 0.5 } stop { offset: 100%; stop-color: blue; stop-opacity: 1 } }');
  });

  test('color stop with opacity no offset', () => {
    compare.radial(['red', 'blue 50% 0.8', 'green'],
      'radialGradient {  stop { offset: 0%; stop-color: red } stop { offset: 50%; stop-color: blue; stop-opacity: 0.8 } stop { offset: 100%; stop-color: green } }');
  });

});
