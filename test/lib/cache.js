import test from 'node:test';
import assert from 'node:assert/strict';

import { memo, clearMemos } from '../../src/lib/cache.js';

test('memo forgets once its keys and string results pass 4M characters', () => {
    let calls = 0;
    let big = memo(key => (calls++, key + 'x'.repeat(1 << 20)));
    for (let i = 0; i < 40; ++i) big(String(i));
    calls = 0;
    big('0');
    big('0');
    assert.equal(calls, 1);
});

test('clearMemos starts the count over', () => {
    let calls = 0;
    let big = memo(key => (calls++, key.length > 1 ? 'x'.repeat(1 << 20) : ''));
    for (let i = 0; i < 3; ++i) big('k' + i);
    clearMemos();
    big('fresh');
    big('a');
    calls = 0;
    big('fresh');
    assert.equal(calls, 0);
});
