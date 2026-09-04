import test from 'node:test';
import assert from 'node:assert/strict';

import parseCss from '../../src/parser/parse-css.js';
import parseGrid from '../../src/parser/parse-grid.js';
import generateCss from '../../src/generator/css.js';

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
        'width: @ut(@plot(r 5));',
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

test('composed arguments in cond selectors unwrap to their value', () => {
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
    let [pattern] = Object.values(compiled.pattern);
    assert.equal(pattern.code, 'grid: 2; fill: @p(red, blue);');
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

test('generated ids are positional and carry the instance token', () => {
    let code = `
        background: @doodle(color: red);
        filter: @svg-filter(frequency=.2, scale=5);
        @nth(1) { background: @shaders(void main() {}) }
    `;
    let run = instance => generateCss(parseCss(code), parseGrid('2x1'), 7, 64, undefined, [], instance);
    let a = run(), b = run();
    assert.equal(a.styles.all, b.styles.all);
    // one counter for every kind, numbered in compose order
    assert.deepEqual(Object.keys(a.doodles), ['doodle-1', 'doodle-4']);
    assert.deepEqual(Object.keys(a.filters), ['filter-2', 'filter-5']);
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

test('keyframes inside a cond are not duplicated by the nested compose', () => {
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
        'animation: a 1s; @keyframes a { from { @shape: circle; } to { @shape: heart; } }', '2x1'
    ).styles;
    assert.equal(container, '');
    assert.equal((all.match(/@keyframes/g) || []).length, 1);
    assert.match(all, /@keyframes a \{from \{clip-path:polygon\([^;]+\);\}\nto \{clip-path:polygon\([^;]+\);\}\}/);
    assert.equal(all.split('polygon(').length - 1, 2);
    assert.equal(cells, ':is(cell,#_) {animation:a 1s;}');
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
        '#c-1-1-1 {color:red;\nwidth:1px;--_cell-width:1px;}',
        ':host,.host {--a:1;}',
        'grid {gap:1px;}',
        '#c-1-1-1:after {content:"m";}',
        '@supports (x: y) {#c-1-1-1 {height:2px;--_cell-height:2px;}}',
    ]) {
        assert.ok(group.includes(expected), expected);
    }
});

test('host rules inside a group compose once', () => {
    let all = css('@media (a) { :doodle { color: red } color: blue }', '2');
    assert.equal(all.match(/:host,\.host \{color:red;\}/g).length, 1);
    assert.equal(all.match(/#c-\d-\d-1 \{color:blue;\}/g).length, 4);
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
    assert.equal(cells('width: 1px', '2x1'), ':is(cell,#_) {width:1px;--_cell-width:1px;}');
});

test('a static @shape polygon prints once per selector', () => {
    let all = cells('@shape: circle; :after { content: ""; @shape: heart; }', '2x1');
    assert.equal(all.split('polygon(').length - 1, 2);
    assert.match(all, /^:is\(cell,#_\) \{clip-path:polygon\([^;]+\);\}:is\(cell,#_\):after \{content:"";\nclip-path:polygon\([^;]+\);\}$/);
});

test('a few distinct texts print once each with their cells listed', () => {
    assert.equal(cells('@even { background: blue; }', '2x2'), '#c-2-1-1,#c-1-2-1 {background:blue;}');
    assert.equal(cells('color: @match(x > 1, red, blue);', '4x1'),
        '#c-1-1-1 {color:blue;}#c-2-1-1,#c-3-1-1,#c-4-1-1 {color:red;}');
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

test('a declaration inside a cond keeps its source order', () => {
    // the cond is first seen in the second cell: still before the color
    assert.equal(cells('@even { color: blue; } color: rgb(@i,0,0);', '4x1'),
        '#c-2-1-1,#c-4-1-1 {color:blue;}'
        + '#c-1-1-1 {color:rgb(1,0,0);}#c-2-1-1 {color:rgb(2,0,0);}'
        + '#c-3-1-1 {color:rgb(3,0,0);}#c-4-1-1 {color:rgb(4,0,0);}');
});

test('rules inside group at-rules stay per cell', () => {
    assert.equal(cells('@media (x) { color: red; }', '2x1'),
        '@media (x) {#c-1-1-1 {color:red;}}\n@media (x) {#c-2-1-1 {color:red;}}');
});

test('per-cell and host values stay inline', () => {
    let { all, container } = compile(`
        --long: linear-gradient(@r(360)deg,#ff0000 0%,#00ff00 10%,#0000ff 20%,#ffff00 30%,#ff00ff 40%,#00ffff 50%,#000000 60%,#ffffff 70%,#808080 80%);
        @shape: @pick-by-turn(circle, heart);
        :doodle { @shape: circle; }
    `, '2x1').styles;
    assert.equal(container, '');
    assert.ok(all.includes('#c-1-1-1 {--long:linear-gradient('));
    assert.ok(all.includes(':host,.host {clip-path:polygon('));
    assert.equal(all.split('clip-path:polygon(').length - 1, 3);
});
