import test from 'node:test';
import assert from 'node:assert/strict';

import generateSvgGradient from '../../src/generator/svg-gradient.js';

// the generator takes the arguments as thunks
const gradient = (type, ...values) => generateSvgGradient(type, values.map(v => () => v));
const linear = (...values) => gradient('linearGradient', ...values);
const radial = (...values) => gradient('radialGradient', ...values);

test('a transform followed by color stops', () => {
    assert.equal(linear('rotate(30)', 'deeppink 50%', 'yellow 100%'),
        'linearGradient { gradientTransform: rotate(30); stop { offset: 50%; stop-color: deeppink } stop { offset: 100%; stop-color: yellow } }');
    assert.equal(radial('rotate(45)', 'red 0%', 'blue 100%'),
        'radialGradient { gradientTransform: rotate(45); stop { offset: 0%; stop-color: red } stop { offset: 100%; stop-color: blue } }');
    assert.equal(linear('skewX(20) translate(185, 0)', 'red 0%', 'blue 100%'),
        'linearGradient { gradientTransform: skewX(20) translate(185, 0); stop { offset: 0%; stop-color: red } stop { offset: 100%; stop-color: blue } }');
    assert.equal(radial('scale(1.5)', 'white 0%', 'black 100%'),
        'radialGradient { gradientTransform: scale(1.5); stop { offset: 0%; stop-color: white } stop { offset: 100%; stop-color: black } }');
    assert.equal(linear('translate(50, 50)', 'orange 25%', 'purple 75%'),
        'linearGradient { gradientTransform: translate(50, 50); stop { offset: 25%; stop-color: orange } stop { offset: 75%; stop-color: purple } }');
    assert.equal(linear('matrix(1, 0, 0, 1, 0, 0)', 'cyan 50%'),
        'linearGradient { gradientTransform: matrix(1, 0, 0, 1, 0, 0); stop { offset: 50%; stop-color: cyan } }');
});

test('color stops without a transform', () => {
    assert.equal(linear('deeppink 50%', 'yellow 100%'),
        'linearGradient {  stop { offset: 50%; stop-color: deeppink } stop { offset: 100%; stop-color: yellow } }');
    assert.equal(radial('red 0%', 'blue 100%'),
        'radialGradient {  stop { offset: 0%; stop-color: red } stop { offset: 100%; stop-color: blue } }');
    assert.equal(radial('red'), 'radialGradient {  stop { offset: 0%; stop-color: red } }');
});

test('missing offsets spread evenly', () => {
    assert.equal(linear('red', 'green', 'blue'),
        'linearGradient {  stop { offset: 0%; stop-color: red } stop { offset: 50%; stop-color: green } stop { offset: 100%; stop-color: blue } }');
    assert.equal(linear('red 0%', 'green', 'blue 100%'),
        'linearGradient {  stop { offset: 0%; stop-color: red } stop { offset: 50%; stop-color: green } stop { offset: 100%; stop-color: blue } }');
});

test('empty arguments and stray commas', () => {
    assert.equal(linear(), 'linearGradient {   }');
    assert.equal(linear('red', 'green', ','),
        'linearGradient {  stop { offset: 0%; stop-color: red } stop { offset: 100%; stop-color: green } }');
    assert.equal(linear(',', 'red', 'green'),
        'linearGradient {  stop { offset: 0%; stop-color: red } stop { offset: 100%; stop-color: green } }');
});

test('a number or angle shorthand means rotate', () => {
    assert.equal(linear('45', 'red', 'blue'),
        'linearGradient { gradientTransform: rotate(45); stop { offset: 0%; stop-color: red } stop { offset: 100%; stop-color: blue } }');
    assert.equal(linear('-30', 'pink', 'purple'),
        'linearGradient { gradientTransform: rotate(-30); stop { offset: 0%; stop-color: pink } stop { offset: 100%; stop-color: purple } }');
    assert.equal(linear('90deg', 'red', 'blue'),
        'linearGradient { gradientTransform: rotate(90); stop { offset: 0%; stop-color: red } stop { offset: 100%; stop-color: blue } }');
    assert.equal(linear('0.25turn', 'red', 'blue'),
        'linearGradient { gradientTransform: rotate(90); stop { offset: 0%; stop-color: red } stop { offset: 100%; stop-color: blue } }');
});

test('a third value on a stop is its opacity', () => {
    assert.equal(linear('red 0% 0.5', 'blue 100% 1'),
        'linearGradient {  stop { offset: 0%; stop-color: red; stop-opacity: 0.5 } stop { offset: 100%; stop-color: blue; stop-opacity: 1 } }');
    assert.equal(radial('red', 'blue 50% 0.8', 'green'),
        'radialGradient {  stop { offset: 0%; stop-color: red } stop { offset: 50%; stop-color: blue; stop-opacity: 0.8 } stop { offset: 100%; stop-color: green } }');
});
