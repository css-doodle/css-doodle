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
    // leftovers glue to a row of their own block only
    assert.deepEqual(parseShapeCommands('k: 1; 2'), { k: '1;2' });
    assert.deepEqual(parseShapeCommands('circle { scale: .5 } 2').blocks.items, ['circle;scale:.5']);
    assert.deepEqual(parseShapeCommands('k: 1; circle { 2 }'), { k: '1', blocks: { op: 'union', items: ['circle'] } });
    // an empty value keeps the block's `}`
    assert.deepEqual(parseShapeCommands('union { circle { r: } star }').blocks.items[0].blocks.items, ['circle;r:', 'star']);
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
    assert.deepEqual(parseShapeCommands(`text: 'a;b}'; font: serif`), { text: `'a;b}'`, font: 'serif' });
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
    assert.deepEqual(parseShapeCommands('-fill-rule: evenodd'), { 'fill-rule': 'evenodd' });
    // each part, as move splits it, and of a rotate only the angle after its axis
    assert.deepEqual(parseShapeCommands('-move: .5 0').move, '-1 * (.5) -1 * (0)');
    assert.deepEqual(parseShapeCommands('-rotate: y 30').rotate, 'y -1 * (30)');
    assert.deepEqual(parseShapeCommands('-rotate: 10, 20').rotate, '-1 * (10),-1 * (20)');
});

test('several names take a part each, as move does, or all the whole value', () => {
    assert.deepEqual(parseShapeCommands('x, y: cos(t), sin(t)'), { x: 'cos(t)', y: 'sin(t)' });
    assert.deepEqual(parseShapeCommands('x, y: cos(t) sin(t)'), { x: 'cos(t)', y: 'sin(t)' });
    assert.deepEqual(parseShapeCommands('a, b: k * .5 -1'), { a: 'k * .5', b: '-1' });
    assert.deepEqual(parseShapeCommands('a, b: 1'), { a: '1', b: '1' });
    assert.deepEqual(parseShapeCommands('a, b: 1, 2, 3'), { a: '1,2,3', b: '1,2,3' });
    assert.deepEqual(parseShapeCommands('-x, y: 1, 2'), { x: '-1 * (1)', y: '2' });
    assert.deepEqual(parseShapeCommands('rotate, move: 30, .5 0').steps, [['rotate', '30'], ['move', '.5 0']]);
});

test('a match block becomes rows that read its arm, the values before it, or a step that does nothing', () => {
    assert.deepEqual(parseShapeCommands('r: 1; match(i > 2) { r: .5 }'), { r: 'match(match_1_ == 1,.5,1)', match_1_: 'match(((i > 2)),1,0)' });
    let steps = parseShapeCommands('match { n == 1 { move: 0 .5 } n == 2 { rotate: 30 } else { scale: 2 } }');
    assert.equal(steps.match_1_, 'match((n == 1),1,(n == 2),2,3)');
    assert.deepEqual(steps.steps, [['move', 'match(match_1_ == 1,0,0) match(match_1_ == 1,.5,0)'], ['rotate', 'match(match_1_ == 2,30,0)'], ['scale', 'match(match_1_ == 3,2,1)']]);
    // a single value fills every part of the one before it
    assert.equal(parseShapeCommands('size: 1 2; match(k) { size: 3 }').size, 'match(match_1_ == 1,3,1) match(match_1_ == 1,3,2)');
});

test('a group block keeps its shapes as text and takes commands of its own', () => {
    assert.deepEqual(parseShapeCommands('subtract { smooth: .1; heart; circle { scale: .5 } star 5 .4 } rotate: 10'), {
        rotate: '10',
        steps: [['rotate', '10']],
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
    // a body of `{…}` blocks gives each copy its own, as copies holding @ functions read
    let own = parseShapeCommands('union { circle*2 {{ move: 1 0 } { move: 2 0 }} union*2 {{ circle } { star }} }').blocks.items[0].blocks.items;
    assert.deepEqual(own.slice(0, 2), ['circle;move:1 0;n:1;N:2;nx:1;ny:1', 'circle;move:2 0;n:2;N:2;nx:2;ny:1']);
    assert.deepEqual(own.slice(2).map(g => [g.blocks.items, g.n]), [[['circle'], '1'], [['star'], '2']]);
});

test('name#id keeps a shape for later, #id draws it with more rows', () => {
    // used before given, not drawn where given
    assert.deepEqual(parseShapeCommands('subtract { circle; #dot { move: 1 0 } } circle#dot { scale: .2 }').blocks.items, [
        { blocks: { op: 'subtract', items: ['circle', 'circle;scale:.2;move:1 0'] } },
    ]);
    // a group, with copies
    let [a, b] = parseShapeCommands('union#ring*2 { rotate: n * 180; #dot } circle#dot; #ring').blocks.items;
    assert.deepEqual([a.blocks.items, a.n, b.n], [['circle'], '1', '2']);
    // a copy of a name keeps n; a bare name at the top is the preset
    assert.deepEqual(parseShapeCommands('heart#h; #h*2 { scale: .5 }').blocks.items, ['heart;scale:.5;n:1;N:2;nx:1;ny:1', 'heart;scale:.5;n:2;N:2;nx:2;ny:1']);
    assert.deepEqual(parseShapeCommands('points: 10; r: seq(1; .5); heart'), { points: '10', r: 'seq(1;.5)' });
    // unknown names and a shape that names itself draw nothing
    assert.deepEqual(parseShapeCommands('union#a { #a; circle } #a; #nope').blocks.items, [{ blocks: { op: 'union', items: ['circle'] } }]);
});

test('#id touches its name, before or after a count, and a space before # starts another shape', () => {
    let items = s => parseShapeCommands(s).blocks.items[0].blocks.items;
    assert.deepEqual(items('circle#k { scale: .2 } union { #k #k { rotate: 90 } }'), ['circle;scale:.2', 'circle;scale:.2;rotate:90']);
    assert.deepEqual(items('circle#k { scale: .2 } union { circle #k { rotate: 90 } }'), ['circle', 'circle;scale:.2;rotate:90']);
    assert.deepEqual(items('circle*2#k { scale: .2 } union { #k }'), items('circle#k*2 { scale: .2 } union { #k }'));
    assert.equal(items('circle*2#k { scale: .2 } union { #k }').length, 2);
    // not inside parentheses
    assert.deepEqual(items('union { (a: 1 #b) }'), ['(a:1 #b)']);
});
