import test from 'node:test';
import assert from 'node:assert/strict';

import parseCss from '../src/parser/parse-css.js';
import generateCss from '../src/generator/css.js';
import parseGrid from '../src/parser/parse-grid.js';

test('prototype names as @-properties pass through as plain declarations', () => {
    // `@__proto__: red` used to throw and `@toString: red` emitted [object Object]
    for (let name of ['__proto__', 'toString', 'constructor', 'hasOwnProperty', 'valueOf']) {
        let compiled = generateCss(
            parseCss(`@${name}: red; background: blue;`), parseGrid('1'), 42, 64 * 64
        );
        assert.ok(compiled.styles.all.includes('background:blue;'));
        assert.ok(compiled.styles.all.includes(`@${name}:red;`));
    }
});

test('prototype names as functions read as literal text like other unknown functions', () => {
    // `@constructor(1)` used to hit Object.prototype through MathFunc
    // and emit [object Object]
    for (let name of ['constructor', 'toString', 'hasOwnProperty', 'valueOf']) {
        let compiled = generateCss(
            parseCss(`width: @${name}(1);`), parseGrid('1'), 42, 64 * 64
        );
        assert.ok(compiled.styles.all.includes(`width:@${name};`));
        assert.ok(!compiled.styles.all.includes('[object'));
    }
});

test('$ name suffix reads as a unit appended to the calc result', () => {
    // with an argument list the suffix is a unit, digits included;
    // without one the suffix is the expression itself
    let cases = [
        ['width: $(1+1);', 'width:2;'],
        ['width: $px(1+1);', 'width:2px;'],
        ['width: $%(1+1);', 'width:2%;'],
        ['width: $4(1+1);', 'width:24;'],
        ['width: $123;', 'width:123;'],
    ];
    for (let [code, expected] of cases) {
        let compiled = generateCss(parseCss(code), parseGrid('1'), 42, 64 * 64);
        assert.ok(
            compiled.styles.all.includes(expected),
            `${code} -> ${compiled.styles.all}`
        );
    }
});

test('$ reads variables holding dimensioned values as numbers', () => {
    // `--w: 10px` used to poison the whole expression to 0; the numeric
    // part now joins the math and units attach back via $ suffixes
    let cases = [
        ['--w: 10px; width: $px(w * 2);', 'width:20px;'],
        ['--w: 10px; width: $(w * 2)px;', 'width:20px;'],
        ['--gap: 4px; --w: 10px; margin: $px(w + gap);', 'margin:14px;'],
        ['--angle: 45deg; transform: rotate($deg(angle * 2));', 'rotate(90deg);'],
        // truly non-numeric values still read as 0
        ['--c: red; width: $(c + 1);', 'width:1;'],
    ];
    for (let [code, expected] of cases) {
        let compiled = generateCss(parseCss(code), parseGrid('1'), 42, 64 * 64);
        assert.ok(
            compiled.styles.all.includes(expected),
            `${code} -> ${compiled.styles.all}`
        );
    }
});

test('$ with a lone variable name acts as a generation-time var()', () => {
    // values that don't read as math pass through verbatim, replacing
    // var() ceremony; math-readable values evaluate as before
    let cases = [
        ['--c: tomato; color: $c;', 'color:tomato;'],
        ['--t: rotate(30deg); transform: $t;', 'transform:rotate(30deg);'],
        ['--w: 10px; width: $w;', 'width:10px;'],
        ['--s: calc(100px + 10em); width: $s;', 'width:calc(100px + 10em);'],
        ['--a: b; --b: tomato; color: $a;', 'color:tomato;'],
        ['--n: 3; width: $n;', 'width:3;'],
        ['--e: n + 2; --n: 3; width: $e;', 'width:5;'],
        // an explicit unit or any operation asks for the number
        ['--w: 10px; width: $px(w);', 'width:10px;'],
        ['--w: 10px; width: $(w * 2)px;', 'width:20px;'],
    ];
    for (let [code, expected] of cases) {
        let compiled = generateCss(parseCss(code), parseGrid('1'), 42, 64 * 64);
        assert.ok(
            compiled.styles.all.includes(expected),
            `${code} -> ${compiled.styles.all}`
        );
    }
});

