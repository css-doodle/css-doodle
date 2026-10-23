import test from 'node:test';
import assert from 'node:assert/strict';

import parseCss from '../../src/parser/parse-css.js';
import parseGrid from '../../src/parser/parse-grid.js';
import parseShaders from '../../src/parser/parse-shaders.js';
import generateCss from '../../src/generator/css.js';
import createRandom from '../../src/core/random.js';

// maxGrid 64 mirrors the component's getMaxGrid()
const compile = (code, grid = '1', seed = 42, extra) =>
    generateCss(parseCss(code, extra), parseGrid(grid), seed, 64);
const css = (code, grid, seed) => compile(code, grid, seed).styles.all;
const cells = (code, grid, seed) => compile(code, grid, seed).styles.cells;
// the first @svg image in the sheet, without its xmlns
const svgImage = code => decodeURIComponent(css(code).match(/utf8,([^"]+)"/)[1]).replace(/ xmlns="[^"]+"/, '');

// the sheet compiled from `code` contains every fragment
function assertContains(code, ...fragments) {
    let all = css(code);
    for (let fragment of fragments) {
        assert.ok(all.includes(fragment), `${code}\n  expected: ${fragment}\n  in: ${all}`);
    }
}

// --- @pick(k: …) ---

test('@pick(k: …) takes item k from 1 in each cell, wrapping, and $() and @match read pick(k: …)', () => {
    let sheet = cells(`--c: @pick(@i: red, #00f, tan); --k: @i; --w: $(pick(k: 10, 20, 30));
        @match(i > 3) { --m: @p(i: a, b); }`, '1x4');
    assert.ok(/#c-1-1-1 \{--c:red;\s*--k:1;\s*--w:10;\}/.test(sheet), sheet);
    assert.ok(/#c-1-3-1 \{--c:tan;\s*--k:3;\s*--w:30;\}/.test(sheet), sheet);
    assert.ok(/#c-1-4-1 \{--c:red;\s*--k:4;\s*--w:10;\s*--m:b;\}/.test(sheet), sheet);
});

test('@pick(k: …) picks from the list a lone item gives, and fills ..., as @pn does', () => {
    assert.equal(cells('--c: @p(@i: @palette(3));', '1x2'), cells('--c: @pn(@palette(3));', '1x2'));
    assert.equal(cells('--c: @p(@i: [a-c]); --d: @p(@i: @m3(x@n));', '1x2'), '#c-1-1-1 {--c:a;\n--d:x1;}#c-1-2-1 {--c:b;\n--d:x2;}');
    assert.equal(cells('--c: @p(@i: "a, b");', '1x2'), ':is(cell,#_) {--c:a, b;}');
    // a trailing ... goes on past the end, and below 1 stays on the first item
    assert.equal(cells('--c: @p(@i + 1: 1, 3, ..., 5); --d: @p(@i * 5: 1, 2, ...); --e: @p(@i - 2: 1, 2, ...);', '1x2'),
        ':is(cell,#_) {--e:1;}#c-1-1-1 {--c:3;\n--d:5;}#c-1-2-1 {--c:5;\n--d:10;}');
});

test('@p, @P, @pd and @pnr run a trailing ... to the cell count, or to @N in a sequence', () => {
    for (let name of ['p', 'P', 'pd', 'PD', 'pnr', 'PNR']) {
        assert.equal(cells(`--a: @${name}(1, 2, ...);`, '4x4'), cells(`--a: @${name}(1, 2, ..., 16);`, '4x4'), name);
    }
    assert.equal(cells('--a: @m5(@pnr(1, 2, ...));'), '#c-1-1-1 {--a:5,4,3,2,1;}');
    // a shuffled stagger: every cell gets its own delay
    assert.equal(new Set(cells('--a: @pd(0s, .1s, ...);', '4x4').match(/--a:[^;]+/g)).size, 16);
});

// --- functions cells define ---

// --- depth on multi-cell grids ---

test('a tree grid composes one rule set per (x, y, z) slot, as classes', () => {
    // every physical cell in a slot shares its styles; @i counts within
    // one level and pairs with @z, mirroring how rules repeat down the tree
    let sheet = cells('order: @i; --d: @z;', '2x1x2');
    assert.ok(sheet.includes('.c-1-1-1,.c-1-1-2 {order:1;}'), sheet);
    assert.ok(sheet.includes('.c-2-1-1,.c-2-1-2 {order:2;}'), sheet);
    assert.ok(sheet.includes('.c-1-1-1,.c-2-1-1 {--d:1;}'), sheet);
    assert.ok(sheet.includes('.c-1-1-2,.c-2-1-2 {--d:2;}'), sheet);
    // a pure chain has unique slots and keeps its ids and numbering
    let chain = cells('order: @i;', '1x1x3');
    for (let i of [1, 2, 3]) {
        assert.ok(chain.includes(`#c-1-1-${i} {order:${i};}`), chain);
    }
});

test('pick sequences replay per level, so every level styles alike', () => {
    // the Sierpinski pattern: @pn distinguishes siblings, identically at
    // every depth of the tree
    let sheet = cells('left: @pn(50%, 0);', '1x3x3');
    assert.ok(sheet.includes('.c-1-1-1,.c-1-3-1,.c-1-1-2,.c-1-3-2,.c-1-1-3,.c-1-3-3 {left:50%;}'), sheet);
    assert.ok(sheet.includes('.c-1-2-1,.c-1-2-2,.c-1-2-3 {left:0;}'), sheet);
});

test('@z selects a depth level across the whole tree', () => {
    assert.equal(cells('@z(2) { color: red; }', '2x1x3'),
        '.c-1-1-2,.c-2-1-2 {color:red;}');
    assert.equal(cells('@depth(odd) { color: red; }', '1x2x2'),
        '.c-1-1-1,.c-1-2-1 {color:red;}');
    assert.equal(cells('@match(z == Z) { color: red; }', '2x1x2'),
        '.c-1-1-2,.c-2-1-2 {color:red;}');
});

test('@I is the level size inside a tree, but the reported grid keeps its count', () => {
    let compiled = compile(':doodle { @grid: 2x2x2; } --n: @I;', '1');
    assert.ok(compiled.styles.all.includes('--n:4;'), compiled.styles.all);
    assert.equal(compiled.grid.count, 8);
});

// --- prototype names ---

test('prototype names as @-properties pass through as plain declarations', () => {
    // `@__proto__: red` used to throw and `@toString: red` emitted [object Object]
    for (let name of ['__proto__', 'toString', 'constructor', 'hasOwnProperty', 'valueOf']) {
        assertContains(`@${name}: red; background: blue;`, 'background:blue;', `@${name}:red;`);
    }
});

test('prototype names as functions read as literal text like other unknown functions', () => {
    // `@constructor(1)` used to hit Object.prototype through MathFunc
    for (let name of ['constructor', 'toString', 'hasOwnProperty', 'valueOf']) {
        let all = css(`width: @${name}(1);`);
        assert.ok(all.includes(`width:@${name};`), all);
        assert.ok(!all.includes('[object'), all);
    }
});

test('a dotted name calls the variant of the function on its left', () => {
    let values = code => cells(code, '5').match(/--v:[^;]+;/g);
    let scatter = values('--v: @plot.scatter(star);');
    assert.equal(new Set(scatter).size, 25);
    assert.deepEqual(values('--v: @p.plot.scatter(star);'), scatter);
    // `.@name` and explicit nesting always compose
    for (let code of ['@plot.@scatter(star)', '@plot(@scatter(star))', '@scatter(star)', '@shape.scatter(star)']) {
        assert.match(compile(`--v: ${code};`).warnings[0]?.message, /unknown function @scatter/, code);
    }
    let corners = values('--v: @plot(points: -.5 .6, .5 .6, .9 .15, 0 -.85, -.9 .15);');
    assert.equal(new Set(corners).size, 25);
    assert.deepEqual(corners, values('--v: @plot(polygon { points: -.5 .6, .5 .6, .9 .15, 0 -.85, -.9 .15 });'));
    for (let code of ['clip-path: @shape(cirle)', '@shape: cirle', '--v: @plot(cirle)', '--v: @tile(cirle)', 'background: @svg-polygon(cirle)']) {
        assert.equal(compile(`${code};`).warnings[0]?.message, 'unknown shape cirle', code);
    }
    // Function.prototype methods are not variants
    assert.match(compile('--v: @plot.call(star);').warnings[0].message, /unknown function @call/);
    // @tile.voronoi fills a preset or a formula
    let regions = values('--v: @tile.voronoi(star);');
    assert.equal(new Set(regions).size, 25);
    assert.match(regions[0], /--v: ?polygon\(/);
    // @tile is @tile.slice, every kind fills a square unless given a preset or a formula
    assert.deepEqual(values('--v: @tile(star);'), values('--v: @tile.slice(star);'));
    assert.deepEqual(values('--v: @tile();'), values('--v: @tile.slice(square);'));
    assert.deepEqual(values('--v: @tile(gap: 1);'), values('--v: @tile.slice(square; gap: 1);'));
    assert.deepEqual(values('--v: @tile.voronoi(gap: 1);'), values('--v: @tile.voronoi(square; gap: 1);'));
    assert.notDeepEqual(values('--v: @tile.voronoi(r: .5);'), values('--v: @tile.voronoi(square);'));
    let wedges = values('--v: @tile.voronoi(r: .5; gap: 2);');
    assert.equal(new Set(wedges).size, 25);
    assert.notDeepEqual(wedges, regions);
    assert.match(compile('--v: @plot.voronoi(star);').warnings[0]?.message, /unknown function @voronoi/);
});

test('@tile in clip-path brings its own transform-origin', () => {
    let sheet = cells('clip-path: @tile.voronoi(star); --v: @tile.voronoi(star);', '5');
    let tiles = sheet.match(/clip-path:polygon\([^;]+;transform-origin:[^;]+;/g);
    assert.equal(tiles.length, 25);
    assert.equal(new Set(tiles).size, 25);
    // only clip-path gets the origin
    assert.equal((sheet.match(/transform-origin/g) || []).length, 25);
    // the origin is the cell's @plot.scatter point
    let seeds = cells('--v: @plot.scatter(star);', '5').match(/--v:[^;]+/g).map(v => v.slice(4));
    tiles.forEach((t, i) => assert.ok(t.endsWith(`transform-origin:${seeds[i]};`), t));
});

test('rules that read the tile wait for the rule that makes it, wherever they are written', () => {
    let after = cells('clip-path: @tile.cube(); --k: @tile.k; ::after { left: @tile.x; --o: @tile.xy; --r: @tile.r }', '1x6');
    let before = cells('--k: @tile.k; ::after { left: @tile.x; --o: @tile.xy; --r: @tile.r } clip-path: @tile.cube();', '1x6');
    assert.match(after, /--k:3;/);
    assert.equal(before, after);
});

test('@R.t in a tile edge reads no cell, so every cell cuts from one tiling, each edge bent its own way', () => {
    let polys = cells('clip-path: @tile.grid(square; edge: @R.t(-.1, .1));', '6').match(/polygon\([^)]+\)/g)
        .filter(t => t != 'polygon(0 0)').map(t => t.slice(8, -1).split(', ').map(p => p.split(' ').map(parseFloat)));
    let inside = (vs, [x, y]) => {
        let n = 0;
        for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
            let [ax, ay] = vs[i], [bx, by] = vs[j];
            if ((ay > y) != (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax) n++;
        }
        return n & 1;
    };
    // @R.t used to bake each cell's position in, so each cell cut from its own tiling
    for (let x = 1.37; x < 100; x += 2) for (let y = 1.71; y < 100; y += 2) {
        assert.equal(polys.filter(vs => inside(vs, [x, y])).length, 1, `${x} ${y}`);
    }
    let shapes = new Set(polys.map(vs => {
        let x0 = Math.min(...vs.map(v => v[0])), y0 = Math.min(...vs.map(v => v[1]));
        return vs.map(([x, y]) => (x - x0).toFixed(1) + ' ' + (y - y0).toFixed(1)).sort().join();
    }));
    assert.ok(shapes.size > polys.length / 2, `${shapes.size} shapes in ${polys.length} tiles`);
});

test('@R.t in @plot reads no cell, so every cell takes its point from one closed loop', () => {
    let points = cells('--v: @plot(r: @R.t(.3, 1));', '120x1', 'b').match(/--v:[^;]+/g)
        .map(v => v.slice(4).split(' ').map(parseFloat));
    let steps = points.map(([x, y], i) => Math.hypot(x - points.at(i - 1)[0], y - points.at(i - 1)[1]));
    let median = steps.toSorted((a, b) => a - b)[60];
    // each cell used to read its own loop, so the last point jumped 10 steps back to the first
    assert.ok(Math.max(...steps) < 3 * median, `${Math.max(...steps)} against ${median}`);
});

test('grid line names keep the spaces around them', () => {
    assertContains('grid-template-columns: [a] 1fr [b] 2fr;', 'grid-template-columns:[a] 1fr [b] 2fr;');
});

// --- $ and calc ---

test('$ name suffix reads as a unit appended to the calc result', () => {
    // with an argument list the suffix is a unit, digits included;
    // without one the suffix is the expression itself
    assertContains('width: $(1+1);', 'width:2;');
    assertContains('width: $px(1+1);', 'width:2px;');
    assertContains('width: $%(1+1);', 'width:2%;');
    assertContains('width: $4(1+1);', 'width:24;');
    assertContains('width: $123;', 'width:123;');
});

test('a bare $ reads one variable name or number, as far as a CSS name goes', () => {
    // names hold letters, digits, _, - and non-ASCII; anything else is text
    assertContains('--s: 50; color: hsl(0 $s% 40%);', 'hsl(0 50% 40%)');
    assertContains('width: $5%;', 'width:5%;');
    assertContains('--s: 50; width: $s.x $s#a $s*2;', 'width:50.x 50#a 50*2;');
    assertContains('--k: 7; width: $k%2 $(k%2);', 'width:7%2 1;');
    assertContains('--é: tomato; color: $é;', 'color:tomato;');
    assertContains('--a-b: 2; --c_d: 3; width: $a-b.x $c_d#;', 'width:2.x 3#;');
    assertContains('width: $1.5 $-1.5;', 'width:1.5 -1.5;');
    // a suffix opening a call is still its unit
    assertContains('width: $%(1+1) $px.@x $px.r(1, 1);', 'width:2% 1px 1px;');
    // user function parameters and @pattern names stop at the same place
    assertContains('--f(s): $s%|$s.x; width: $f(30);', 'width:30%|30.x;');
    let pattern = compile('--é: 3; background: @pattern(fill: $é.0 / 4);').patterns;
    assert.deepEqual(Object.values(pattern).map(p => p.source), ['fill: 3.0 / 4']);
});

test('$ reads variables holding dimensioned values as numbers', () => {
    // `--w: 10px` used to poison the whole expression to 0
    assertContains('--w: 10px; width: $px(w * 2);', 'width:20px;');
    assertContains('--w: 10px; width: $(w * 2)px;', 'width:20px;');
    assertContains('--gap: 4px; --w: 10px; margin: $px(w + gap);', 'margin:14px;');
    assertContains('--angle: 45deg; transform: rotate($deg(angle * 2));', 'rotate(90deg);');
    // truly non-numeric values still read as 0
    assertContains('--c: red; width: $(c + 1);', 'width:1;');
});

test('$ with a lone variable name acts as a generation-time var()', () => {
    // values that do not read as math pass through verbatim
    assertContains('--c: tomato; color: $c;', 'color:tomato;');
    assertContains('--t: rotate(30deg); transform: $t;', 'transform:rotate(30deg);');
    assertContains('--w: 10px; width: $w;', 'width:10px;');
    assertContains('--s: calc(100px + 10em); width: $s;', 'width:calc(100px + 10em);');
    assertContains('--a: b; --b: tomato; color: $a;', 'color:tomato;');
    assertContains('--n: 3; width: $n;', 'width:3;');
    assertContains('--e: n + 2; --n: 3; width: $e;', 'width:5;');
    // an explicit unit or any operation asks for the number
    assertContains('--w: 10px; width: $px(w);', 'width:10px;');
    assertContains('--w: 10px; width: $(w * 2)px;', 'width:20px;');
});

test('$ math reads dashed variable names', () => {
    assertContains('--font-size: 5; width: $px(font-size * 2);', 'width:10px;');
    assertContains('--cell-w: 4; --cell-h: 2; width: $(cell-w * cell-h)px;', 'width:8px;');
    assertContains('--cell-w: 4; width: $(cell-w * @calc(2 + 1))px;', 'width:12px;');
    assertContains('--a-b: 9; --a: 3; --b: 1; width: $(a-b) $(a - b);', 'width:9 2;');
});

test('a leading --name in an argument reads the variable', () => {
    assertContains('--x: 3; width: @calc(--x * 2);', 'width:6;');
    assertContains('--x: 3; width: $(--x * 2);', 'width:6;');
    assertContains('--x: 3; width: $px(--x + 1);', 'width:4px;');
    assertContains('--x: 3; width: @p(--x);', 'width:3;');
    assertContains('--x: 3; width: @p(--x px);', 'width:3 px;');
    assertContains('--x: 3; width: @var(--x);', 'width:var(--x);');
    assertContains('--x: 3; width: @p(var(--x));', 'width:var(--x);');
});

test('numbers print without float noise', () => {
    assertContains('width: $px(0.1+0.2);', 'width:0.3px;');
    assertContains('rotate: @calc(0.1+0.7)deg;', 'rotate:0.8deg;');
    assertContains('width: @sqrt(2)px;', 'width:1.41421356237px;');
    assertContains('width: @m3(@n(*.1));', 'width:0.1,0.2,0.3;');
});

test('float dust snaps to zero at the output boundary', () => {
    // sin(π/200*200) rounds slightly past π and used to print -3.2e-15,
    // which SVG rejects for attributes like circle r
    assertContains('width: $(sin(π/200*200)*10);', 'width:0;');
    assertContains('width: @cos(π/2)px;', 'width:0px;');
});

test('$ with function parts evaluates through the compiled template', () => {
    // $(…@fn…) compiles once with placeholders instead of re-parsing a
    // spliced string per cell; results must read the same
    assertContains('@grid: 2x2; width: $(@x*10+@y)px;',
        'width:11px;', 'width:21px;', 'width:12px;', 'width:22px;');
    // a hole at the very start and very end of the expression
    assertContains('@grid: 2x2; order: $(@i+1); z-index: $(1-@i);',
        'order:2;', 'z-index:0;', 'order:5;', 'z-index:-3;');
    // signs around holes match spliced-string semantics
    assertContains('@grid: 1; margin: $(-@i)px $(2*-@i)px;', 'margin:-1px -2px;');
    // context variables still resolve next to placeholders
    assertContains('@grid: 1; --a: 4; width: $(a+@i*2)px;', 'width:6px;');
    assertContains('@grid: 1; rotate: $deg(@i*45);', 'rotate:45deg;');
});

test('$ falls back to splicing when a function result is not a number', () => {
    // @p yields a name that derefs through --b
    assertContains('@grid: 1; --b: 30; width: $(@p(b))px;', 'width:30px;');
    // a name spliced into math reads through the context
    assertContains('@grid: 1; --c: 7; width: $(@p(c)*2+@i)px;', 'width:15px;');
});

test('a negative function result or variable before a power is one operand', () => {
    assertContains('@grid: 1; --v: @m4($(@nd^2));', '--v:2.25,0.25,0.25,2.25;');
    assertContains('@grid: 1; --k: 2; --v: @m2($(1 + @nd ** 2 * k));', '--v:1.5,1.5;');
    assertContains('@grid: 1; --k: -2; --a: $($k^2); --b: $(k^2); --c: $(-k^2);', '--a:4;', '--b:4;', '--c:-4;');
    let pattern = compile('--k: -2; background: @pattern(fill: $k ** 2 + $k);').patterns;
    assert.deepEqual(Object.values(pattern).map(p => p.source), ['fill: (-2) ** 2 + -2']);
});

test('$ inside a sequence tracks the iteration variables', () => {
    assertContains('@grid: 1; --l: @M4($(@n*2));', '--l:2 4 6 8;');
    assertContains('@grid: 1; --l: @m(3.8, @n);', '--l:1,2,3,4;');
    // a tiny count is one item, not a range read from its exponent
    assertContains('@grid: 1; --l: @m(0.1 + 0.2 - 0.3, @n);', '--l:1;');
    assertContains('@grid: 1; --l: @m(sin(π), @n);', '--l:1;');
});

test('nested sequences share the 65536 item limit', () => {
    let count = code => css(code).match(/--l:([^;]*)/)[1].split('x').length - 1;
    assert.equal(count('--l: @M(1000, @M(1000, x));'), 1000 * 65);
    assert.equal(count('--l: @M(65536, @M(65536, @M(65536, x)));'), 65536);
    assert.equal(count('--l: @M(3, @M(4, x));'), 12);
    // the outer sequence counts once, however deep the inner one sits
    assertContains('--l: @m(40, @n(*@pn(@m2(1), @m2(-1))));', '--l:1,2,-3,-4,5,6,-7,-8,');
});

test('a sequence count that evaluates to 0 repeats nothing', () => {
    assertContains('@grid: 1; --l: @m(@i - 1, x);', '--l:;');
    assertContains('@grid: 1; --l: @m(2 - 2, x);', '--l:;');
    // a spaced grid form still reads as a grid
    assertContains('@grid: 1; --l: @m(2 x 2, @n);', '--l:1,2,3,4;');
    // the random draws stay, so later values do not shift
    const z = code => cells(code).match(/--z:([\d.]+)/)[1];
    assert.equal(z('--l: @m(@i - 1, @r(9)); --z: @r(9);'), z('--l: @m(1, @r(9)); --z: @r(9);'));
});

test('@calc and Math functions evaluate templated arguments the same', () => {
    assertContains('@grid: 1; width: @calc(@i*3+1)px;', 'width:4px;');
    assertContains('@grid: 1; opacity: @sin(π/2+@i-1);', 'opacity:1;');
    assertContains('@grid: 1; width: @max(@i, 5)px;', 'width:5px;');
    assertContains('@grid: 1; height: @pow(@i+1, 2)px;', 'height:4px;');
    // non-numeric results splice as before; Math functions see no
    // variables, so `a` reads as 0 either way
    assertContains('@grid: 1; --a: 3; width: @abs(@p(a)-5)px;', 'width:5px;');
    // constants ignore their arguments either way
    assertContains('@grid: 1; width: @trunc(@PI(@i))px;', 'width:3px;');
});

test('function results that are not plain strings reach calc functions safely', () => {
    // @plot returns a Point and the list functions return arrays; both
    // used to crash parseOperation, which called .slice()/.trim() on them
    for (let code of [
        'width: @i(@plot(r 5));',
        'width: @x(@plot(r 5));',
        'width: @dx(@plot(r 5));',
        'width: @t(@plot(r 5));',
        'width: @x(@mirror(1%,2%));',
        'width: @i(@cycle(1%,2%));',
        'width: @x(@cycle(1*,2*));',
    ]) {
        assert.doesNotThrow(() => compile(code), code);
    }
    // the operator argument forms keep reading the same
    assertContains('width: @i(*10);', 'width:10;');
    assertContains('width: @i(+2);', 'width:3;');
    assertContains('width: @i(2*);', 'width:2;');
    assertContains('width: @i(%360deg);', 'width:1deg;');
    // a bare value adds on a live base too
    assertContains('width: @t(+2);', 'width:calc(var(--cssd-utime) + 2);');
    assertContains('width: @ux(5);', 'width:calc(var(--cssd-umousex) + 5);');
});

test('math around time and pointer uniforms lowers to CSS', () => {
    // a lone read stays a var(); math on it used to collapse to 0
    assertContains('--t: @t; --a: $t;', '--t:var(--cssd-utime);', '--a:var(--cssd-utime);');
    assertContains('opacity: @calc(@t / 1000);', 'opacity:calc(var(--cssd-utime) / 1000);');
    assertContains('scale: @sin(@ts);', 'scale:calc(sin((var(--cssd-utime) / 1000)));');
    assertContains('--z: @max(@t, 3);', '--z:calc(max(var(--cssd-utime),3));');
    assertContains('--d: @calc(@ux - @uw / 2);', '--d:calc(var(--cssd-umousex) - (var(--cssd-uwidth) / 2));');
    assertContains('--on: $(@t > 5);', '--on:calc(max(0,sign(var(--cssd-utime) - 5)));');
    // through a variable
    assertContains('--t: @t; width: $(t / 50)px;', 'width:calc((var(--cssd-utime) / 50) * 1px);');
    // a unit after the lowered math multiplies in, glued or as a $ suffix
    assertContains('rotate: $(@t / 10)deg;', 'rotate:calc((var(--cssd-utime) / 10) * 1deg);');
    assertContains('rotate: @calc(@t / 10)deg;', 'rotate:calc((var(--cssd-utime) / 10) * 1deg);');
    assertContains('rotate: $deg(@t / 10);', 'rotate:calc((var(--cssd-utime) / 10) * 1deg);');
    assertContains('width: @t(/1000)s;', 'width:calc((var(--cssd-utime) / 1000) * 1s);');
    assertContains('width: $(@t)px solid;', 'width:calc((var(--cssd-utime)) * 1px) solid;');
    // numbers still fold around it, and plain units stay glued
    assertContains('--k: @calc(@t * @i);', '--k:calc(var(--cssd-utime) * 1);');
    assertContains('--y: $(@i * 2 + 1)px; --x: @sin(1);', '--y:3px;', '--x:0.841470984808;');
    // a stored var() or calc() reads as a live value too
    assertContains('--s: calc(100px + 10em); width: $(s * 2);', 'width:calc((100px + 10em) * 2);');
});

// --- functions, properties and diagnostics ---

test('argument-less @P() keeps the last pick pool intact', () => {
    // the no-args branch used to splice the stored pool in place,
    // draining it to a single constant value across cells
    let code = `
        @grid: 12x1 / 100px;
        :doodle { --pool: @p(red, blue, green, cyan, magenta, yellow); }
        color: @P();
    `;
    for (let seed of [1, 7, 42]) {
        // the six colors print once each with their cells listed
        let rules = [...cells(code, '12x1', seed).matchAll(/([^{}]+) \{color:([a-z]+);\}/g)];
        let colors = [];
        for (let i = 1; i <= 12; i++) {
            let rule = rules.find(m => m[1].split(',').includes(`#c-${i}-1-1`));
            colors.push(rule && rule[2]);
        }
        assert.equal(colors.length, 12);
        for (let i = 1; i < colors.length; ++i) {
            assert.notEqual(colors[i], colors[i - 1], `adjacent repeat at cell ${i + 1} (seed ${seed})`);
        }
    }
});

test('@gap draws a rule in the gap when given border-like values', () => {
    for (let [code, expected, absent = []] of [
        ['@gap: 4px;', ['gap:4px;'], ['row-rule']],
        ['@gap: 4px red;', ['gap:4px;', 'row-rule:red solid 4px;column-rule:red solid 4px;']],
        ['@gap: red;', ['gap:1px;', 'row-rule:red solid 1px;column-rule:red solid 1px;']],
        ['@gap: 4px 8px red;', ['gap:4px 8px;', 'row-rule:red solid 4px;column-rule:red solid 8px;']],
        ['@grid: 2 / 100px _4px red;', ['gap: 4px;', 'row-rule: red solid 4px;column-rule: red solid 4px;']],
    ]) {
        let all = css(code, '2');
        for (let e of expected) assert.ok(all.includes(e), `${code} -> ${all}`);
        for (let a of absent) assert.ok(!all.includes(a), `${code} -> ${all}`);
    }
});

test('empty svg functions generate without throwing', () => {
    // parseSvg with a custom root used to return a block with no
    // value for empty input, crashing skipHeadSVG
    for (let code of [
        '@grid: 2 | @svg-filter();',
        '@grid: 2 | @svg-filter( );',
        'background: @svg();',
    ]) {
        assert.ok(css(code, '2').length, code);
    }
});

test('@svg-filter expands compact channels blocks', () => {
    let compiled = compile(`filter: @svg-filter(
        channels {
            in: SourceGraphic;
            result: tinted;
            g: g - .5r;
            b: 2b + .2;
        }
    );`);
    let [filter] = Object.values(compiled.filters);
    assert.ok(filter.includes(
        '<feColorMatrix in="SourceGraphic" result="tinted" type="matrix" ' +
        'values="1 0 0 0 0 -0.5 1 0 0 0 0 0 2 0 0.2 0 0 0 1 0"/>'
    ), filter);
    assert.deepEqual(compiled.warnings, []);
});

test('@svg-filter mixes root commands with compact channels blocks', () => {
    let compiled = compile(`filter: @svg-filter(
        region: -25% / 150%;
        frequency: .003 .008;
        scale: 80;
        octave: 10;
        seed: @r(1000);

        channels {
            g: g - .5r;
            b: 2b + .2;
        }
    );`);
    let [filter] = Object.values(compiled.filters);
    assert.match(filter, /<filter id="filter-1" xmlns="[^"]+" x="-25%" y="-25%" width="150%" height="150%">/);
    assert.match(filter, /<feTurbulence type="fractalNoise" baseFrequency="\.003 \.008" seed="[\d.]+" numOctaves="10" result="cssd-noise-1"\/>/);
    assert.ok(!filter.includes('@r'), filter);
    assert.match(filter, /<feDisplacementMap in="SourceGraphic" in2="cssd-noise-1" scale="80"\/>/);
    assert.match(filter, /<feColorMatrix type="matrix" values="1 0 0 0 0 -0\.5 1 0 0 0 0 0 2 0 0\.2 0 0 0 1 0"\/>/);
    assert.deepEqual(compiled.warnings, []);
});

test('@svg-filter shares one element between identical filters', () => {
    let same = compile('filter: @svg-filter(.2, 5);', '4');
    assert.equal(Object.keys(same.filters).length, 1);
    let random = compile('filter: @svg-filter(@r(1), 5);', '4');
    assert.equal(Object.keys(random.filters).length, 16);
});

test('@svg-filter supports symmetric region expansion', () => {
    let compiled = compile('filter: @svg-filter(region: 20%; channels { b: 2b; });');
    let [filter] = Object.values(compiled.filters);
    assert.match(filter, /<filter id="filter-1" xmlns="[^"]+" x="-20%" y="-20%" width="140%" height="140%">/);
    assert.deepEqual(compiled.warnings, []);
});

test('@svg-filter mixed command groups preserve pipeline order', () => {
    let compiled = compile(`filter: @svg-filter(
        feGaussianBlur { stdDeviation: 2; }
        frequency: .03;
        scale: 20;
        channels { b: 2b; }
    );`);
    let [filter] = Object.values(compiled.filters);
    assert.match(filter, /<feGaussianBlur stdDeviation="2" result="cssd-input-1"\/><feTurbulence/);
    assert.match(filter, /<feDisplacementMap in="cssd-input-1" in2="cssd-noise-2" scale="20"\/><feColorMatrix/);
});

test('@svg-filter root commands work without an explicit primitive', () => {
    let compiled = compile('filter: @svg-filter(frequency: .1; scale: 20;);');
    let [filter] = Object.values(compiled.filters);
    assert.match(filter, /<feTurbulence type="fractalNoise" baseFrequency="\.1 \.1" seed="42" result="cssd-noise-1"\/>/);
    assert.match(filter, /<feDisplacementMap in="SourceGraphic" in2="cssd-noise-1" scale="20"\/>/);
});

test('@svg-filter positional shorthand preserves its legacy input graph', () => {
    let compiled = compile('filter: @svg-filter(.1, 20, 2, 7, 3, 4, 5);');
    let [filter] = Object.values(compiled.filters);
    assert.match(filter, /<feMorphology operator="dilate" radius="5"\/><feMorphology operator="erode" radius="4"\/><feGaussianBlur stdDeviation="3"\/>/);
    assert.match(filter, /<feTurbulence type="fractalNoise" baseFrequency="\.1 \.1" seed="7" numOctaves="2"\/><feDisplacementMap in="SourceGraphic" scale="20"\/>/);
    assert.ok(!filter.includes('cssd-input'), filter);
    assert.ok(!filter.includes('cssd-noise'), filter);
});

test('@svg-filter accepts name=value commands', () => {
    let compiled = compile('filter: @svg-filter(frequency=.1, scale=20);');
    let [filter] = Object.values(compiled.filters);
    assert.match(filter, /<feTurbulence type="fractalNoise" baseFrequency="\.1 \.1" seed="42"\/>/);
    assert.match(filter, /<feDisplacementMap in="SourceGraphic" scale="20"\/>/);
    assert.ok(!filter.includes('cssd-input'), filter);
    assert.ok(!filter.includes('cssd-noise'), filter);
});

test('@svg-filter accepts a lone named blur', () => {
    let compiled = compile('filter: @svg-filter(blur=5px);');
    let [filter] = Object.values(compiled.filters);
    assert.match(filter, /<filter id="filter-1" xmlns="[^"]+" x="-20%" y="-20%" width="140%" height="140%">/);
    assert.match(filter, /<feGaussianBlur stdDeviation="5px"\/>/);
});

test('@content takes each @svg as markup and keeps the text around them', () => {
    let content = code => compile(code).content['#c-1-1-1'];
    let svg = `<svg xmlns="http://www.w3.org/2000/svg">`;
    assert.equal(content('@content: @svg(circle { r: 1 }), @svg(svg {});'), `${svg}<circle r="1"/></svg>${svg}</svg>`);
    assert.equal(content('@content: @svg(svg {}) hi;'), `${svg}</svg> hi`);
});

test('@raw passes its text on as written', () => {
    let content = code => compile(code).content['#c-1-1-1'];
    assert.equal(content('@content: @raw(A, B);'), 'A, B');
    assert.equal(content('@content: @raw(<p>Note: hi; ok ( x ) { y }, a,b</p>);'), '<p>Note: hi; ok ( x ) { y }, a,b</p>');
    assert.equal(content('--x: hi; @content: @raw(<b>@i, $x</b>, @p(a, b));'), '<b>1, hi</b>, a');
    assert.equal(content('@content: @raw("A, B");'), 'A, B');
    assert.equal(css(':after { content: @raw(A, B) }'), "#c-1-1-1:after {content:'A, B';}");
});

test('@content under :doodle or :container fills no cell', () => {
    for (let code of [':doodle { @content: hi; }', ':container { @content: hi; }']) {
        assert.ok(!Object.values(compile(code, '2').content).includes('hi'), code);
    }
});

test('@svg-filter expands into the svg document itself', () => {
    let compiled = compile(`@content: @svg(
        viewBox: 0 0 10 10;
        rect { width: 10; height: 10; filter: @svg-filter(.03, 20, seed=@r1000); }
    );`);
    let content = compiled.content['#c-1-1-1'];
    // inside @svg the filter is inlined, and the reference reaches it
    assert.match(content, /<defs><filter x="-20%" y="-20%" width="140%" height="140%" id="filter-\d+">/);
    assert.match(content, /<feTurbulence type="fractalNoise" baseFrequency="\.03 \.03" seed="[\d.]+"\/>/);
    assert.match(content, /<feDisplacementMap in="SourceGraphic" scale="20"\/><\/filter><\/defs>/);
    assert.match(content, /filter="url\(#filter-\d+\)"/);
    // nothing is left for the shared holder
    assert.deepEqual(Object.keys(compiled.filters), []);
    assert.deepEqual(compiled.warnings, []);

    // a written-out filter block is inlined the same way
    compiled = compile(`@content: @svg(rect {
        width: 10; height: 10;
        filter: @svg-filter(
            feTurbulence { type: fractalNoise; baseFrequency: .05; seed: 3; }
            feDisplacementMap { in: SourceGraphic; scale: 30; }
        );
    });`);
    assert.match(compiled.content['#c-1-1-1'],
        /<defs><filter id="filter-\d+"><feTurbulence type="fractalNoise" baseFrequency="\.05" seed="3"\/><feDisplacementMap in="SourceGraphic" scale="30"\/><\/filter><\/defs>/);
    assert.deepEqual(Object.keys(compiled.filters), []);
});

test('@svg-filter travels inside the data url form of @svg', () => {
    // a filter in the shared holder is out of reach of a data url image
    let all = css('background: @svg(viewBox: 0 0 10 10; rect { width: 10; height: 10; filter: @svg-filter(.03, 20); });');
    let image = decodeURIComponent(all.match(/utf8,([^"]+)"/)[1]);
    assert.match(image, /<defs><filter [^>]*id="filter-\d+">/);
    assert.match(image, /filter="url\(#filter-\d+\)"/);
});

test('@arc continues a path: a ring segment in @svg, a moveto at the start of d and path()', () => {
    let all = css(`background: @svg(
        path { d: @arc(r: 50; from: 0; to: 120) L -15 26 @arc(r: 30; from: 120; to: 0) Z }
        path { d: @arc(r: 40) }
    );`);
    let image = decodeURIComponent(all.match(/utf8,([^"]+)"/)[1]);
    assert.ok(image.includes('d="M 50 0 A 50 50 0 0 1 -25 43.3012701892 L -15 26 L -15 25.9807621135 A 30 30 0 0 0 30 0 Z"'), image);
    assert.ok(image.includes('d="M 40 0 A 40 40 0 1 1 -40 0 A 40 40 0 1 1 40 0"'), image);
    assertContains(`clip-path: path('@arc(r: 40; move: 50 50) L 50 50 Z'); offset-path: path("@arc(r: 20)");`,
        `clip-path:path('M 90 50 A 40 40 0 1 1 10 50 A 40 40 0 1 1 90 50 L 50 50 Z');`,
        `offset-path:path("M 20 0 A 20 20 0 1 1 -20 0 A 20 20 0 1 1 20 0");`);
});

test('@match(test) in @svg reads the cell variables and the @n around it', () => {
    assert.equal(svgImage('--k: 2; background: @svg(@match(k == 2) { circle {} } @match(k == 3) { rect {} })'),
        '<svg><circle/></svg>');
    assert.equal(svgImage('background: @svg(circle*4 { @match(@n % 2) { r: @n } })'),
        '<svg><circle r="1"/><circle/><circle r="3"/><circle/></svg>');
    // a body that isn't drawn still takes its random values, so later ones stay put
    let x = test => svgImage(`background: @svg(@match(${test}) { circle { r: @r(9) } } rect { x: @r(9) })`).match(/x="[^"]+"/)[0];
    assert.equal(x(0), x(1));
    // as a value it is still the @match function
    assert.equal(svgImage('background: @svg(g { fill: @match(1 > 0, red, blue) })'), '<svg><g fill="red"/></svg>');
});

test('an @svg body is not split at its commas, so unquoted content keeps its spaces', () => {
    assert.equal(svgImage('background: @svg(text { content: one, two: three; } polyline { points: 0 0, 1 1 })'),
        '<svg><text>one, two: three</text><polyline points="0 0,1 1"/></svg>');
});

test('an @svg variable is set where it is written, once per copy inside *N', () => {
    // a read sees the latest value above it, the cell's before any
    assert.equal(svgImage('--k: 1; background: @svg(circle { r: $k } --k: 5; rect { x: $k } --k: 7; line { x1: $k })'),
        '<svg><circle r="1"/><rect x="5"/><line x1="7"/></svg>');
    // blocks don't scope it
    assert.equal(svgImage('background: @svg(g { --k: 3 } rect { x: $k })'), '<svg><g/><rect x="3"/></svg>');
    assert.equal(svgImage('background: @svg(circle*3 { --i: @n; r: $(i * 2) })'),
        '<svg><circle r="2"/><circle r="4"/><circle r="6"/></svg>');
    // a comma group keeps its other names
    assert.equal(svgImage('background: @svg(rect { --b, x: 3, 4; y: $b })'), '<svg><rect x="4" y="3"/></svg>');
    // one value goes to the whole group as drawn once, and as written
    assert.match(svgImage('background: @svg(rect { x, --b: @r(9); y: $b })'), /<rect x="([\d.]+)" y="\1"\/>/);
    assert.equal(svgImage('background: @svg(rect { --b, x: 1/2 })'), '<svg><rect x="1/2"/></svg>');
    // a declaration draws its random values once
    let x = code => svgImage(code).match(/<rect x="([^"]+)"/)[1];
    assert.equal(x('background: @svg(--p: @r(9); rect { x: @r(9) })'),
        x('background: @svg(g { x: @r(9) } rect { x: @r(9) })'));
});

test('an escaped quote in @svg survives a *N or a variable', () => {
    assert.equal(svgImage(String.raw`background: @svg(text*2 { content: "a\"b" })`), '<svg><text>a"b</text><text>a"b</text></svg>');
    assert.equal(svgImage(String.raw`background: @svg(--k: 1; text { content: 'it\'s' })`), "<svg><text>it's</text></svg>");
});

test('@-- without a name sets nothing', () => {
    assert.equal(cells('a: @--; b: @--();'), '#c-1-1-1 {a:;\nb:;}');
    assert.equal(cells('--k: 5; --d: @--(k);'), '#c-1-1-1 {--k:5;\n--d:;}');
});

test('@svg-filter does not repeat a `*n` block inside @svg()', () => {
    // a function argument carries no `*n`, the same as outside @svg: the
    // count is dropped and the source never carries an `@M` back into it
    let compiled = compile('@content: @svg(rect { width: 10; height: 10; filter: @svg-filter(feTurbulence*2 { baseFrequency: .1; }); });');
    assert.match(compiled.content['#c-1-1-1'],
        /<defs><filter id="filter-\d+"><feTurbulence baseFrequency="\.1"\/><\/filter><\/defs>/);
    assert.deepEqual(compiled.warnings, []);
});

test('@svg-filter keeps the integer part of octave', () => {
    let compiled = compile('filter: @svg-filter(frequency: .1; octave: @r(1, 8););');
    let [filter] = Object.values(compiled.filters);
    assert.match(filter, /numOctaves="\d+"/);
    assert.deepEqual(compiled.warnings, []);
});

test('@svg-filter channels expressions compose functions before expansion', () => {
    let compiled = compile('filter: @svg-filter(channels { b: @calc(1 + 1)b + @pick(.1, .2); });');
    let [filter] = Object.values(compiled.filters);
    assert.ok(filter.includes(
        'values="1 0 0 0 0 0 1 0 0 0 0 0 2 0 0.1 0 0 0 1 0"'
    ), filter);
});

test('@svg-filter channels warnings keep invalid rows at identity', () => {
    let compiled = compile(`filter: @svg-filter(channels {
        r: r * g;
        b: sin(b);
        opacity: .5;
    });`);
    let [filter] = Object.values(compiled.filters);
    assert.ok(filter.includes(
        'values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 1 0"'
    ), filter);
    assert.ok(filter.includes('opacity=".5"'), filter);
    assert.deepEqual(compiled.warnings.map(w => w.message), [
        'invalid channel r',
        'invalid channel b',
    ]);
});

test('@svg-filter keeps full feColorMatrix and raw SVG forms unchanged', () => {
    const values = '1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 1 0';
    let [full] = Object.values(compile(
        `filter: @svg-filter(feColorMatrix { type: matrix; values: ${values}; });`
    ).filters);
    assert.ok(full.includes(`<feColorMatrix type="matrix" values="${values}"/>`), full);

    let [raw] = Object.values(compile(
        'filter: @svg-filter(<filter><matrix g="g-.5r"/></filter>);'
    ).filters);
    assert.ok(raw.includes('<matrix g="g-.5r"/>'), raw);
});

test('@svg-filter no longer expands matrix blocks as color matrices', () => {
    let [filter] = Object.values(compile(
        'filter: @svg-filter(matrix { g: g - .5r; });'
    ).filters);
    assert.ok(filter.includes('<matrix g="g - .5r"/>'), filter);
    assert.ok(!filter.includes('<feColorMatrix'), filter);
});

test('warnings collect on the compiled result', () => {
    let compiled = compile('width: @pik(1, 2);');
    assert.equal(compiled.warnings.length, 1);
    assert.match(compiled.warnings[0].message, /unknown function @pik/);
    assert.equal(compiled.warnings[0].index, 7);
    // parse-level warnings ride along too
    compiled = compile('width: @p(1, 2;');
    assert.match(compiled.warnings[0].message, /unclosed \(/);
    // a plain @word without an argument list is not a typo signal
    compiled = compile('content: "hi @example";');
    assert.equal(compiled.warnings.length, 0);
});

test('composed arguments in conditional block heads unwrap to their value', () => {
    // @calc(10*10)px composes text with a function hole, which stays boxed
    // as { value } for applyFunc; composeCond used to print the box
    let all = css('@media (min-width: @calc(10*10)px) { color: red; }');
    assert.ok(all.includes('@media (min-width: 100px)'), all);
    assert.ok(!all.includes('[object'), all);
});

test('transition longhands flag hasTransition like animation longhands', () => {
    assert.ok(compile('transition-duration: 1s;').props.hasTransition);
});

test('@pattern bodies reach the pattern renderer whole', () => {
    let compiled = compile('background: @pattern(grid: 2; fill: @p(red, blue););');
    let [pattern] = Object.values(compiled.patterns);
    assert.equal(pattern.source, 'grid: 2; fill: @p(red, blue);');
});

test('@scene bodies evaluate their @ functions per cell, like @svg', () => {
    let { patterns } = compile('--k: 2; background: @scene(/* @r(9) */ fill: @p(#f00); box { size: @i * $k; rotate: π });', '2x1');
    assert.deepEqual(Object.values(patterns).map(p => p.source), [
        '/* @r(9) */ fill: #f00; box { size: 1 * 2; rotate: 3.141592653589793 }',
        '/* @r(9) */ fill: #f00; box { size: 2 * 2; rotate: 3.141592653589793 }',
    ]);
});

test('@scene copies holding @ functions repeat their body per copy, like @svg', () => {
    let { patterns } = compile('background: @scene(box { size: @i @nx @ny } sphere*2x2 { r: @nx @ny; move: n 0 0 } cone*2 { r: .1 });');
    assert.equal(Object.values(patterns)[0].source,
        'box { size: 1 1 1 } sphere*2x2 {{ r: 1 1; move: n 0 0 } { r: 2 1; move: n 0 0 } ' +
        '{ r: 1 2; move: n 0 0 } { r: 2 2; move: n 0 0 }} cone*2 { r: .1 }');
});

test('outside its copies a @scene picks, plots and samples noise per cell, like CSS', () => {
    let scenes = body => Object.values(compile(`background: @scene(${body});`, '1x4').patterns).map(p => p.source);
    let cssCells = value => [...css(`--v: ${value};`, '1x4').matchAll(/--v:([^;]+);/g)].map(m => `sphere { r: ${m[1]} }`);
    for (let value of ['@pn(.1, .2, .3)', '@pnr(.1, .2, .3)', '@pd(.1, .2, .3, .4)', '@R(1)', '@plot(r: .5)']) {
        assert.deepEqual(scenes(`sphere { r: ${value} }`), cssCells(value), value);
    }
    // copies still pick per copy
    assert.equal(scenes('sphere*2 { r: @pn(.1, .2, .3) }')[1], 'sphere*2 {{ r: .1 } { r: .2 }}');
});

test('@shape copies holding @ functions draw each copy with its own values', () => {
    let shape = body => css(`clip-path: @shape(intersect { ${body} });`);
    let lens = shape('circle { move: -.45 0 } circle { move: .45 0 }');
    assert.equal(shape('circle*2 { move: @pn(-.45 0, .45 0); }'), lens);
    assert.equal(shape('union*2 { circle { move: @pn(-.45 0, .45 0) } }'), lens);
    // commas inside the copy stay in it, and n still counts the copies
    assert.equal(shape('shape*2 { x: cos(t), .5cos(t); y: sin(t), .5sin(t); move: @pn(-.45, .45) 0 }'),
        shape('shape { x: cos(t), .5cos(t); y: sin(t), .5sin(t); move: -.45 0 } shape { x: cos(t), .5cos(t); y: sin(t), .5sin(t); move: .45 0 }'));
    assert.equal(shape('circle*2 { move: (.9n - 1.35) @p(0) }'), lens);
    // dotted names read shapes too
    let tile = body => css(`--t: @tile.voronoi(union { ${body} });`, '3x3');
    assert.equal(tile('circle*2 { scale: .5; move: @pn(-.5 0, .5 0) }'), tile('circle { scale: .5; move: -.5 0 } circle { scale: .5; move: .5 0 }'));
});

test('@use at the top level is inlined by the parser', () => {
    let extra = {
        getVariable: () => '@seed: 7; color: red; @keyframes k { to { color: blue } }',
    };
    let compiled = compile('@use: var(--r); animation: k 1s;', '1', 42, extra);
    assert.equal(compiled.seed, '7');
    assert.ok(compiled.styles.all.includes('color:red;'));
    assert.ok(compiled.styles.all.includes('@keyframes k {to {color:blue;}}'));
});

test('a seed attribute and @seed give the same cells', () => {
    // top-level vars draw during the pre-pass; the cells start over from
    // the seed either way, and @seed in the code wins over the attribute
    let code = '--x: @r(100); background: hsl(@r(360) 50% 50%);';
    assert.equal(css(code, '3', '12345'), css('@seed: 12345; ' + code, '3', 'other'));
    // a nested doodle continues its parent's stream instead of starting over
    let shared = createRandom('parent').random;
    let nested = () => generateCss(parseCss(code), parseGrid('1'), 'parent', 64, shared).styles.cells;
    assert.notEqual(nested(), nested());
});

test('@svg problems are reported once for the whole grid', () => {
    let compiled = compile('background: @svg(viewBox: 0 0 100; circle { animate r: 1; 5 });', '2');
    assert.deepEqual(compiled.warnings.map(w => w.message), [
        'invalid viewBox "0 0 100"',
        'r needs duration',
    ]);
    // the same source is memoized: a second compile still reports
    compiled = compile('background: @svg(viewBox: 0 0 100; circle { animate r: 1; 5 });', '1');
    assert.equal(compiled.warnings.length, 2);
    compiled = compile('filter: @svg-filter(g { draw: 1s });');
    assert.deepEqual(compiled.warnings.map(w => w.message), ['<g> lacks path']);
});

test('@svg g|op can be computed per cell, and draws along the joined outline', () => {
    let images = css('background: @svg(g|@pn(union, intersect) { draw: 1s; rect { width: 4; height: 4 } rect { x: 2; y: 2; width: 4; height: 4 } });', '2')
        .match(/utf8,[^"]+/g).map(decodeURIComponent);
    assert.ok(images.some(n => n.includes('d="M4 0L4 2L6 2L6 6L2 6L2 4L0 4L0 0Z"')));
    assert.ok(images.some(n => n.includes('d="M2 4L2 2L4 2L4 4Z"')));
    assert.ok(images.every(n => n.includes('stroke-dashoffset')));
});

test('generated ids are positional and carry the instance token', () => {
    let code = `
        background: @doodle(color: red);
        filter: @svg-filter(.2, 5);
        @nth(1) { background: @shaders(void main() {}) }
    `;
    let run = instance => generateCss(parseCss(code), parseGrid('2x1'), 7, 64, undefined, [], instance);
    let a = run(), b = run();
    assert.equal(a.styles.all, b.styles.all);
    // one counter for every kind, numbered in compose order
    assert.deepEqual(Object.keys(a.doodles), ['doodle-1', 'doodle-4']);
    assert.deepEqual(Object.keys(a.filters), ['filter-2']);
    assert.deepEqual(Object.keys(a.shaders), ['shader-3']);
    let c = run('k3j');
    assert.deepEqual(Object.keys(c.shaders), ['shader-k3j-3']);
    assert.ok(c.styles.all.includes('${doodle-k3j-1}'));
    assert.ok(c.styles.all.includes('url(#filter-k3j-2)'));
    assert.ok(c.filters['filter-k3j-2'].includes('id="filter-k3j-2"'));
});

test('composed image backgrounds default to cover after the shorthand', () => {
    let shader = '@shaders(void main() {})';
    const sheet = code => css(code).replace(/\$\{shader-\d+\}/g, 'S');
    for (let [code, expected] of [
        // the shorthand resets background-size, so the default must follow it
        [`background: ${shader};`, 'background:S;background-size:cover;'],
        [`background: ${shader}, linear-gradient(red, blue);`, 'background:S,linear-gradient(red,blue);background-size:cover,auto;'],
        [`background-image: ${shader};`, 'background-image:S;background-size:cover;'],
        // an explicit size wins, whether in the shorthand or declared before
        [`background: ${shader} center / 50% no-repeat;`, 'background:S center / 50% no-repeat;}'],
        [`background: ${shader}, url(a/b.png);`, 'background:S,url(a/b.png);background-size:cover,auto;'],
        // a size anywhere in the shorthand means the author owns every layer's size
        [`background: ${shader}, url(a/b.png) 0 0 / 20px 20px;`, 'background:S,url(a/b.png) 0 0 / 20px 20px;}'],
        [`background-size: 30%; background: ${shader};`, 'background-size:30%;\nbackground:S;}'],
        [`background: ${shader}; background-size: 30%;`, 'background:S;background-size:cover;\nbackground-size:30%;}'],
    ]) {
        assert.ok(sheet(code).includes(expected), `${code} => ${sheet(code)}`);
    }
});

// --- keyframes ---

test('static keyframes are emitted once and keep their name in every cell', () => {
    let all = css('@keyframes spin { to { rotate: 1turn } } animation: 1s spin;', '3');
    assert.equal((all.match(/@keyframes/g) || []).length, 1);
    // the name can sit anywhere in the shorthand; the same text in every
    // cell prints once for all of them
    assert.equal((all.match(/animation:1s spin;/g) || []).length, 1);
    assert.ok(all.includes(':is(cell,#_) {animation:1s spin;}'));
    assert.ok(!all.includes('1s-'));
});

test('keyframes with functions are copied per cell as name-count', () => {
    let all = css('@keyframes k { to { --v: @r(10) } } animation: k 1s;', '2');
    assert.deepEqual(all.match(/@keyframes [\w-]+/g), [
        '@keyframes k', '@keyframes k-2', '@keyframes k-3', '@keyframes k-4',
    ]);
    assert.ok(all.includes('#c-1-1-1 {animation:k 1s;}'));
    assert.ok(all.includes('#c-2-2-1 {animation:k-4 1s;}'));
});

test('a per-cell copy of keyframes prints only for a cell whose animation names it', () => {
    let all = css(':container { animation: a 1s; } @keyframes a { from { --x: $(1 + 1); } }', '2');
    assert.deepEqual(all.match(/@keyframes [\w-]+/g), ['@keyframes a']);
    let some = css('@nth(3) { animation: k 1s; } @keyframes k { to { --v: @r(10) } } --w: @r(10);', '2');
    let every = css('animation: k 1s; @keyframes k { to { --v: @r(10) } } --w: @r(10);', '2');
    assert.deepEqual(some.match(/@keyframes [\w-]+/g), ['@keyframes k', '@keyframes k-3']);
    let block = (all, name) => all.match(new RegExp(`@keyframes ${name} \\{[^}]+\\}`))[0];
    assert.equal(block(some, 'k-3'), block(every, 'k-3'));
    assert.deepEqual(some.match(/--w:[\d.]+/g), every.match(/--w:[\d.]+/g));
});

test('keyframes inside a conditional block are not duplicated by the nested compose', () => {
    let all = css('@even { animation: k 1s; @keyframes k { to { --v: @r(1) } } }', '2');
    let names = all.match(/@keyframes [\w-]+/g);
    assert.deepEqual(names, [...new Set(names)]);
});

test('a function writing whole keyframes steps adds no empty block', () => {
    assertContains('@keyframes a { @M2(@n(* 50)% { --x: @n; }) to { --x: 3; } }',
        '@keyframes a {50% { --x: 1; } 100% { --x: 2; } to {--x:3;}}');
    assertContains('@keyframes b { 50%; to { --x: 3; } }', '@keyframes b {50% {}\nto {--x:3;}}');
});

test('keyframes declared inside a pseudo are registered', () => {
    assertContains(':doodle { animation: k 1s; @keyframes k { to { opacity: 0 } } }',
        '@keyframes k {to {opacity:0;}}');
});

test('keyframes of static @shape values are emitted once', () => {
    let { all, container, cells } = compile(
        'animation: a 1s; @keyframes a { from { @shape: square; } to { @shape: heart; } }', '2x1'
    ).styles;
    assert.equal(container, '');
    assert.equal((all.match(/@keyframes/g) || []).length, 1);
    assert.match(all, /@keyframes a \{from \{clip-path:polygon\([^;]+\);\}\nto \{clip-path:polygon\([^;]+\);\}\}/);
    assert.equal(all.split('polygon(').length - 1, 2);
    assert.equal(cells, ':is(cell,#_) {animation:a 1s;}');
});

test('@place inside keyframes carries the cell size in the frame', () => {
    // used to throw: a keyframe step has no selector
    let all = css('@keyframes k { to { @place: 20% 30%; } } animation: k 1s;', '2');
    assert.match(all, /@keyframes k \{to \{position:absolute;left:20%;[^}]*width:var\(--_cell-width, 25%\);height:var\(--_cell-height, 25%\);\}\}/);
});

test('@place on the host writes nothing', () => {
    assert.doesNotMatch(css(':host { @place: center; color: red; }'), /@place/);
});

test('keyframes that only set custom properties are static and emitted once', () => {
    let all = css('@keyframes k { from { --a: 0 } to { --a: 1 } } animation: k 1s;', '2');
    assert.equal((all.match(/@keyframes/g) || []).length, 1);
    assert.ok(all.includes(':is(cell,#_) {animation:k 1s;}'));
});

// --- selectors and group rules ---

test('nested blocks in rule-only positions are ignored, not a crash', () => {
    // used to throw: composeRule received cond/pseudo nodes
    assert.doesNotThrow(() => compile(':after { content: "x"; & { c { color: red; } }'));
    assert.doesNotThrow(() => compile('@media (min-width: 100px) { :{ :after { content: "m"; } color: red; }'));
});

test('a cell selector takes a pseudo after it, and a list matches a cell once', () => {
    assert.equal(css('@nth(1)::after { content: "x" }', '2'), '#c-1-1-1::after {content:"x";}');
    assert.equal(css('@odd:hover { color: red }', '2'), '#c-1-1-1:hover,#c-2-2-1:hover {color:red;}');
    assert.equal(css('@at(1, 1), @at(2, 2)::before { color: red }', '2'), '#c-1-1-1 {color:red;}#c-2-2-1::before {color:red;}');
    assert.equal(css('@nth(1), @nth(1) { --v: @r(10) }', '2', 1), css('@nth(1) { --v: @r(10) }', '2', 1));
    assert.equal(css('@nth(1):hover { span { color: red } }', '2'), '#c-1-1-1:hover span {color:red;}');
});

test('selectors nest against the enclosing one', () => {
    // a leading pseudo compounds with the cell, & stands for it, and
    // anything else is a descendant
    assert.equal(css('&:hover { color: red }'), '#c-1-1-1:hover {color:red;}');
    assert.equal(css('& :hover { color: red }'), '#c-1-1-1 :hover {color:red;}');
    assert.equal(css('&.on, .dark & { color: red }'),
        '#c-1-1-1.on {color:red;}.dark #c-1-1-1 {color:red;}');
    assert.equal(css('.foo { color: red }'), '#c-1-1-1 .foo {color:red;}');
    assert.equal(css('[title="{"] { color: red }'), '#c-1-1-1 [title="{"] {color:red;}');
    assert.equal(css('@nth(1) { &:hover { :after { content: "x" } } }'),
        '#c-1-1-1:hover:after {content:"x";}');
    // the host is featureless, so pseudo-classes fold into :host(); only
    // a plain host form gets the export twin
    assert.equal(css(':doodle { &:hover { color: red } .a { color: blue } }'),
        ':host(:hover) {color:red;}:host .a,.host .a {color:blue;}');
    assert.equal(css(':doodle(.dark) { :hover { :after { color: red } } }'),
        ':host(.dark:hover):after {color:red;}');
    assert.equal(css(':doodle:hover::part(x) { color: red }'),
        ':host(:hover)::part(x) {color:red;}');
    assert.equal(css(':doodle { :not(:is(.a, .b)):focus { color: red } :before { color: blue } }'),
        ':host(:not(:is(.a, .b)):focus) {color:red;}:host:before,.host:before {color:blue;}');
    assert.equal(css(':host-context(.dark) { color: red }'), ':host-context(.dark) {color:red;}');
    assert.equal(css(':container { :hover { color: red } }'), 'grid:hover {color:red;}');
    assert.equal(css(':container(.x) .y { color: red }'), 'grid.x .y {color:red;}');
    // selector lists cross with the enclosing list
    assert.equal(css(':a, :b { :c, :d { color: red } }'),
        '#c-1-1-1:a:c {color:red;}#c-1-1-1:b:c {color:red;}#c-1-1-1:a:d {color:red;}#c-1-1-1:b:d {color:red;}');
});

test('every & in a selector resolves to the same cell', () => {
    assert.equal(css('& + & { color: red }'),
        '#c-1-1-1 + #c-1-1-1 {color:red;}');
    assert.equal(css('@nth(1) { & + & { color: red } }', '2x1x2'),
        '.c-1-1-1 + .c-1-1-1,.c-1-1-2 + .c-1-1-2 {color:red;}');
});

test('nested pseudo lists and & selectors compose per selector', () => {
    assertContains(':hover { :after, :before { color: red } & .foo { color: blue } }',
        '#c-1-1-1:hover:after {color:red;}',
        '#c-1-1-1:hover:before {color:red;}',
        '#c-1-1-1:hover .foo {color:blue;}');
});

test('blocks inside a pseudo keep the output balanced', () => {
    assert.equal(css(':hover { @nth(1) { color: red } } :after { content: "x" }'),
        '#c-1-1-1:hover {color:red;}#c-1-1-1:after {content:"x";}');
});

test('quoted commas and strings survive composition', () => {
    assertContains('content: "a, b"; --x: @p("a" "b");', 'content:"a, b";', '--x:"a" "b";');
});

test('group rules and selector functions nest anywhere', () => {
    assert.equal(css(':doodle { @media (min-width: 1px) { color: red } }'),
        '@media (min-width: 1px) {:host,.host {color:red;}}');
    assert.equal(css(':after { @container (width > 1px) { color: red } }'),
        '@container (width > 1px) {#c-1-1-1:after {color:red;}}');
    assert.equal(css(':hover { @nth(1) { color: red } @nth(2) { color: blue } }'),
        '#c-1-1-1:hover {color:red;}');
    assert.equal(css('@media (a) { @nth(1) { @supports (b) { &:hover { color: red } } } }'),
        '@media (a) {@supports (b) {#c-1-1-1:hover {color:red;}}}');
    // prelude text keeps its spacing: style( and selector( are function tokens
    assert.equal(css('@container style(--x: 1) { color: red }'),
        '@container style(--x: 1) {#c-1-1-1 {color:red;}}');
    assert.equal(css('@supports selector(:has(a)) and (not (x: y)) { color: red }'),
        '@supports selector(:has(a)) and (not (x: y)) {#c-1-1-1 {color:red;}}');
    // but and( / not( are function tokens to CSS, so the space is put back
    assert.equal(css('@media screen and(min-width: 800px) { color: red }'),
        '@media screen and (min-width: 800px) {#c-1-1-1 {color:red;}}');
    assert.equal(css('@supports not(display: grid) { color: red }'),
        '@supports not (display: grid) {#c-1-1-1 {color:red;}}');
    // @use inside a group stays in the group
    let extra = { getVariable: () => 'color: red;' };
    assert.equal(compile('@media (a) { @use: var(--r); }', '1', 42, extra).styles.all,
        '@media (a) {#c-1-1-1 {color:red;}}');
});

test('conditional group rules scope bare rules to the cell and come last', () => {
    let { all, top } = compile(`color: blue; @media (min-width: 1px) {
        color: red; :doodle { --a: 1 } :container { gap: 1px } :after { content: "m" }
        @nth(1) { width: 1px } @supports (x: y) { height: 2px }
    }`).styles;
    assert.equal(top, '');
    let at = all.indexOf('@media');
    assert.ok(at > all.indexOf('#c-1-1-1 {color:blue;}'));
    let group = all.slice(at);
    for (let expected of [
        '#c-1-1-1 {color:red;\nwidth:1px;}',
        ':host,.host {--a:1;}',
        'grid {gap:1px;}',
        '#c-1-1-1:after {content:"m";}',
        '@supports (x: y) {#c-1-1-1 {height:2px;}}',
    ]) {
        assert.ok(group.includes(expected), expected);
    }
});

test('host rules inside a group compose once', () => {
    let all = css('@media (a) { :doodle { color: red } color: blue }', '2');
    assert.equal(all.match(/:host,\.host \{color:red;\}/g).length, 1);
    assert.ok(all.endsWith('@media (a) {:host,.host {color:red;}:is(cell,#_) {color:blue;}}'), all);
});

test('host and container selectors in a mixed list compose once', () => {
    let all = css(':doodle, :hover { color: red; span { color: blue } }', '2');
    assert.equal(all, ':host,.host {color:red;}:host span,.host span {color:blue;}:is(cell,#_):hover {color:red;}:is(cell,#_):hover span {color:blue;}');
    assert.equal(css(':container, :doodle { color: red }', '2'), 'grid {color:red;}:host,.host {color:red;}');
});

test('declaration-body at-rules are emitted once verbatim at the top', () => {
    let { top, all, property } = compile(`
        @property --a { syntax: "<length>"; inherits: false; initial-value: 0px; }
        @function --double(--x) { result: calc(var(--x) * 2); @media (a) { result: 0; } }
        :doodle { @font-face { font-family: "X"; src: url(x.woff); } }
        width: --double(1px);
    `, '2').styles;
    assert.deepEqual(property, ['@property --a { syntax: "<length>"; inherits: false; initial-value: 0px; }']);
    assert.deepEqual(compile('color: red').styles.property, []);
    assert.equal(top,
        '@property --a { syntax: "<length>"; inherits: false; initial-value: 0px; }\n' +
        '@function --double(--x) { result: calc(var(--x) * 2); @media (a) { result: 0; } }\n' +
        '@font-face { font-family: "X"; src: url(x.woff); }');
    assert.ok(!all.includes('@property') && !all.includes('@font-face'));
    assert.ok(all.includes(':is(cell,#_) {width:--double(1px);'));
});

test('@ blocks that are neither selectors nor groups pass through as written', () => {
    // a selector function with a modifier it does not have warns
    let compiled = compile('@cell.random { color: red }', '2');
    assert.ok(compiled.warnings.some(w => w.message === 'unknown selector @cell.random'));
    assert.equal(compiled.styles.top, '@cell.random { color: red }');
    assert.equal(compiled.styles.all, '');
    // anything else is CSS for the browser to judge, once
    compiled = compile('@foo bar { color: red } @media (a) { color: red }', '2');
    assert.equal(compiled.warnings.length, 0);
    assert.equal(compiled.styles.top, '@foo bar { color: red }');
});

// --- cell sheet layout ---
//
// A declaration with the same text in every cell prints once for all
// cells as `:is(cell,#_)`, one with a few distinct texts prints once per
// text with its cells listed, the rest keep their per-cell blocks; the
// shared rules move before or after the per-cell blocks as far as the
// cascade allows.

test('a single cell keeps its plain block', () => {
    assert.equal(cells('background: red; color: blue;'), '#c-1-1-1 {background:red;\ncolor:blue;}');
});

test('the same text in every cell prints once for all cells', () => {
    let gradient = 'linear-gradient(45deg,#ff0000 0%,#00ff00 10%,#0000ff 20%,#ffff00 30%)';
    assert.equal(
        cells(`background: ${gradient}; --g: ${gradient}; border-radius: 50%;`, '3x3'),
        `:is(cell,#_) {background:${gradient};\n--g:${gradient};\nborder-radius:50%;}`
    );
    assert.equal(cells('&:hover { color: red }', '2x2'), ':is(cell,#_):hover {color:red;}');
    assert.equal(cells('width: 1px', '2x1'), ':is(cell,#_) {width:1px;}');
});

test('a static @shape polygon prints once per selector', () => {
    let all = cells('@shape: square; :after { content: ""; @shape: heart; }', '2x1');
    assert.equal(all.split('polygon(').length - 1, 2);
    assert.match(all, /^:is\(cell,#_\) \{clip-path:polygon\([^;]+\);\}:is\(cell,#_\):after \{content:"";\nclip-path:polygon\([^;]+\);\}$/);
});

test('a few distinct texts print once each with their cells listed', () => {
    assert.equal(cells('@even { background: blue; }', '2x2'), '#c-2-1-1,#c-1-2-1 {background:blue;}');
    assert.equal(cells('color: @match(x > 1, red, blue);', '4x1'),
        '#c-1-1-1 {color:blue;}#c-2-1-1,#c-3-1-1,#c-4-1-1 {color:red;}');
    assert.equal(cells('@match(x > 2) { color: red; }', '4x1'),
        '#c-3-1-1,#c-4-1-1 {color:red;}');
});

test('@match evaluates only the value it returns', () => {
    assert.equal(cells('--v: @match(x % 2, @pn(a, b, c), x);', '6x1'),
        '#c-1-1-1 {--v:a;}#c-2-1-1 {--v:x;}#c-3-1-1 {--v:b;}#c-4-1-1 {--v:x;}#c-5-1-1 {--v:c;}#c-6-1-1 {--v:x;}');
    assert.equal(cells('--v: @match(1, @m2(x), y); --w: [@match(1, , y)];'), '#c-1-1-1 {--v:x,x;\n--w:[];}');
    assert.equal(cells('--v: @m4(@match(@n % 2, a@n, b@n));'), '#c-1-1-1 {--v:a1,b2,a3,b4;}');
});

test('@match() and @pick(k: …) read custom properties, under the cell names', () => {
    assert.equal(svgImage('background: @svg(circle*3 { --c: 2; display: @match(@n > c, none, inline) })'),
        '<svg><circle display="inline"/><circle display="inline"/><circle display="none"/></svg>');
    assert.equal(cells('--k: 3; --v: @m3(@match(n < k - 1, a, b)); --w: @pick(k: a, b, c);'), '#c-1-1-1 {--k:3;\n--v:a,b,b;\n--w:c;}');
    assert.equal(cells('--x: 5; color: @match(x > 1, red, blue);', '2x1'), ':is(cell,#_) {--x:5;}#c-1-1-1 {color:blue;}#c-2-1-1 {color:red;}');
    // so do the selectors that take an expression
    assert.equal(cells('--k: 2; @match(k * x == 4) { color: red }', '3x1'), ':is(cell,#_) {--k:2;}#c-2-1-1 {color:red;}');
    assert.equal(cells('--k: 2; @cell(x > k) { color: red }', '3x1'), ':is(cell,#_) {--k:2;}#c-3-1-1 {color:red;}');
    assert.equal(cells('--n: 3; @random(n) { color: red }', '3x1'), ':is(cell,#_) {--n:3;\ncolor:red;}');
});

test('per-cell texts keep their blocks in cell order', () => {
    assert.equal(cells('--i: @i; color: red;', '2x2'),
        ':is(cell,#_) {color:red;}'
        + '#c-1-1-1 {--i:1;}#c-2-1-1 {--i:2;}#c-1-2-1 {--i:3;}#c-2-2-1 {--i:4;}');
    // two texts over three cells are per cell: the listing saves nothing
    assert.equal(cells('color: @match(x > 1, red, blue);', '3x1'),
        '#c-1-1-1 {color:blue;}#c-2-1-1 {color:red;}#c-3-1-1 {color:red;}');
});

test('shared rules keep the cascade order of their property family', () => {
    // the shared value comes later in the source, so it prints after
    assert.equal(cells('background: rgb(@i,0,0); background: red;', '2x1'),
        '#c-1-1-1 {background:rgb(1,0,0);}#c-2-1-1 {background:rgb(2,0,0);}'
        + ':is(cell,#_) {background:red;}');
    // in any case
    assert.equal(cells('background: rgb(@i,0,0); BACKGROUND: red;', '2x1'),
        '#c-1-1-1 {background:rgb(1,0,0);}#c-2-1-1 {background:rgb(2,0,0);}'
        + ':is(cell,#_) {BACKGROUND:red;}');
    // a longhand of the same family counts, and so does a listed rule
    assert.equal(cells('background: rgb(@i,0,0); background-color: red;', '2x1'),
        '#c-1-1-1 {background:rgb(1,0,0);}#c-2-1-1 {background:rgb(2,0,0);}'
        + ':is(cell,#_) {background-color:red;}');
    assert.equal(cells('background: rgb(@i,0,0); @even { background: red; }', '4x1'),
        '#c-1-1-1 {background:rgb(1,0,0);}#c-2-1-1 {background:rgb(2,0,0);}'
        + '#c-3-1-1 {background:rgb(3,0,0);}#c-4-1-1 {background:rgb(4,0,0);}'
        + '#c-2-1-1,#c-4-1-1 {background:red;}');
    // per-cell rules on both sides: the shared value joins the blocks
    assert.equal(cells('background: rgb(@i,0,0); background: red; background: rgb(0,@i,0);', '2x1'),
        '#c-1-1-1 {background:rgb(1,0,0);\nbackground:red;\nbackground:rgb(0,1,0);}'
        + '#c-2-1-1 {background:rgb(2,0,0);\nbackground:red;\nbackground:rgb(0,2,0);}');
    // another family passes by
    assert.equal(cells('--i: @i; background: red; --j: @i;', '2x1'),
        ':is(cell,#_) {background:red;}#c-1-1-1 {--i:1;\n--j:1;}#c-2-1-1 {--i:2;\n--j:2;}');
    // shorthands that do not share a name: `inset` covers `top`
    assert.equal(cells('top: @i px; inset: 0;', '2x1'),
        '#c-1-1-1 {top:1 px;}#c-2-1-1 {top:2 px;}:is(cell,#_) {inset:0;}');
    assert.equal(cells('top: @i px; all: unset;', '2x1'),
        '#c-1-1-1 {top:1 px;}#c-2-1-1 {top:2 px;}:is(cell,#_) {all:unset;}');
    // a shared rule cannot pass another shared rule of its family
    assert.match(cells('width: @i px; @size: 10px; height: 20px;', '2x1'), /height:10px;[^]*height:20px;/);
    assert.match(cells('top: @i px; @place: center; position: relative;', '2x1'), /absolute;[^]*position:relative;/);
});

test('a declaration inside a conditional block keeps its source order', () => {
    // the block is first seen in the second cell: still before the color
    assert.equal(cells('@even { color: blue; } color: rgb(@i,0,0);', '4x1'),
        '#c-2-1-1,#c-4-1-1 {color:blue;}'
        + '#c-1-1-1 {color:rgb(1,0,0);}#c-2-1-1 {color:rgb(2,0,0);}'
        + '#c-3-1-1 {color:rgb(3,0,0);}#c-4-1-1 {color:rgb(4,0,0);}');
});

test('rules inside a group at-rule print once under its prelude, laid out like the top level', () => {
    assert.equal(cells('@media (x) { color: red; }', '2x1'),
        '@media (x) {:is(cell,#_) {color:red;}}');
    assert.equal(cells('@media (x) { color: @pn(red, blue); }', '2x1'),
        '@media (x) {#c-1-1-1 {color:red;}#c-2-1-1 {color:blue;}}');
    // the same prelude written twice is one block, rules in source order
    assert.equal(cells('@media (x) { color: red; } @media (x) { @nth(1) { width: 1px; } }', '2x1'),
        '@media (x) {:is(cell,#_) {color:red;}#c-1-1-1 {width:1px;}}');
    // a prelude composed per cell keeps a block of its own
    assert.equal(cells('@media (min-width: @calc(@i * 10)px) { color: red; }', '2x1'),
        '@media (min-width: 10px) {#c-1-1-1 {color:red;}}\n@media (min-width: 20px) {#c-2-1-1 {color:red;}}');
    // nested groups follow the cell rules of their scope
    assert.equal(cells('@media (x) { color: red; @supports (y) { color: blue; } }', '2x1'),
        '@media (x) {:is(cell,#_) {color:red;}@supports (y) {:is(cell,#_) {color:blue;}}}');
});

test('a bare circle is the native ellipse, any command keeps the polygon', () => {
    assert.equal(cells('@shape: circle;', '2x1'), ':is(cell,#_) {clip-path:ellipse(50% 50%);}');
    assert.equal(cells('clip-path: @shape(circle);', '2x1'), ':is(cell,#_) {clip-path:ellipse(50% 50%);}');
    assert.match(cells('clip-path: @shape(circle; frame: .05);', '2x1'), /^:is\(cell,#_\) \{clip-path:polygon\(/);
});

test('per-cell and host values stay inline', () => {
    let { all, container } = compile(`
        --long: linear-gradient(@r(360)deg,#ff0000 0%,#00ff00 10%,#0000ff 20%,#ffff00 30%,#ff00ff 40%,#00ffff 50%,#000000 60%,#ffffff 70%,#808080 80%);
        @shape: @pn(square, heart);
        :doodle { @shape: square; }
    `, '2x1').styles;
    assert.equal(container, '');
    assert.ok(all.includes('#c-1-1-1 {--long:linear-gradient('));
    assert.ok(all.includes(':host,.host {clip-path:polygon('));
    assert.equal(all.split('clip-path:polygon(').length - 1, 3);
});

test('logical sizes cascade against the physical ones they alias', () => {
    assert.equal(cells('width: $(@i * 10)px; inline-size: 30px;', '2x1'),
        '#c-1-1-1 {width:10px;}#c-2-1-1 {width:20px;}:is(cell,#_) {inline-size:30px;}');
    assert.equal(cells('height: $(@i * 10)px; block-size: 30px;', '2x1'),
        '#c-1-1-1 {height:10px;}#c-2-1-1 {height:20px;}:is(cell,#_) {block-size:30px;}');
});

// --- output channels ---

test('a group at-rule prints once per scope, so an identical nested one stays', () => {
    let out = cells('@media (a) { color: red; } @media (b) { @media (a) { color: red; } }');
    assert.ok(out.includes('@media (a) {#c-1-1-1 {color:red;}}'));
    assert.ok(out.includes('@media (b) {@media (a) {#c-1-1-1 {color:red;}}}'));
    assert.equal(out.split('@media (a)').length - 1, 2);
});

test('google font names collect once each', () => {
    let { gf } = compile('font-family: @google-font(Lato); :after { font-family: @google-font(Lato) }', '2').styles;
    assert.deepEqual(gf, ['Lato']);
    assert.deepEqual(compile('color: red').styles.gf, []);
    // the name comes back quoted, a valid family whatever its words
    assert.equal(cells('font-family: @google-font(Press Start 2P), serif;'), '#c-1-1-1 {font-family:"Press Start 2P",serif;}');
    let roboto = compile("font-family: @google-font('Roboto:400,700');").styles;
    assert.deepEqual([roboto.cells, roboto.gf], ['#c-1-1-1 {font-family:"Roboto";}', ['Roboto:400,700']]);
});

test('shaders and patterns are records of the same shape', () => {
    let { shaders, patterns } = compile('background: @shaders(void main() {}); :after { background: @pattern(grid: 2; fill: red;) }');
    assert.deepEqual(Object.values(shaders), [{
        source: 'void main() {}',
        target: { selector: 'c-1-1-1', pseudo: undefined, type: 'background' },
        arg: undefined, id: '--shader-1', cell: 'c-1-1-1',
    }]);
    let [pattern] = Object.values(patterns);
    assert.equal(pattern.source, 'grid: 2; fill: red;');
    assert.deepEqual(pattern.target, { selector: 'c-1-1-1', pseudo: 'after', type: 'background' });
    // a state of the host or grid is measured on the host or grid, a pseudo-element on itself
    let target = code => Object.values(compile(code, '2').patterns)[0].target;
    assert.deepEqual(target(':doodle::after { background: @pattern(fill: red) }'), { selector: ':host', pseudo: 'after', type: 'background' });
    assert.equal(target(':doodle(:hover) { background: @pattern(fill: red) }').selector, ':host');
    assert.deepEqual(target(':container::before { background: @pattern(fill: red) }'), { selector: ':container', pseudo: 'before', type: 'background' });
    assert.equal(target(':hover::after { background: @pattern(fill: red) }').pseudo, 'after');
});

test('@udx/@udy bind pointer and size uniforms together', () => {
    let { uniforms, styles } = compile('--d: hypot(@udx, @udy);', '8');
    assert.equal(uniforms.mousex, true);
    assert.equal(uniforms.mousey, true);
    assert.equal(uniforms.width, true);
    assert.equal(uniforms.height, true);
    assert.ok(styles.cells.includes('var(--cssd-uwidth)'), styles.cells);
    assert.ok(styles.cells.includes('var(--cssd-umousex)'), styles.cells);
    assert.ok(styles.cells.includes('var(--cssd-uheight)'), styles.cells);
    assert.ok(styles.cells.includes('var(--cssd-umousey)'), styles.cells);
});

test('$name in a shaders body reads the variable at generation time', () => {
    let { shaders, warnings } = compile(`
        --texture: @doodle(@grid: 8; background: @p(red, blue););
        --fragment: @raw(void main() { FragColor = vec4(1.); });
        --speed: 2;
        @content: @shaders(
            fragment { $fragment }
            // a comment is not read: $nope
            vertex { void main() { gl_Position = vec4($speed); } }
            texture0 { $texture }
            texture1 { @grid: 2; --d: $speed; background: red; }
        );
    `);
    let [shader] = Object.values(shaders);
    let source = parseShaders(shader.source);
    assert.equal(source.fragment.replace(/\s/g, ''), 'voidmain(){FragColor=vec4(1.);}');
    assert.equal(source.vertex, 'void main(){gl_Position = vec4(2);}');
    // a bound doodle comes as stored; any other texture sees the variables
    // like @doodle() does, and $name is read there like anywhere else
    assert.equal(source.textures[0].value, '@grid:8;background:@p(red,blue);');
    assert.match(source.textures[1].value.replace(/\s/g, ''), /^:doodle\{--texture:.*--speed:2;\}@grid:2;--d:2;background:red;$/);
    assert.deepEqual(warnings, []);
});

test('texture doodles see the variables, and their own declarations win', () => {
    let { shaders, patterns } = compile(`
        --c: red;
        background: @shaders(fragment { void main() {} } texture0 { --d: blue; background: @p(--c); });
        @content: @pattern(texture_0 { background: @p(--c); } fill: texture(texture_0, uv));
    `);
    let [shader] = Object.values(shaders);
    assert.equal(parseShaders(shader.source).textures[0].value, ':doodle{--c:red;}--d:blue;background:@p(--c);');
    let [pattern] = Object.values(patterns);
    assert.equal(pattern.source.replace(/\s+/g, ' ').trim(),
        'texture_0 {:doodle {--c: red;} background: @p(--c); } fill: texture(texture_0, uv)');
});

test('a texture reads its own variables with $name', () => {
    let { patterns, warnings } = compile('@content: @pattern(texture_0 { --a: red; background: $a; } fill: texture(texture_0, uv));');
    assert.deepEqual(warnings, []);
    assert.match(Object.values(patterns)[0].source, /--a: red; background: \$a;/);
});

test('an unknown $name skips the shader with a warning instead of reaching GLSL', () => {
    for (let body of ['fragment { $missing }', 'fragment { void main() {} } texture0 { $missing }']) {
        let { shaders, warnings, styles } = compile(`background: @shaders(${body})`);
        assert.deepEqual(Object.keys(shaders), []);
        assert.equal(styles.all.includes('$missing'), false);
        assert.deepEqual(warnings.map(w => w.message), ['unknown variable $missing']);
    }
    // a body that reads nothing is stored as written
    let [plain] = Object.values(compile('background: @shaders(fragment { void main() {} } texture0 { @grid: 2 })').shaders);
    assert.equal(plain.source, 'fragment { void main() {} } texture0 { @grid: 2 }');
});

test('$name in a pattern body reads the cell variable, texture blocks included', () => {
    let { patterns, warnings } = compile(`
        --k: @i;
        --n: 3;
        --ring-count: 2;
        @content: @pattern(
            texture_0 { :doodle { width: $k; } }
            // $nope is not read
            repeat($n as j) { a: j; }
            fill: $k / 4, ($n-1) / 4, $ring-count / 4;
        );
    `, '2');
    assert.deepEqual(warnings, []);
    let sources = Object.values(patterns).map(p => p.source.replace(/\s+/g, ' ').trim());
    assert.deepEqual(sources, [1, 2, 3, 4].map(k =>
        `texture_0 {:doodle {--k: ${k};--n: 3;--ring-count: 2;} :doodle { width: ${k}; } } // $nope is not read repeat(3 as j) { a: j; } fill: ${k} / 4, (3-1) / 4, 2 / 4;`));
    // a texture block whose whole body is $name draws the stored doodle, as in @shaders
    let bound = compile('--t: @doodle(@grid: 2; background: red;); background: @pattern(texture_0 { $t } fill: texture(texture_0, uv))');
    assert.equal(Object.values(bound.patterns)[0].source, 'texture_0 { @grid: 2; background: red; } fill: texture(texture_0, uv)');
    for (let [code, name] of [['fill: $nope, 0, 0', 'nope'], ['fill: $ring-count', 'ring-count']]) {
        let missing = compile(`background: @pattern(${code})`);
        assert.deepEqual(Object.keys(missing.patterns), []);
        assert.deepEqual(missing.warnings.map(w => w.message), [`unknown variable $${name}`]);
    }
});

test('random() in expressions follows the seed on a stream of its own', () => {
    let code = '--a: $(random()); --b: @calc(random() * 10); --c: @random();';
    assert.equal(cells(code, '3', 7), cells(code, '3', 7));
    assert.notEqual(cells(code, '3', 7), cells(code, '3', 8));
    // @r draws the same values with or without random() next to it
    let r = sheet => sheet.match(/--r:[\d.]+/g).join();
    assert.equal(r(cells('--r: @r(10);', '3')), r(cells('--a: $(random()); --r: @r(10);', '3')));
});

test('random() in a scatter density leaves the doodle stream alone, so a second render matches the first', () => {
    let code = 'clip-path: @tile.voronoi(density: random() + y); --v: $(random());';
    assert.equal(cells(code, '3', 7), cells(code, '3', 7));
});

test('a lone $(name) evaluates its value once', () => {
    // one random() draw per read, the same as any other expression of it
    let read = code => cells(code, '3', 7).match(/width:[\d.]+/g).join();
    assert.equal(read('--a: random(); width: $(a);'), read('--a: random(); width: $(a * 1);'));
});

test('$() reads the cell variables under the custom properties', () => {
    let values = name => [...cells(`--a: $(x * 10 + y); --b: $(i + I); --c: $x;`, '2x2').matchAll(new RegExp(`${name}:([^;]+);`, 'g'))].map(m => m[1]);
    assert.deepEqual(values('--a'), ['11', '21', '12', '22']);
    assert.deepEqual(values('--b'), ['5', '6', '7', '8']);
    assert.deepEqual(values('--c'), ['1', '2']);
    assert.ok(cells(`--x: 7; --a: $(x);`, '2x1').includes('--a:7;'));
    assert.ok(svgImage(`background: @svg(viewBox: 0 0 9 9; --dx: 3; circle { cx: $(dx); cy: $(y) });`).includes('cx="3" cy="1"'));
    assert.ok(css(`:doodle { --w: $(X * 10); }`).includes('--w:10;'));
    let labels = cells(`--sub: @pn(y, z, x + 1); --a: $sub; --b: $(sub);`, '3x1');
    assert.ok(labels.includes('--a:y;\n--b:y;') && labels.includes('--a:x + 1;\n--b:x + 1;'), labels);
});

test('@svg-polygon inside @m reads the sequence @n', () => {
    let all = decodeURIComponent(css('background: @m(2, @svg-polygon(split: @n(+2)))'));
    assert.ok(all.includes('points="1 0,-0.5 -0.866025403784,-0.5 0.866025403784"'));
    assert.ok(all.includes('points="1 0,0 -1,-1 0,0 1"'));
});

test('@m writes contour lists with arithmetic in rotate and points', () => {
    assert.equal(
        css('clip-path: @shape(r: @m2(@n / 2); points: @m2(@n * 4); rotate: @m2(@n * 15))'),
        css('clip-path: @shape(r: .5, 1; points: 4, 8; rotate: 15, 30)'));
});

test('a shape body kept in a variable is reused with $name', () => {
    let body = '--gear: (points: 4n; r: 1, .5; fill-rule: evenodd);';
    assert.equal(css(body + ' clip-path: @shape($gear; n: 2);'), css(body + ' clip-path: @shape(points: 8; r: 1, .5; fill-rule: evenodd);'));
    // once on :doodle, read by every cell, in any shape reader
    let host = ':doodle { --ring: (points: 8; r: 1, .5); }';
    assert.equal(css(host + ' clip-path: @shape($ring);'), css(host + ' clip-path: @shape(points: 8; r: 1, .5);'));
    assert.match(decodeURIComponent(css(host + ' background: @svg-polygon($ring);')), /<path [^>]*d="M1 0L/);
});

test('a shape body kept in a variable joins a group with $name', () => {
    let body = '--hole: (circle; scale: .5);';
    assert.equal(css(body + ' clip-path: @shape(subtract { square; $hole });'), css(body + ' clip-path: @shape(subtract { square; circle { scale: .5 } });'));
    // a whole group kept in a custom property, braces and all
    let group = '--cut: (subtract { circle; circle { scale: .3 } });';
    assert.equal(css(group + ' clip-path: @shape($cut);'), css(group + ' clip-path: @shape(subtract { circle; circle { scale: .3 } });'));
    // @plot spreads the cells over the joined outline
    let places = [...cells('@place: @plot(union { circle { scale: .5; move: -.4 0 } circle { scale: .5; move: .4 0 } });', '1x6').matchAll(/left:([\d.]+)%;[^}]*top:([\d.]+)%/g)];
    assert.equal(new Set(places.map(m => m[1] + ' ' + m[2])).size, 6);
});

test('@svg-polygon draws contours as subpaths of one path', () => {
    let all = decodeURIComponent(css('background: @svg-polygon(points: 4, 3; r: 1, .5)'));
    assert.ok(all.includes('d="M1 0L0 -1L-1 0L0 1ZM0.5 0L-0.25 -0.433012701892L-0.25 0.433012701892Z"'), all);
    // the fill rule is an attribute, not a point
    assert.match(decodeURIComponent(css('background: @svg-polygon(points: 4; fill-rule: evenodd)')), /fill-rule="evenodd"[^>]* points="1 0,0 -1,-1 0,0 1"/);
});

test('@palette: the same colors in every cell, and the @r stream stays untouched', () => {
    let values = (sheet, name) => [...sheet.matchAll(new RegExp(`${name}:([^;]+);`, 'g'))].map(m => m[1]);
    let plain = cells('--r: @r(1000);', '3x3', 7);
    let mixed = cells('--c: @palette(4); --r: @r(1000);', '3x3', 7);
    assert.deepEqual(values(mixed, '--r'), values(plain, '--r'));
    assert.equal(new Set(values(mixed, '--c')).size, 1);
});

// --- @seed ---

test('@seed takes a computed value: functions draw from the incoming stream, $name reads literal vars', () => {
    assert.equal(compile('@seed: hello world;').seed, 'hello world');
    assert.equal(compile('@seed: $k; --k: 7;').seed, '7');
    assert.equal(compile(':doodle { --k: 7 } @seed: $k;').seed, '7');
    let shared = createRandom('parent').random;
    let nested = () => generateCss(parseCss('@seed: @r(1e6);'), parseGrid('1'), 'parent', 64, shared).seed;
    let a = nested(), b = nested();
    assert.notEqual(a, b);
    assert.equal(a, generateCss(parseCss('@seed: @r(1e6);'), parseGrid('1'), 'parent', 64, createRandom('parent').random).seed);
});

test('@shape names shapes with #id, and their copies still run @ functions per copy', () => {
    let named = css('clip-path: @shape(circle#hole*2 { scale: .2; move: @pn(-2 0, 2 0) } subtract { circle; #hole });');
    let inline = css('clip-path: @shape(subtract { circle; circle*2 { scale: .2; move: @pn(-2 0, 2 0) } });');
    assert.equal(named, inline);
    assert.notEqual(named, css('clip-path: @shape(subtract { circle; circle { scale: .2; move: -2 0 } });'));
});

test('@grid * takes a bare angle in degrees, also after an axis', () => {
    assertContains('@grid: 1 *45;', 'rotate:45deg;');
    assertContains('@grid: 1 *x 45 ∆200px;', 'rotate:x 45deg;', 'perspective:200px;');
    assertContains('@grid: 1 *y .5turn;', 'rotate:y .5turn;');
    assertContains('@grid: 1 *1 1 0 30;', 'rotate:1 1 0 30deg;');
});

test('@grid p3d keeps 3D on the container only', () => {
    assert.equal(css('@grid: 1 p3d;'), 'grid {transform-style:preserve-3d;}');
});

test('@shape: none clips nothing and warns nothing', () => {
    let { styles, warnings } = compile('@grid: 2x1; @shape: @pn(none, star);');
    assert.ok(!styles.cells.includes('#c-1-1-1 {clip-path'), styles.cells);
    assert.ok(styles.cells.includes('#c-2-1-1 {clip-path:polygon('), styles.cells);
    assert.deepEqual(warnings.map(w => w.message), []);
    assert.deepEqual(compile('@grid: 1; @shape: nope;').warnings.map(w => w.message), ['unknown shape nope']);
});

test('an arithmetic sequence count is not read as a range', () => {
    assertContains('@grid: 1; --l: @m(2+3-1, x);', '--l:x,x,x,x;');
    assertContains('@grid: 1; --l: @m(3-1, x);', '--l:x,x,x;');
});

test('@calc ignores extra arguments instead of reading them as its context', () => {
    assertContains('@grid: 1; --v: @calc(1+1, 2);', '--v:2;');
});

test('a skipped call argument takes its default and later ones keep their place', () => {
    assertContains('@grid: 1; --f(a = 1, b = 2): $(a - b); --v: $f(, 9);', '--v:-8;');
});

test('a user function argument that would change with each use is worked out once', () => {
    let numbers = (code, grid) => cells(code, grid).match(/-?\d+\.\d+/g).map(Number);
    let [x0, x1] = numbers('--f(bx, w): M $(bx - w) 0 L $(bx + w) 0; --d: $f(@r(100), 1);');
    assert.ok(Math.abs(x1 - x0 - 2) < 1e-9, `${x0} ${x1}`);
    let square = cells('--sq(s): { width: $s; height: $s } $sq(@r(9)px);');
    let [w, h] = square.match(/-?\d+\.\d+/g).map(Number);
    assert.equal(w, h);
    assert.ok(!square.includes('--1sq_s'), square);
    let pairs = cells('--f(c): [$c|$c]; --d: @M(3, $f(@r(9)));').match(/\[[^\]]+\]/g);
    assert.ok(pairs.every(p => p.split('|')[0].slice(1) === p.split('|')[1].slice(0, -1)), pairs);
    assert.equal(new Set(pairs).size, 3);
    assertContains('--turn(k): @M(2, L $(k) $(@n)); --d: @M(3, [$turn(@n)]);', '--d:[L 1 1 L 1 2] [L 2 1 L 2 2] [L 3 1 L 3 2];');
    assertContains('--turn(k): @M(2, $k); background: @svg(viewBox: 0 0 1 1; path*2 { d: $turn(@n) });', 'd=%221 1%22', 'd=%222 2%22');
    assert.equal(cells('--f(a): [$a] @r(9); width: $f(@r(9));', '2'), cells('width: [@r(9)] @r(9);', '2'));
});

test('user functions that double on every call stop at an expansion limit', () => {
    let defs = '--a0(x): x x;';
    for (let i = 1; i < 30; i++) defs += ` --a${i}(x): $a${i - 1}(x) $a${i - 1}(x);`;
    let { warnings } = compile(`${defs} @grid: 1; --v: $a29(1);`);
    assert.ok(warnings.some(w => /too large/.test(w.message)), JSON.stringify(warnings));
});

test('a texture section does not inherit a variable holding GLSL statements', () => {
    let { shaders, warnings } = compile(`
        --fragment: @raw(void main() { FragColor = vec4(1.); });
        @content: @shaders(fragment { $fragment } texture0 { background: red; });
    `);
    let [shader] = Object.values(shaders);
    assert.ok(!parseShaders(shader.source).textures[0].value.includes('--fragment'), shader.source);
    assert.deepEqual(warnings, []);
});
