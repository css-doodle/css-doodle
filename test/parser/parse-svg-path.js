import test from 'node:test';
import assert from 'node:assert/strict';

import parseSvgPath from '../../src/parser/parse-svg-path.js';

test('commands with their numbers, case gives the type', () => {
    assert.deepEqual(parseSvgPath(''), { valid: true, commands: [] });
    assert.deepEqual(parseSvgPath('M'), {
        valid: true,
        commands: [{ name: 'M', type: 'absolute', value: [] }],
    });
    assert.deepEqual(parseSvgPath('M 0 0 m 0 0'), {
        valid: true,
        commands: [
            { name: 'M', type: 'absolute', value: [0, 0] },
            { name: 'm', type: 'relative', value: [0, 0] },
        ],
    });
    assert.deepEqual(parseSvgPath('M 0,0 l -100,0'), {
        valid: true,
        commands: [
            { name: 'M', type: 'absolute', value: [0, 0] },
            { name: 'l', type: 'relative', value: [-100, 0] },
        ],
    });
    assert.deepEqual(parseSvgPath('h-43 v5 h-10 v-5 h-10 v16 h-32 v10 h10 v-26 h -10'), {
        valid: true,
        commands: [
            { name: 'h', type: 'relative', value: [-43] },
            { name: 'v', type: 'relative', value: [5] },
            { name: 'h', type: 'relative', value: [-10] },
            { name: 'v', type: 'relative', value: [-5] },
            { name: 'h', type: 'relative', value: [-10] },
            { name: 'v', type: 'relative', value: [16] },
            { name: 'h', type: 'relative', value: [-32] },
            { name: 'v', type: 'relative', value: [10] },
            { name: 'h', type: 'relative', value: [10] },
            { name: 'v', type: 'relative', value: [-26] },
            { name: 'h', type: 'relative', value: [-10] },
        ],
    });
});

test('unknown commands and leading numbers make the path invalid', () => {
    assert.deepEqual(parseSvgPath('x 0 0 m 0 0'), {
        valid: false,
        commands: [
            { name: 'x', type: 'unknown', value: [0, 0] },
            { name: 'm', type: 'relative', value: [0, 0] },
        ],
    });
    assert.deepEqual(parseSvgPath('0,0 l -100,0'), {
        valid: false,
        commands: [{ name: 'l', type: 'relative', value: [-100, 0] }],
    });
});