test('argument-less @P() keeps the last pick pool intact', () => {
    // the no-args branch used to splice the stored pool in place,
    // draining it to a single constant value across cells
    let code = `
        @grid: 12x1 / 100px;
        :doodle { --pool: @p(red, blue, green, cyan, magenta, yellow); }
        color: @P();
    `;
    for (let seed of [1, 7, 42]) {
        let compiled = generateCss(parseCss(code), parseGrid('12x1'), seed, 64 * 64);
        let colors = [...compiled.styles.cells.matchAll(/color:([a-z]+);/g)].map(m => m[1]);
        assert.equal(colors.length, 12);
        for (let i = 1; i < colors.length; ++i) {
            assert.notEqual(colors[i], colors[i - 1], `adjacent repeat at cell ${i + 1} (seed ${seed})`);
        }
    }
});

test('@gap draws a rule in the gap when given border-like values', () => {
    let cases = [
        ['@gap: 4px;', ['gap:4px;'], ['row-rule']],
        ['@gap: 4px red;', ['gap:4px;', 'row-rule:red solid 4px;column-rule:red solid 4px;'], []],
        ['@gap: red;', ['gap:1px;', 'row-rule:red solid 1px;column-rule:red solid 1px;'], []],
        ['@gap: 4px 8px red;', ['gap:4px 8px;', 'row-rule:red solid 4px;column-rule:red solid 8px;'], []],
        ['@grid: 2 / 100px _4px red;', ['gap: 4px;', 'row-rule: red solid 4px;column-rule: red solid 4px;'], []],
    ];
    for (let [code, expected, absent] of cases) {
        let compiled = generateCss(parseCss(code), parseGrid('2'), 42, 64 * 64);
        for (let e of expected) {
            assert.ok(compiled.styles.all.includes(e), `${code} -> ${compiled.styles.all}`);
        }
        for (let a of absent) {
            assert.ok(!compiled.styles.all.includes(a), `${code} -> ${compiled.styles.all}`);
        }
    }
});

test('empty svg functions generate without throwing', () => {
    // parseSvg with a custom root used to return a block with no
    // value for empty input, crashing skipHeadSVG
    let cases = [
        '@grid: 2 | @svg-filter();',
        '@grid: 2 | @svg-filter( );',
        'background: @svg();',
    ];
    for (let code of cases) {
        let compiled = generateCss(parseCss(code), parseGrid('2'), 42, 64 * 64);
        assert.ok(compiled.styles.all.length, code);
    }
});

test('numbers print without float noise', () => {
    let cases = [
        ['width: $px(0.1+0.2);', 'width:0.3px;'],
        ['rotate: @calc(0.1+0.7)deg;', 'rotate:0.8deg;'],
        ['width: @sqrt(2)px;', 'width:1.41421356237px;'],
        ['width: @m3(@n(*.1));', 'width:0.1,0.2,0.3;'],
    ];
    for (let [code, expected] of cases) {
        let compiled = generateCss(parseCss(code), parseGrid('1'), 42, 64);
        assert.ok(
            compiled.styles.all.includes(expected),
            `${code} -> ${compiled.styles.all}`
        );
    }
});

test('warnings collect on the compiled result', () => {
    let warn = console.warn;
    console.warn = () => {};
    try {
        let compiled = generateCss(
            parseCss('width: @pik(1, 2);'), parseGrid('1'), 42, 64
        );
        assert.equal(compiled.warnings.length, 1);
        assert.match(compiled.warnings[0].message, /unknown function @pik/);
        assert.equal(compiled.warnings[0].index, 7);

        // parse-level warnings ride along too
        compiled = generateCss(
            parseCss('width: @p(1, 2;'), parseGrid('1'), 42, 64
        );
        assert.match(compiled.warnings[0].message, /unterminated argument list/);

        // a plain @word without an argument list is not a typo signal
        compiled = generateCss(
            parseCss('content: "hi @example";'), parseGrid('1'), 42, 64
        );
        assert.equal(compiled.warnings.length, 0);
    } finally {
        console.warn = warn;
    }
});

