import test from 'node:test';
import assert from 'node:assert/strict';

import property from '../../src/core/property.js';

// --- @grid ---

const grid = input => property.grid(input, { isSpecialSelector: true, maxGrid: 64 * 64 });

const one = { count: 1, ratio: 1, x: 1, y: 1, z: 1 };
const base = { clip: true, p3d: false, grid: one };

test('grid: dimensions, size and fill', () => {
    assert.deepEqual(grid('1/ 100px'), { ...base, size: 'width:100px;height:100px;' });
    assert.deepEqual(grid('1 / 100%'), { ...base, size: 'width:100%;height:100%;' });
    assert.deepEqual(grid('1 / 100% / #fff'), { ...base, size: 'width:100%;height:100%;', fill: '#fff' });
    assert.deepEqual(grid('1/100%/#fff'), { ...base, size: 'width:100%;height:100%;', fill: '#fff' });
});

test('grid: aspect ratio in the size', () => {
    assert.deepEqual(grid('1 / 100% auto (3/2) / #fff'), {
        ...base, size: 'width:100%;height:auto;aspect-ratio: 3/2;', fill: '#fff',
    });
    assert.deepEqual(grid('1 / 100% auto .5 / #fff'), {
        ...base, size: 'width:100%;height:auto;aspect-ratio: calc(.5);', fill: '#fff',
    });
    assert.deepEqual(grid('1 / 100% auto var(--s) / #fff'), {
        ...base, size: 'width:100%;height:auto;aspect-ratio: calc(var(--s));', fill: '#fff',
    });
});

test('grid: clip and p3d flags in any position', () => {
    assert.deepEqual(grid('1 no-clip'), { ...base, clip: false });
    assert.deepEqual(grid('1 noclip p3d'), { ...base, clip: false, p3d: true });
    assert.deepEqual(grid('noclip p3d 1 / 100%'), {
        ...base, clip: false, p3d: true, size: 'width:100%;height:100%;',
    });
});

test('grid: flex direction', () => {
    assert.deepEqual(grid('row 1 / 100%'), { ...base, flex: 'row', size: 'width:100%;height:100%;' });
    assert.deepEqual(grid('col 1 / 100%'), { ...base, flex: 'column', size: 'width:100%;height:100%;' });
});

test('grid: transform commands', () => {
    let expected = {
        ...base,
        size: 'width:100%;height:100%;',
        scale: '1',
        enlarge: ['.5'],
        rotate: 'x 10deg',
        translate: '10px 10px',
        persp: ['100px', '50%'],
    };
    assert.deepEqual(grid('1 / 100% + 1 ^.5 * x 10deg ~ 10px 10px ∆ 100px 50%'), expected);
    assert.deepEqual(grid('1/100%+1^.5 1 *x 10deg ~10px 10px ∆100px 50%'), {
        ...expected, enlarge: ['.5', '1'],
    });
    // a second * command rotates the hue
    assert.deepEqual(grid('1 / 100% *10deg *h 10deg'), {
        ...base, size: 'width:100%;height:100%;', rotate: '10deg', hueRotate: '10deg',
    });
});

test('grid: ß border command', () => {
    for (let [input, border] of [
        ['1 ß1', '1px solid'],
        ['1 ß1px', '1px solid'],
        ['1 ßred', 'red 1px solid'],
        ['1 ß#000', '#000 1px solid'],
        ['1 ß 1px solid', '1px solid'],
        ['1 ßsolid', 'solid 1px'],
        ['1 ßdotted', 'dotted 1px'],
        ['1 ßnone', 'none 1px solid'],
        ['1 ß.5', '.5px solid'],
        ['1 ß.5px', '.5px solid'],
        ['1 ß.5px dotted', '.5px dotted'],
        ['1 ß thin', 'thin solid'],
        ['1 ß thin dotted', 'thin dotted'],
        ['1 ß 1px solid var(--border)', '1px solid var(--border)'],
        ['1 ß 1px var(--solid-width)', '1px var(--solid-width) solid'],
    ]) {
        assert.deepEqual(grid(input), { ...base, border }, input);
    }
});

test('grid: the border flag matches only a standalone token', () => {
    assert.deepEqual(grid('1 / 100% / var(--border-color)'), {
        ...base, size: 'width:100%;height:100%;', fill: 'var(--border-color)',
    });
    assert.deepEqual(grid('1 border:red'), { ...base, borderLegacy: 'red' });
});

test('grid: _ gap command', () => {
    for (let [input, gap] of [
        ['1 _1px', '1px'],
        ['1 _.5px', '.5px'],
        ['1 _2', '2px'],
        ['1 _1em 2em', '1em 2em'],
    ]) {
        assert.deepEqual(grid(input), { ...base, gap }, input);
    }
});

test('grid: _ gap command with a rule', () => {
    for (let [input, gap, rowRule, columnRule = rowRule] of [
        // a rule with no width of its own fills the gap
        ['1 _4px red', '4px', 'red solid 4px'],
        ['1 _4px dashed red', '4px', 'dashed red 4px'],
        ['1 _4px 8px red', '4px 8px', 'red solid 4px', 'red solid 8px'],
        ['1 _var(--g) red', 'var(--g)', 'red solid var(--g)'],
        // % is not a valid line width: hairline fallback
        ['1 _2% red', '2%', 'red solid 1px'],
        // an explicit width wins
        ['1 _4px solid red 2px', '4px', 'solid red 2px'],
        ['1 _4px solid red 2', '4px', 'solid red 2px'],
        ['1 _4px red var(--w)', '4px', 'red var(--w) solid'],
        // a missing gap takes the rule width
        ['1 _red', '1px', 'red solid 1px'],
        ['1 _thick red', '5px', 'thick red solid'],
    ]) {
        assert.deepEqual(grid(input), { ...base, gap, rowRule, columnRule }, input);
    }
});

test('grid: | backdrop filter command', () => {
    assert.deepEqual(grid('1 | @svg-filter()'), { ...base, backdropFilter: '@svg-filter()' });
    assert.deepEqual(grid('1 | blur(2px)'), { ...base, backdropFilter: 'blur(2px)' });
});

// --- @size ---

const size = input => property.size(input, { isSpecialSelector: true, grid: { ratio: 1 } });

test('size: one or two lengths', () => {
    assert.equal(size('100px'), 'width:100px;height:100px;');
    assert.equal(size('100px 50px'), 'width:100px;height:50px;');
});

test('size: paper presets ignore case, p means portrait', () => {
    assert.equal(size('a4'), 'width:297mm;height:210mm;');
    assert.equal(size('A4'), 'width:297mm;height:210mm;');
    assert.equal(size('a4 p'), 'width:210mm;height:297mm;');
});

test('size: prototype names are not presets', () => {
    assert.equal(size('constructor'), 'width:constructor;height:constructor;');
    assert.equal(size('hasOwnProperty'), 'width:hasOwnProperty;height:hasOwnProperty;');
});

test('size: auto takes the grid aspect ratio on special selectors', () => {
    assert.equal(size('auto'), 'width:auto;height:auto;aspect-ratio: 1;');
});
