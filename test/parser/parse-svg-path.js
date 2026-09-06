import test from 'node:test';
import assert from 'node:assert/strict';

import parseSvgPath from '../../src/parser/parse-svg-path.js';

test('commands with their numbers, case gives the type', () => {
    assert.deepEqual(parseSvgPath(''), { valid: true, commands: [] });
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
    // a command letter is a single character
    assert.equal(parseSvgPath('Mm 0 0 h 5').valid, false);
});

test('each command takes whole groups of numbers', () => {
    const valid = input => parseSvgPath(input).valid;
    assert.equal(valid('M 0 0 c 1 2 3 4 5 6 s 7 8 9 10 q 1 2 3 4 t 5 6 z'), true);
    assert.equal(valid('M 0 0 a 5 5 0 0 1 10 0 A 5 5 0 1 0 0 0'), true);
    assert.equal(valid('M 0 0 L 1 1 2 2 3 3'), true);
    // a bare command, a half pair, a unit, something after z
    assert.equal(valid('M'), false);
    assert.equal(valid('M 0 0 l 5'), false);
    assert.equal(valid('M 5% 3'), false);
    assert.equal(valid('M 0 0 z 1'), false);
    // arc flags glued together read as one number
    assert.equal(valid('M 0 0 a5 5 0 0110 0'), false);
    // command letters on their own are not a path
    assert.equal(valid('a, c, s'), false);
});
