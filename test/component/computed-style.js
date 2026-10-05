import test from 'node:test';
import assert from 'node:assert/strict';

import { getRgbaColor } from '../../src/component/computed-style.js';

test('getRgbaColor gives null where there is no computed color', () => {
    let root = { querySelector: () => ({ style: {} }) };
    globalThis.CSS = { supports: () => true };
    globalThis.getComputedStyle = () => ({ color: '' });
    try {
        assert.equal(getRgbaColor(root, 'red'), null, 'off-document');
        globalThis.getComputedStyle = () => ({ color: 'rgb(255, 0, 0)' });
        assert.deepEqual(getRgbaColor(root, 'red'), [255, 0, 0, 1]);
    } finally {
        delete globalThis.CSS;
        delete globalThis.getComputedStyle;
    }
});
