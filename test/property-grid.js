import test from 'node:test';

import property from '../src/core/property.js';
import compare from './_compare.js';

compare.use(input => {
    return property.grid(input, { isSpecialSelector: true, maxGrid: 64*64 });
});

test('basic settings', () => {
    compare('1/ 100px', {
        clip: true,
        p3d: false,
        grid: { count: 1, ratio: 1, x: 1, y: 1, z: 1 },
        size: 'width:100px;height:100px;'
    });

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

    compare('1/100%/#fff', {
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
    compare('row 1 / 100%', {
        clip: true,
        p3d: false,
        flex: 'row',
        grid: { count: 1, ratio: 1, x: 1, y: 1, z: 1 },
        size: 'width:100%;height:100%;'
    });

    compare('col 1 / 100%', {
        clip: true,
        p3d: false,
        flex: 'column',
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
        enlarge: ['.5'],
        rotate: 'x 10deg',
        translate: '10px 10px',
        persp: ['100px', '50%']
    });

    compare('1/100%+1^.5 1 *x 10deg ~10px 10px ∆100px 50%', {
        clip: true,
        p3d: false,
        grid: { count: 1, ratio: 1, x: 1, y: 1, z: 1 },
        size: 'width:100%;height:100%;',
        scale: '1',
        enlarge: ['.5', '1'],
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
    compareBorder('1 ß thin', 'thin solid');
    compareBorder('1 ß thin dotted', 'thin dotted');
    compareBorder('1 ß 1px solid var(--border)', '1px solid var(--border)');
    compareBorder('1 ß 1px var(--solid-width)', '1px var(--solid-width) solid');
});

test('border flag matches only standalone border tokens', () => {
    compare('1 / 100% / var(--border-color)', {
        clip: true,
        p3d: false,
        grid: { count: 1, ratio: 1, x: 1, y: 1, z: 1 },
        size: 'width:100%;height:100%;',
        fill: 'var(--border-color)'
    });

    compare('1 border:red', {
        clip: true,
        p3d: false,
        borderLegacy: 'red',
        grid: { count: 1, ratio: 1, x: 1, y: 1, z: 1 },
    });
});

test('gap _ command', () => {
    function compareGap(input, output) {
        compare(input, {
            clip: true,
            p3d: false,
            gap: output,
            grid: { count: 1, ratio: 1, x: 1, y: 1, z: 1 },
        });
    }
    compareGap('1 _1px', '1px');
    compareGap('1 _.5px', '.5px');
    compareGap('1 _2', '2px');
    compareGap('1 _1em 2em', '1em 2em');
});

test('gap _ command with rule', () => {
    function compareGapRule(input, gap, rowRule, columnRule = rowRule) {
        compare(input, {
            clip: true,
            p3d: false,
            gap,
            rowRule,
            columnRule,
            grid: { count: 1, ratio: 1, x: 1, y: 1, z: 1 },
        });
    }
    // a rule with no width of its own fills the gap
    compareGapRule('1 _4px red', '4px', 'red solid 4px');
    compareGapRule('1 _4px dashed red', '4px', 'dashed red 4px');
    compareGapRule('1 _4px 8px red', '4px 8px', 'red solid 4px', 'red solid 8px');
    compareGapRule('1 _var(--g) red', 'var(--g)', 'red solid var(--g)');
    // % is not a valid line width, hairline fallback
    compareGapRule('1 _2% red', '2%', 'red solid 1px');
    // explicit width wins
    compareGapRule('1 _4px solid red 2px', '4px', 'solid red 2px');
    compareGapRule('1 _4px solid red 2', '4px', 'solid red 2px');
    compareGapRule('1 _4px red var(--w)', '4px', 'red var(--w) solid');
    // a missing gap takes the rule width
    compareGapRule('1 _red', '1px', 'red solid 1px');
    compareGapRule('1 _thick red', '5px', 'thick red solid');
});

test('backdrop filter | command', () => {
    function compareBackdropFilter(input, output) {
        compare(input, {
            clip: true,
            p3d: false,
            backdropFilter: output,
            grid: { count: 1, ratio: 1, x: 1, y: 1, z: 1 },
        });
    }
    compareBackdropFilter('1 | @svg-filter()', '@svg-filter()');
    compareBackdropFilter('1 | blur(2px)', 'blur(2px)');
});
