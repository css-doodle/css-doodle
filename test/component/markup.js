import test from 'node:test';
import assert from 'node:assert/strict';

import { createGrid } from '../../src/component/markup.js';

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
