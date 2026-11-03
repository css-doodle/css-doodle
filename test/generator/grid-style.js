import test from 'node:test';
import assert from 'node:assert/strict';

import gridStyleRules from '../../src/generator/grid-style.js';
import property from '../../src/core/property.js';

// the [selector, rule] pairs an @grid value adds, whitespace collapsed
function rules(value) {
    let list = [];
    gridStyleRules(property.grid(value, { maxGrid: 64 }), (selector, rule) => {
        list.push([selector, rule.replace(/\s+/g, ' ').trim()]);
    });
    return list;
}

test('a plain grid adds no rules', () => {
    assert.deepEqual(rules('5'), []);
    assert.deepEqual(rules('5 / 100px'), []);
});

test('a third / part fills the host and noclip lifts containment', () => {
    assert.deepEqual(rules('5 / 100px / #000'), [[':host', 'background:#000;']]);
    assert.deepEqual(rules('5 noclip'), [[':host', 'contain:none;']]);
});

test('* rotates the container, * h turns the hue, a bare number in degrees', () => {
    assert.deepEqual(rules('5 * 30'), [[':container', 'rotate:30deg;']]);
    assert.deepEqual(rules('5 * 1 1 0 30'), [[':container', 'rotate:1 1 0 30deg;']]);
    assert.deepEqual(rules('5 * .5turn'), [[':container', 'rotate:.5turn;']]);
    assert.deepEqual(rules('5 * h 90'), [[':host', 'filter:hue-rotate(90deg);']]);
    assert.deepEqual(rules('5 * h .5turn'), [[':host', 'filter:hue-rotate(.5turn);']]);
});

test('+ scales, ~ translates and ∆ sets the perspective with an optional origin', () => {
    assert.deepEqual(rules('5 + 1.5'), [[':container', 'scale:1.5;']]);
    assert.deepEqual(rules('5 ~ 10px 20px'), [[':container', 'translate:10px 20px;']]);
    assert.deepEqual(rules('5 ∆ 800px'), [[':host', 'perspective:800px;']]);
    assert.deepEqual(rules('5 ∆ 800px 50% 0'), [[':host', 'perspective:800px;'], [':host', 'perspective-origin:50% 0;']]);
});

test('^ enlarges the container around its center: a number scales, a length adds', () => {
    assert.deepEqual(rules('5 ^ 2'), [[':container',
        'width: calc(2 * 100%); height: calc(2 * 100%); left: calc((100% - calc(2 * 100%)) / 2); top: calc((100% - calc(2 * 100%)) / 2);']]);
    assert.deepEqual(rules('5 ^ 10px 2'), [[':container',
        'width: calc(10px + 100%); height: calc(2 * 100%); left: calc((100% - calc(10px + 100%)) / 2); top: calc((100% - calc(2 * 100%)) / 2);']]);
});

test('row and col lay the cells out with flex, p3d keeps the 3D', () => {
    assert.deepEqual(rules('5 row'), [[':container', 'display:flex;'], ['cell', 'flex: 1;']]);
    assert.deepEqual(rules('5 col'), [[':container', 'display:flex;'], ['cell', 'flex: 1;'], [':container', 'flex-direction:column;']]);
    assert.deepEqual(rules('5 p3d'), [[':container', 'transform-style:preserve-3d;']]);
});

test('border, gap, gap rules and the backdrop filter', () => {
    assert.deepEqual(rules('5 border:red'), [[':host', 'border: 1px solid red;']]);
    assert.deepEqual(rules('5 _4px red'), [[':container', 'gap: 4px;'], [':container', 'row-rule: red solid 4px;column-rule: red solid 4px;']]);
    assert.deepEqual(rules('5 | blur(2px)'), [['bd', 'backdrop-filter: blur(2px);']]);
});