test('nested blocks in rule-only positions are ignored, not a crash', () => {
    let warn = console.warn;
    console.warn = () => {};
    try {
        // used to throw: composeRule received cond/pseudo nodes
        let cases = [
            ':after { content: "x"; & { c { color: red; } }',
            '@media (min-width: 100px) { :{ :after { content: "m"; } color: red; }',
        ];
        for (let code of cases) {
            let compiled = generateCss(parseCss(code), parseGrid('1'), 42, 64);
            assert.ok(compiled.styles);
        }
    } finally {
        console.warn = warn;
    }
});

test('composed arguments in cond selectors unwrap to their value', () => {
    // @calc(10*10)px composes text with a function hole, which stays boxed
    // as { value } for applyFunc; composeCond used to print the box as
    // [object Object]
    let compiled = generateCss(
        parseCss('@media (min-width: @calc(10*10)px) { color: red; }'),
        parseGrid('1'), 42, 64
    );
    assert.ok(compiled.styles.all.includes('@media (min-width: 100px)'));
    assert.ok(!compiled.styles.all.includes('[object'));
});

test('float dust snaps to zero at the output boundary', () => {
    // sin(π/200*200) rounds slightly past π and used to print -3.2e-15,
    // which SVG rejects for attributes like circle r
    let cases = [
        ['width: $(sin(π/200*200)*10);', 'width:0;'],
        ['width: @cos(π/2)px;', 'width:0px;'],
    ];
    for (let [code, expected] of cases) {
        let compiled = generateCss(parseCss(code), parseGrid('1'), 42, 64);
        assert.ok(
            compiled.styles.all.includes(expected),
            `${code} -> ${compiled.styles.all}`
        );
    }
});

test('$ with function parts evaluates through the compiled template', () => {
    // $(…@fn…) compiles once with placeholders instead of re-parsing a
    // spliced string per cell/iteration; results must read the same
    let cases = [
        ['@grid: 2x2; width: $(@x*10+@y)px;', ['width:11px;', 'width:21px;', 'width:12px;', 'width:22px;']],
        // hole at the very start and very end of the expression
        ['@grid: 2x2; order: $(@i+1); z-index: $(1-@i);', ['order:2;', 'z-index:0;', 'order:5;', 'z-index:-3;']],
        // signs around holes match spliced-string semantics
        ['@grid: 1; margin: $(-@i)px $(2*-@i)px;', ['margin:-1px -2px;']],
        // context variables still resolve next to placeholders
        ['@grid: 1; --a: 4; width: $(a+@i*2)px;', ['width:6px;']],
        // unit-suffixed form
        ['@grid: 1; rotate: $deg(@i*45);', ['rotate:45deg;']],
    ];
    for (let [code, expected] of cases) {
        let compiled = generateCss(parseCss(code), parseGrid('1'), 42, 64);
        for (let e of expected) {
            assert.ok(
                compiled.styles.all.includes(e),
                `${code} -> ${e} missing in ${compiled.styles.all}`
            );
        }
    }
});

test('$ falls back to splicing when a function result is not a number', () => {
    // non-numeric results (names, multi-values) must keep today's
    // spliced-string behavior, including generation-time deref
    let cases = [
        // @p yields a name that derefs through --b
        ['@grid: 1; --b: 30; width: $(@p(b))px;', 'width:30px;'],
        // a name spliced into math reads through the context
        ['@grid: 1; --c: 7; width: $(@p(c)*2+@i)px;', 'width:15px;'],
    ];
    for (let [code, expected] of cases) {
        let compiled = generateCss(parseCss(code), parseGrid('1'), 42, 64);
        assert.ok(
            compiled.styles.all.includes(expected),
            `${code} -> ${compiled.styles.all}`
        );
    }
});

