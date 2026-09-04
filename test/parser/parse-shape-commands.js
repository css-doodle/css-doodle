import test from 'node:test';
import assert from 'node:assert/strict';

import parseShapeCommands from '../../src/parser/parse-shape-commands.js';

test('statements end on ; and the last one may omit it', () => {
    assert.deepEqual(parseShapeCommands('split: 10'), { split: '10' });
    assert.deepEqual(parseShapeCommands('split: 10;'), { split: '10' });
    assert.deepEqual(parseShapeCommands('split: 10;;;'), { split: '10' });
    assert.deepEqual(parseShapeCommands('a: 10; b: 10;'), { a: '10', b: '10' });
    assert.deepEqual(parseShapeCommands('\n a: 10;\n b: 10\n'), { a: '10', b: '10' });
    assert.deepEqual(parseShapeCommands(''), {});
});

test('comments are ignored', () => {
    assert.deepEqual(
        parseShapeCommands('/* comments */ a: 10; /* comments */ b: 10;'),
        { a: '10', b: '10' }
    );
});

test('values keep their colons and calls, the last statement wins', () => {
    assert.deepEqual(parseShapeCommands('a: b:c;'), { a: 'b:c' });
    assert.deepEqual(parseShapeCommands('a: seq(1, 2);'), { a: 'seq(1,2)' });
    assert.deepEqual(parseShapeCommands('a: seq(1, 2); a: hello'), { a: 'hello' });
    assert.deepEqual(parseShapeCommands('a: seq(1, 2);; a: hello'), { a: 'hello' });
    assert.deepEqual(parseShapeCommands(':hello'), {});
    assert.deepEqual(parseShapeCommands('r: 2^sin.cos(2t);'), { r: '2^sin.cos(2t)' });
});

test('a leading - negates the value, except for dashed names', () => {
    assert.deepEqual(parseShapeCommands('-: 10'), { '-': '10' });
    assert.deepEqual(parseShapeCommands('-x: 10'), { x: '-1 * (10)' });
    assert.deepEqual(parseShapeCommands('-x: sin(t)'), { x: '-1 * (sin(t))' });
    assert.deepEqual(parseShapeCommands('-x: sin(t)+5'), { x: '-1 * (sin(t)+5)' });
    assert.deepEqual(parseShapeCommands('--x: 10'), { '--x': '10' });
    assert.deepEqual(parseShapeCommands('-fill-rule: evenodd'), { 'fill-rule': 'evenodd' });
});
