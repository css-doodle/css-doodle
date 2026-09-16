import test from 'node:test';
import assert from 'node:assert/strict';

import parseSvg from '../../src/parser/parse-svg.js';
import { expandFilterShorthands } from '../../src/generator/svg-filter.js';

const expand = (input, seed = 42, options) => {
    let warnings = [];
    let root = parseSvg(input, { type: 'block', name: 'filter' });
    expandFilterShorthands(root, seed, message => warnings.push(message), options);
    return { root, warnings };
};
const child = (root, name) => root.value.find(token => token.type === 'block' && token.name === name);
const attrs = block => Object.fromEntries(block.value
    .filter(token => token.type === 'statement')
    .map(token => [token.name, token.value]));

test('filter commands expand into the legacy primitive order', () => {
    let { root, warnings } = expand(`
        frequency: .003 .008;
        scale: 80;
        octave: 10;
        seed: 99;
        blur: 2;
        erode: 3;
        dilate: 4;
    `);
    assert.deepEqual(root.value.slice(0, 4).map(token => [token.name, token.value]), [
        ['x', '-20%'], ['y', '-20%'], ['width', '140%'], ['height', '140%'],
    ]);
    assert.deepEqual(root.value.filter(token => token.type === 'block').map(token => token.name), [
        'feMorphology', 'feMorphology', 'feGaussianBlur',
        'feTurbulence', 'feDisplacementMap',
    ]);
    assert.deepEqual(attrs(child(root, 'feTurbulence')), {
        type: 'fractalNoise', baseFrequency: '.003 .008', seed: '99',
        numOctaves: '10', result: 'cssd-noise-2',
    });
    assert.deepEqual(attrs(child(root, 'feDisplacementMap')), {
        in: 'cssd-input-1', in2: 'cssd-noise-2', scale: '80',
    });
    assert.deepEqual(warnings, []);
});

test('a command group occupies its source position in the filter pipeline', () => {
    let { root } = expand(`
        feGaussianBlur { stdDeviation: 2; result: blurred }
        frequency: .03;
        scale: 20;
        channels { b: 2b }
    `);
    let blocks = root.value.filter(token => token.type === 'block');
    assert.deepEqual(blocks.map(token => token.name), [
        'feGaussianBlur', 'feTurbulence', 'feDisplacementMap', 'channels',
    ]);
    assert.deepEqual(attrs(blocks[2]), {
        in: 'blurred', in2: 'cssd-noise-1', scale: '20',
    });
});

test('root attributes do not break the filter pipeline', () => {
    let { root } = expand(`
        feGaussianBlur { stdDeviation: 2 }
        filterUnits: userSpaceOnUse;
        x: -10%;
        frequency: .03;
        scale: 20;
    `);
    assert.equal(attrs(child(root, 'feGaussianBlur')).result, 'cssd-input-1');
    assert.equal(attrs(child(root, 'feDisplacementMap')).in, 'cssd-input-1');
});

test('generated result names do not collide with author names', () => {
    let { root } = expand(`
        feGaussianBlur { result: "cssd-noise-1" }
        frequency: .03;
        scale: 20;
        feOffset { result: cssd-input-2 }
    `);
    let displacement = attrs(child(root, 'feDisplacementMap'));
    assert.equal(attrs(child(root, 'feTurbulence')).result, 'cssd-noise-2');
    assert.equal(displacement.in, 'cssd-noise-1');
    assert.equal(displacement.in2, 'cssd-noise-2');
});

test('legacy mode keeps displacement on SourceGraphic', () => {
    let { root } = expand(`
        frequency: .03;
        scale: 20;
        blur: 2;
    `, 42, { chainInput: false });
    assert.equal(attrs(child(root, 'feGaussianBlur')).result, undefined);
    assert.deepEqual(attrs(child(root, 'feDisplacementMap')), {
        in: 'SourceGraphic', scale: '20',
    });
});

test('a non-element block before a command group does not crash expansion', () => {
    let { root, warnings } = expand('style { filter { color: red } } frequency: .03; scale: 20;');
    assert.ok(child(root, 'feTurbulence'));
    assert.deepEqual(attrs(child(root, 'feDisplacementMap')), {
        in: 'SourceGraphic', in2: 'cssd-noise-1', scale: '20',
    });
    assert.deepEqual(warnings, []);
});

test('non-primitive blocks never receive a generated result', () => {
    let { root } = expand('animate { attributeName: x } frequency: .03; scale: 20;');
    assert.equal(attrs(child(root, 'animate')).result, undefined);
    assert.equal(attrs(child(root, 'feDisplacementMap')).in, 'SourceGraphic');
});