test('$ inside a sequence tracks the iteration variables', () => {
    let compiled = generateCss(
        parseCss('@grid: 1; --l: @M4($(@n*2));'), parseGrid('1'), 42, 64
    );
    assert.ok(
        compiled.styles.all.includes('--l:2 4 6 8;'),
        compiled.styles.all
    );
});

test('@calc and Math functions evaluate templated arguments the same', () => {
    // the calc-template path extends to every consumer whose arguments
    // are always calc-ed; results must match the spliced-string reading
    let cases = [
        ['@grid: 1; width: @calc(@i*3+1)px;', 'width:4px;'],
        ['@grid: 1; opacity: @sin(π/2+@i-1);', 'opacity:1;'],
        ['@grid: 1; width: @max(@i, 5)px;', 'width:5px;'],
        ['@grid: 1; height: @pow(@i+1, 2)px;', 'height:4px;'],
        // non-numeric results splice as before; Math functions see no
        // variables, so `a` reads as 0 either way
        ['@grid: 1; --a: 3; width: @abs(@p(a)-5)px;', 'width:5px;'],
        // constants ignore their arguments either way
        ['@grid: 1; width: @trunc(@PI(@i))px;', 'width:3px;'],
    ];
    for (let [code, expected] of cases) {
        let compiled = generateCss(parseCss(code), parseGrid('1'), 42, 64);
        assert.ok(
            compiled.styles.all.includes(expected),
            `${code} -> ${compiled.styles.all}`
        );
    }
});

test('function results that are not plain strings reach calc functions safely', () => {
    // @plot returns a Point object and the list functions return arrays;
    // both used to crash parseOperation, which read them as strings and
    // then called .slice()/.trim() on them
    let cases = [
        'width: @i(@plot(r 5));',
        'width: @x(@plot(r 5));',
        'width: @dx(@plot(r 5));',
        'width: @ut(@plot(r 5));',
        'width: @x(@mirror(1%,2%));',
        'width: @i(@cycle(1%,2%));',
        'width: @x(@cycle(1*,2*));',
    ];
    for (let code of cases) {
        assert.doesNotThrow(
            () => generateCss(parseCss(code), parseGrid('1'), 42, 64), code
        );
    }
    // the operator argument forms keep reading the same
    let same = [
        ['width: @i(*10);', 'width:10;'],
        ['width: @i(+2);', 'width:3;'],
        ['width: @i(2*);', 'width:2;'],
        ['width: @i(%360deg);', 'width:1deg;'],
    ];
    for (let [code, expected] of same) {
        let compiled = generateCss(parseCss(code), parseGrid('1'), 42, 64);
        assert.ok(
            compiled.styles.all.includes(expected),
            `${code} -> ${compiled.styles.all}`
        );
    }
});

test('static keyframes are emitted once and keep their name in every cell', () => {
    let code = '@keyframes spin { to { rotate: 1turn } } animation: 1s spin;';
    let compiled = generateCss(parseCss(code), parseGrid('3'), 42, 64 * 64);
    let { all } = compiled.styles;
    assert.equal((all.match(/@keyframes/g) || []).length, 1);
    // the name can sit anywhere in the shorthand
    assert.equal((all.match(/animation:1s spin;/g) || []).length, 9);
    assert.ok(!all.includes('1s-'));
});

test('keyframes with functions are copied per cell as name-count', () => {
    let code = '@keyframes k { to { --v: @r(10) } } animation: k 1s;';
    let compiled = generateCss(parseCss(code), parseGrid('2'), 42, 64 * 64);
    let { all } = compiled.styles;
    assert.deepEqual(all.match(/@keyframes [\w-]+/g), [
        '@keyframes k', '@keyframes k-2', '@keyframes k-3', '@keyframes k-4',
    ]);
    assert.ok(all.includes('#c-1-1-1 {animation:k 1s;}'));
    assert.ok(all.includes('#c-2-2-1 {animation:k-4 1s;}'));
});

