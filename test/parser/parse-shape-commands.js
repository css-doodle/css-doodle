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
    assert.deepEqual(parseShapeCommands('-fill: evenodd'), { fill: 'evenodd' });
});

test('a group block keeps its shapes as text and takes commands of its own', () => {
    assert.deepEqual(parseShapeCommands('subtract { smooth: .1; heart; circle { scale: .5 } star 5 .4 } rotate: 10'), {
        rotate: '10',
        blocks: { op: 'union', items: [{ smooth: '.1', blocks: { op: 'subtract', items: ['heart', 'circle;scale:.5', 'star 5 .4'] } }] },
    });
    // groups nest, an empty one is still a group
    assert.deepEqual(parseShapeCommands('union { intersect {} }').blocks.items[0].blocks.items, [{ blocks: { op: 'intersect', items: [] } }]);
    // a body in parentheses, as `$name` writes it, stays one shape, also with a block
    assert.deepEqual(parseShapeCommands('union { (points: 8; r: .5); ((a: 1; b: 2); c: 3) { scale: .5 } }').blocks.items[0].blocks.items,
        ['(points:8;r:.5)', '((a:1;b:2);c:3);scale:.5']);
});

test('name*N repeats a shape or a group, each copy with n, N, nx and ny', () => {
    let { items } = parseShapeCommands('union { circle*2 { scale: .3 } star*2; union*2 { rotate: n * 90; circle } }').blocks.items[0].blocks;
    assert.deepEqual(items.slice(0, 4), [
        'circle;scale:.3;n:1;N:2;nx:1;ny:1', 'circle;scale:.3;n:2;N:2;nx:2;ny:1',
        'star;n:1;N:2;nx:1;ny:1', 'star;n:2;N:2;nx:2;ny:1',
    ]);
    assert.deepEqual(items.slice(4).map(g => [g.rotate, g.n, g.N]), [['n * 90', '1', '2'], ['n * 90', '2', '2']]);
    // across a grid, row by row
    assert.deepEqual(parseShapeCommands('union { circle*2x2 }').blocks.items[0].blocks.items.map(s => s.split(';').slice(1).join(' ')),
        ['n:1 N:4 nx:1 ny:1', 'n:2 N:4 nx:2 ny:1', 'n:3 N:4 nx:1 ny:2', 'n:4 N:4 nx:2 ny:2']);
});