test('a preceding primitive receives a generated result only when needed', () => {
    let { root } = expand('channels { b: 2b } frequency: .03; scale: 20;');
    let blocks = root.value.filter(token => token.type === 'block');
    assert.equal(attrs(blocks[0]).result, 'cssd-input-1');
    assert.equal(attrs(blocks[2]).in, 'cssd-input-1');

    ({ root } = expand('channels { b: 2b } frequency: .03;'));
    assert.equal(attrs(child(root, 'channels')).result, undefined);
});

test('root filter regions are defaulted but explicit attributes win', () => {
    let { root } = expand('x: 0; width: 100%; frequency: .1;');
    let values = Object.fromEntries(root.value
        .filter(token => token.type === 'statement')
        .map(token => [token.name, token.value]));
    assert.deepEqual(values, {
        y: '-20%', height: '140%', x: '0', width: '100%',
    });
});

test('explicit filter attributes override individual region values', () => {
    let { root, warnings } = expand('region: 20%; x: -5%; height: 200%; channels {}');
    let values = Object.fromEntries(root.value
        .filter(token => token.type === 'statement')
        .map(token => [token.name, token.value]));
    assert.deepEqual(values, {
        y: '-20%', width: '140%', x: '-5%', height: '200%',
    });
    assert.deepEqual(warnings, []);
});

test('region shorthand works without filter commands', () => {
    let { root } = expand('region: -25% / 150%; channels {}');
    assert.deepEqual(root.value.slice(0, 4).map(token => [token.name, token.value]), [
        ['x', '-25%'], ['y', '-25%'], ['width', '150%'], ['height', '150%'],
    ]);
});

test('malformed regions warn and are dropped; the last valid one wins', () => {
    let { root, warnings } = expand('region: 20px; channels {}');
    assert.equal(root.value.some(token => token.type === 'statement' && token.name === 'region'), false);
    assert.deepEqual(warnings, ['svg-filter region: invalid value']);

    ({ root, warnings } = expand('region: 10%; region: 20%; channels {}'));
    assert.deepEqual(root.value.slice(0, 4).map(token => token.value), ['-20%', '-20%', '140%', '140%']);
    assert.deepEqual(warnings, []);

    ({ root, warnings } = expand('region: 10%; region: nope; channels {}'));
    assert.deepEqual(root.value.slice(0, 4).map(token => token.value), ['-10%', '-10%', '120%', '120%']);
    assert.deepEqual(warnings, ['svg-filter region: invalid value']);
});

test('commands that depend on frequency warn and are omitted without it', () => {
    let { root, warnings } = expand('scale: 20; octave: 3; seed: 7; channels {}');
    assert.deepEqual(root.value.filter(token => token.type === 'block').map(token => token.name), ['channels']);
    assert.deepEqual(warnings, [
        'svg-filter scale: needs frequency',
        'svg-filter octave: needs frequency',
        'svg-filter seed: needs frequency',
    ]);
});

test('duplicate commands use the later declaration', () => {
    let { root, warnings } = expand('blur: 1; blur: 3;');
    assert.equal(attrs(child(root, 'feGaussianBlur')).stdDeviation, '3');
    assert.deepEqual(warnings, []);
});

test('separate command groups expand separately', () => {
    let { root } = expand('blur: 1; channels {} blur: 2;');
    assert.deepEqual(root.value.filter(token => token.type === 'block').map(token => token.name), [
        'feGaussianBlur', 'channels', 'feGaussianBlur',
    ]);
});

test('numOctaves is a positive integer', () => {
    let { root, warnings } = expand('frequency: .1; octave: 3.7;');
    assert.equal(attrs(child(root, 'feTurbulence')).numOctaves, '3');
    assert.deepEqual(warnings, []);

    ({ root, warnings } = expand('frequency: .1; octave: 0.4;'));
    assert.equal(attrs(child(root, 'feTurbulence')).numOctaves, '1');

    ({ root, warnings } = expand('frequency: .1; octave: high;'));
    assert.equal(attrs(child(root, 'feTurbulence')).numOctaves, undefined);
    assert.deepEqual(warnings, ['svg-filter numOctaves: expected integer']);

    ({ root, warnings } = expand('feTurbulence { numOctaves: 2.2; seed: 1 }'));
    assert.equal(attrs(child(root, 'feTurbulence')).numOctaves, '2');
});