test('keyframes inside a cond are not duplicated by the nested compose', () => {
    let code = '@even { animation: k 1s; @keyframes k { to { --v: @r(1) } } }';
    let compiled = generateCss(parseCss(code), parseGrid('2'), 42, 64 * 64);
    let names = compiled.styles.all.match(/@keyframes [\w-]+/g);
    assert.deepEqual(names, [...new Set(names)]);
});

test('conditional group rules scope bare rules to the cell and come last', () => {
    let code = `color: blue; @media (min-width: 1px) {
        color: red; :doodle { --a: 1 } :container { gap: 1px } :after { content: "m" }
        @nth(1) { width: 1px } @supports (x: y) { height: 2px }
    }`;
    let compiled = generateCss(parseCss(code), parseGrid('1'), 42, 64 * 64);
    let { all, top } = compiled.styles;
    assert.equal(top, '');
    let at = all.indexOf('@media');
    assert.ok(at > all.indexOf('#c-1-1-1 {color:blue;}'));
    let group = all.slice(at);
    for (let expected of [
        '#c-1-1-1 {color:red;}',
        ':host,.host {--a:1;}',
        'cssd-grid {gap:1px;}',
        '#c-1-1-1:after {content:"m";}',
        '#c-1-1-1 {width:1px;--_cell-width:1px;}',
        '@supports (x: y) {#c-1-1-1 {height:2px;--_cell-height:2px;}}',
    ]) {
        assert.ok(group.includes(expected), expected);
    }
});

test('nested pseudo lists and & segments compose per selector', () => {
    let compiled = generateCss(
        parseCss(':hover { :after, :before { color: red } & .foo { color: blue } }'),
        parseGrid('1'), 42, 64 * 64
    );
    let { all } = compiled.styles;
    assert.ok(all.includes('#c-1-1-1:hover:after {color:red;}'));
    assert.ok(all.includes('#c-1-1-1:hover:before {color:red;}'));
    assert.ok(all.includes('& .foo {color:blue;}'));
});

test('quoted commas and strings survive composition', () => {
    let compiled = generateCss(
        parseCss('content: "a, b"; --x: @p("a" "b");'), parseGrid('1'), 42, 64 * 64
    );
    assert.ok(compiled.styles.all.includes('content:"a, b";'));
    assert.ok(compiled.styles.all.includes('--x:"a" "b";'));
});

test('nested blocks inside a pseudo are dropped with balanced output', () => {
    let warn = console.warn;
    console.warn = () => {};
    try {
        let compiled = generateCss(
            parseCss(':hover { @nth(1) { color: red } } :after { content: "x" }'),
            parseGrid('1'), 42, 64 * 64
        );
        assert.equal(compiled.styles.all, '#c-1-1-1:after {content:"x";}');
        assert.ok(compiled.warnings.some(w => w.message === 'unsupported nested block ignored'));
    } finally {
        console.warn = warn;
    }
});

test('transition longhands flag hasTransition like animation longhands', () => {
    let compiled = generateCss(parseCss('transition-duration: 1s;'), parseGrid('1'), 42, 64 * 64);
    assert.ok(compiled.props.hasTransition);
});

test('@pattern bodies reach the pattern renderer whole', () => {
    let compiled = generateCss(
        parseCss('background: @pattern(grid: 2; fill: @p(red, blue););'), parseGrid('1'), 42, 64 * 64
    );
    let [pattern] = Object.values(compiled.pattern);
    assert.equal(pattern.code, 'grid: 2; fill: @p(red, blue);');
});

