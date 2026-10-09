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

// the sheet compiled from `code` contains every fragment
function assertContains(code, ...fragments) {
    let all = css(code);
    for (let fragment of fragments) {
        assert.ok(all.includes(fragment), `${code}\n  expected: ${fragment}\n  in: ${all}`);
    }
}

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

test('$ inside a sequence tracks the iteration variables', () => {
    assertContains('@grid: 1; --l: @M4($(@n*2));', '--l:2 4 6 8;');
    assertContains('@grid: 1; --l: @m(3.8, @n);', '--l:1,2,3,4;');
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
    assertContains('width: @t(+2);', 'width:calc(calc(var(--cssd-utime) + 2) * 1);');
    assertContains('width: @ux(5);', 'width:calc(calc(var(--cssd-umousex) + 5) * 1);');
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
        'channels r: invalid expression "r * g"; keeping identity',
        'channels b: invalid expression "sin(b)"; keeping identity',
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
    assert.match(compiled.warnings[0].message, /unterminated argument list/);
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

test('@use at the top level is inlined by the parser', () => {
    let extra = {
        getVariable: () => '@seed: 7; color: red; @keyframes k { to { color: blue } }',
    };
    let compiled = compile('@use: var(--r); animation: k 1s;', '1', 42, extra);
    assert.equal(compiled.seed, '7');
    assert.ok(compiled.styles.all.includes('color:red;'));
    assert.ok(compiled.styles.all.includes('@keyframes k {to {color:blue;}}'));
});

test('a seed attribute keeps drawing past the pre-pass', () => {
    // values from v0.51.0: the cells continue the stream the top-level
    // vars drew from, so seeded artwork stays the same across releases
    let all = css('--x: @r(100); background: hsl(@r(360) 50% 50%);', '1', '12345');
    assert.ok(all.includes('--x:66.0271088304;'), all);
    assert.ok(all.includes('background:hsl(180.341739421 50% 50%);'), all);
});

test('@svg problems are reported once for the whole grid', () => {
    let compiled = compile('background: @svg(viewBox: 0 0 100; circle { animate r: 1; 5 });', '2');
    assert.deepEqual(compiled.warnings.map(w => w.message), [
        'viewBox needs 1, 2 or 4 numbers, got "0 0 100"',
        'animate r: needs a duration after /, as in `/ 2s`',
    ]);
    // the same source is memoized: a second compile still reports
    compiled = compile('background: @svg(viewBox: 0 0 100; circle { animate r: 1; 5 });', '1');
    assert.equal(compiled.warnings.length, 2);
    compiled = compile('filter: @svg-filter(g { draw: 1s });');
    assert.deepEqual(compiled.warnings.map(w => w.message), ['draw: <g> has no path length to draw']);
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

test('keyframes inside a conditional block are not duplicated by the nested compose', () => {
    let all = css('@even { animation: k 1s; @keyframes k { to { --v: @r(1) } } }', '2');
    let names = all.match(/@keyframes [\w-]+/g);
    assert.deepEqual(names, [...new Set(names)]);
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

test('declaration-body at-rules are emitted once verbatim at the top', () => {
    let { top, all } = compile(`
        @property --a { syntax: "<length>"; inherits: false; initial-value: 0px; }
        @function --double(--x) { result: calc(var(--x) * 2); @media (a) { result: 0; } }
        :doodle { @font-face { font-family: "X"; src: url(x.woff); } }
        width: --double(1px);
    `, '2').styles;
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
    assert.match(cells('clip-path: @shape(circle; frame: 5);', '2x1'), /^:is\(cell,#_\) \{clip-path:polygon\(/);
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
});

test('shaders and patterns are records of the same shape', () => {
    let { shaders, patterns } = compile('background: @shaders(void main() {}); :after { background: @pattern(grid: 2; fill: red;) }');
    assert.deepEqual(Object.values(shaders), [{
        source: 'void main() {}',
        target: { selector: 'c-1-1-1', type: 'background' },
        arg: undefined, id: '--shader-1', cell: 'c-1-1-1',
    }]);
    let [pattern] = Object.values(patterns);
    assert.equal(pattern.source, 'grid: 2; fill: red;');
    assert.deepEqual(pattern.target, { selector: 'c-1-1-1', type: 'background' });
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

test('an unknown $name skips the shader with a warning instead of reaching GLSL', () => {
    for (let body of ['fragment { $missing }', 'fragment { void main() {} } texture0 { $missing }']) {
        let { shaders, warnings, styles } = compile(`background: @shaders(${body})`);
        assert.deepEqual(Object.keys(shaders), []);
        assert.equal(styles.all.includes('$missing'), false);
        assert.deepEqual(warnings.map(w => w.message), ['unknown variable $missing in @shaders()']);
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
        assert.deepEqual(missing.warnings.map(w => w.message), [`unknown variable $${name} in @pattern()`]);
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
    let body = '--gear: (points: 4n; r: 1, .5; fill: evenodd);';
    assert.equal(css(body + ' clip-path: @shape($gear; n: 2);'), css(body + ' clip-path: @shape(points: 8; r: 1, .5; fill: evenodd);'));
    // once on :doodle, read by every cell, in any shape reader
    let host = ':doodle { --ring: (points: 8; r: 1, .5); }';
    assert.equal(css(host + ' clip-path: @shape($ring);'), css(host + ' clip-path: @shape(points: 8; r: 1, .5);'));
    assert.match(decodeURIComponent(css(host + ' background: @svg-polygon($ring);')), /<path [^>]*d="M1 0L/);
});

test('@svg-polygon draws contours as subpaths of one path', () => {
    let all = decodeURIComponent(css('background: @svg-polygon(points: 4, 3; r: 1, .5)'));
    assert.ok(all.includes('d="M1 0L0 -1L-1 0L0 1ZM0.5 0L-0.25 -0.433012701892L-0.25 0.433012701892Z"'), all);
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
