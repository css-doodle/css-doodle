import test from 'node:test';
import assert from 'node:assert/strict';

import { createGrid, getBasicStyles } from '../../src/component/markup.js';

test('bd renders only when backdrop styles exist', () => {
    // a formatting pass once inverted this condition, dropping the
    // element that backdrop-filter rules target
    let grid = { x: 1, y: 1, z: 1 };
    let withBackdrop = createGrid(grid, {
        content: {},
        styles: { backdrop: 'bd {backdrop-filter: blur(2px);}' },
    });
    let withoutBackdrop = createGrid(grid, {
        content: {},
        styles: { backdrop: '' },
    });
    assert.ok(withBackdrop.includes('<bd>'));
    assert.ok(!withoutBackdrop.includes('<bd>'));
});

test('depth makes a tree: every cell holds a full grid of children', () => {
    // slots repeat across subtrees, so tree cells carry classes, not ids
    let html = createGrid({ x: 2, y: 1, z: 2 }, { content: {}, styles: {} });
    let children =
        '<cell class="c-1-1-2" part="cell"></cell>' +
        '<cell class="c-2-1-2" part="cell"></cell>';
    for (let x of [1, 2]) {
        assert.ok(html.includes(`<cell class="c-${x}-1-1" part="cell">${children}</cell>`), html);
    }
    assert.ok(!html.includes('id='), html);
});

test('tree content lands in the leaves', () => {
    // text inside a subdivided cell would take one of its tracks
    let content = { '.c-1-1-1': 'root', '.c-1-1-2': 'leaf' };
    let html = createGrid({ x: 1, y: 2, z: 2 }, { content, styles: {} });
    assert.ok(html.includes('<cell class="c-1-1-2" part="cell">leaf</cell>'), html);
    assert.ok(!html.includes('root'), html);
    // a chain keeps its content at every level
    let chain = createGrid({ x: 1, y: 1, z: 2 }, { content: { '#c-1-1-1': 'a', '#c-1-1-2': 'b' }, styles: {} });
    assert.ok(chain.includes('>a<cell id="c-1-1-2" part="cell">b</cell>'), chain);
});

test('a pure chain and a flat grid keep unique ids', () => {
    let chain = createGrid({ x: 1, y: 1, z: 3 }, { content: {}, styles: {} });
    assert.ok(chain.includes(
        '<cell id="c-1-1-1" part="cell">' +
        '<cell id="c-1-1-2" part="cell">' +
        '<cell id="c-1-1-3" part="cell"></cell></cell></cell>'
    ), chain);
    let flat = createGrid({ x: 2, y: 1, z: 1 }, { content: {}, styles: {} });
    assert.ok(flat.includes('<cell id="c-1-1-1" part="cell"></cell><cell id="c-2-1-1" part="cell"></cell>'), flat);
});

test('non-leaf tree cells subdivide through a grid template', () => {
    let tree = getBasicStyles({ x: 1, y: 3, z: 6 });
    assert.ok(tree.includes('cell:has(>cell)'), tree);
    assert.ok(tree.includes('grid-template: repeat(3,1fr)/repeat(1,1fr)'), tree);
    // a parent cell centers its items, so nested cells size to the track
    // explicitly or the leaves collapse to 0x0
    assert.match(tree, /cell > cell \{\s*width: 100%;\s*height: 100%\s*\}/);
    // the gap of the root grid repeats at every level
    assert.match(tree, /cell:has\(>cell\) \{\s*gap: inherit;/);
    // flat grids and chains have no nested grids to lay out
    assert.ok(!getBasicStyles({ x: 4, y: 4, z: 1 }).includes(':has'));
    assert.ok(!getBasicStyles({ x: 1, y: 1, z: 8 }).includes(':has'));
});

test('tree cells stay auto-placed, keeping position:absolute intact', () => {
    // a grid-area pin would become the containing block of absolutely
    // positioned children; carve fractal slots with visibility:hidden
    assert.ok(!getBasicStyles({ x: 2, y: 2, z: 3 }).includes('grid-area'));
});