test('$ math reads dashed variable names', () => {
    let cases = [
        ['--font-size: 5; width: $px(font-size * 2);', 'width:10px;'],
        ['--cell-w: 4; --cell-h: 2; width: $(cell-w * cell-h)px;', 'width:8px;'],
        ['--cell-w: 4; width: $(cell-w * @calc(2 + 1))px;', 'width:12px;'],
        ['--a-b: 9; --a: 3; --b: 1; width: $(a-b) $(a - b);', 'width:9 2;'],
    ];
    for (let [code, expected] of cases) {
        let compiled = generateCss(parseCss(code), parseGrid('1'), 42, 64 * 64);
        assert.ok(
            compiled.styles.all.includes(expected),
            `${code} -> ${compiled.styles.all}`
        );
    }
});

test('long values that repeat in every cell are declared once on the grid', () => {
    let gradient = 'linear-gradient(45deg,#ff0000 0%,#00ff00 10%,#0000ff 20%,#ffff00 30%,'
        + '#ff00ff 40%,#00ffff 50%,#000000 60%,#ffffff 70%,#808080 80%,#123456 90%,#654321 100%)';
    let compiled = generateCss(
        parseCss(`background: ${gradient}; --g: ${gradient};`), parseGrid('2x1'), 42, 64 * 64
    );
    let { all, container } = compiled.styles;
    assert.equal(container, `cssd-grid {--_s1:${gradient};}`);
    assert.ok(all.includes('#c-1-1-1 {background:var(--_s1);\n--g:var(--_s1);}'));
    assert.ok(all.includes('#c-2-1-1 {background:var(--_s1);\n--g:var(--_s1);}'));
    assert.equal(all.split(gradient).length - 1, 1);
});

test('a static @shape polygon is shared across cells', () => {
    let compiled = generateCss(
        parseCss('@shape: circle; :after { content: ""; @shape: heart; }'),
        parseGrid('2x1'), 42, 64 * 64
    );
    let { all, container } = compiled.styles;
    assert.match(container, /^cssd-grid \{--_s1:polygon\([^;]+\);\n--_s2:polygon\([^;]+\);\}$/);
    assert.equal(all.split('polygon(').length - 1, 2);
    for (let expected of [
        '#c-1-1-1 {clip-path:var(--_s1);}',
        '#c-2-1-1 {clip-path:var(--_s1);}',
        '#c-1-1-1:after {content:"";\nclip-path:var(--_s2);}',
        '#c-2-1-1:after {content:"";\nclip-path:var(--_s2);}',
    ]) {
        assert.ok(all.includes(expected), expected);
    }
});

test('short, per-cell and host values stay inline', () => {
    let compiled = generateCss(
        parseCss(`
            background: red;
            --long: linear-gradient(@r(360)deg,#ff0000 0%,#00ff00 10%,#0000ff 20%,#ffff00 30%,#ff00ff 40%,#00ffff 50%,#000000 60%,#ffffff 70%,#808080 80%);
            @shape: @p(circle, heart);
            :doodle { @shape: circle; }
        `),
        parseGrid('2x1'), 42, 64 * 64
    );
    let { all, container } = compiled.styles;
    assert.equal(container, '');
    assert.ok(!all.includes('--_s'));
    assert.ok(all.includes('#c-1-1-1 {background:red;\n--long:linear-gradient('));
    assert.ok(all.includes(':host,.host {clip-path:polygon('));
    assert.equal(all.split('clip-path:polygon(').length - 1, 3);
});

test('values shared from inside @keyframes are declared on the grid too', () => {
    let compiled = generateCss(
        parseCss('animation: a 1s; @keyframes a { from { @shape: circle; } to { @shape: heart; } }'),
        parseGrid('2x1'), 42, 64 * 64
    );
    let { all, container } = compiled.styles;
    assert.match(container, /^cssd-grid \{--_s1:polygon\([^;]+\);\n--_s2:polygon\([^;]+\);\}$/);
    assert.ok(all.includes('@keyframes a {from {clip-path:var(--_s1);}\nto {clip-path:var(--_s2);}}'));
    assert.equal(all.split('polygon(').length - 1, 2);
    assert.ok(all.indexOf('cssd-grid {') > all.indexOf('@keyframes a {'));
});
