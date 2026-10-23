import test from 'node:test';
import assert from 'node:assert/strict';

import parseCss from '../../src/parser/parse-css.js';

// the plain data of the AST, without the raw() accessors
const ast = (input, extra) => JSON.parse(JSON.stringify(parseCss(input, extra)));

const text = value => ({ type: 'text', value });
const rule = (property, ...values) => ({ type: 'rule', property, value: [values] });
const argument = (values, cluster = false) => ({ values, cluster });

test('quoted content keeps every character inside a pseudo', () => {
    const after = (...styles) => [{
        type: 'pseudo', selector: ':after', selectors: ['&:after'], styles,
    }];
    for (let value of ['', 'x', ')', '(', '}', ';', '()', "'", 'x;']) {
        assert.deepEqual(
            ast(`:after { content: "${value}"; }`),
            after(rule('content', text(`"${value}"`))),
            value
        );
    }
    assert.deepEqual(ast(`:after { content: "x;";;; }`), after(rule('content', text('"x;"'))));
    // escaped quotes stay inside the string instead of terminating it
    assert.deepEqual(ast(`:after { content: "a\\"b"; }`), after(rule('content', text('"a\\"b"'))));
    // an escaped line break joins the lines
    assert.deepEqual(ast(`:after { content: "a\\\nb"; }`), after(rule('content', text('"ab"'))));
    assert.equal(parseCss(`content: @p("a\\\nb");`)[0].value[0][0].arguments[0].values[0].value, 'ab');
});

test('quoted content inside an @svg argument', () => {
    const content = value => [rule('@content', {
        type: 'func',
        index: 10,
        name: '@svg',
        arguments: [argument([text(`text { content: "${value}"; }`)])],
        position: 1,
    })];
    assert.deepEqual(ast(`@content: @svg( text { content: ""; } )`), content(''));
    assert.deepEqual(ast(`@content: @svg( text { content: "}"; })`), content('}'));
});

test('@content keeps quotes as written', () => {
    assert.deepEqual(ast(`@content: hello;`), [rule('@content', text('hello'))]);
    assert.deepEqual(ast(`@content: "hello";`), [rule('@content', text('"hello"'))]);
});

test('a $ argument is unwrapped only by a pair that wraps it whole', () => {
    const argText = input => parseCss(input)[0].value[0][0].arguments[0].values[0].value;
    // the leading ( and trailing ) belong to separate groups
    assert.equal(argText(`width: $((5) % (3));`), '(5) % (3)');
    assert.equal(argText(`width: $((5 + 20) % (3));`), '(5 + 20) % (3)');
    assert.equal(argText(`width: $(((10)) % ((3)));`), '((10)) % ((3))');
    assert.equal(argText(`width: $((5 % 3));`), '5 % 3');
});

test('comments vanish from properties and values but survive in code arguments', () => {
    assert.deepEqual(ast(`/*x*/color: red;`), [rule('color', text('red'))]);
    assert.deepEqual(ast(`width/* note */: 10px;`), [rule('width', text('10px'))]);
    assert.deepEqual(ast(`width: /* note */ 10px;`), [rule('width', text('10px'))]);

    let [pattern] = parseCss(`background: @pattern(/* head */ grid: 10; // note\n fill: #000;);`);
    let body = pattern.value[0][0].arguments[0].values[0].value;
    assert.ok(body.includes('// note'));
    assert.ok(body.includes('\n'));
});

test('rawValue() spans the source text', () => {
    let [seed] = parseCss(`@seed: 42;`);
    assert.equal(seed.rawValue(), '42');

    [seed] = parseCss(`@seed: 4 2 }`);
    assert.equal(seed.rawValue(), '4 2');

    // the value keeps its own colons
    let [url] = parseCss(`background: url(https://example.com/a.png);`);
    assert.equal(url.rawValue(), 'url(https://example.com/a.png)');
});

test('a parenthesized argument is a cluster', () => {
    let [rule] = parseCss(`background: @p(('a', 'b'), red);`);
    let func = rule.value[0][0];
    assert.equal(func.arguments[0].cluster, true);
    assert.equal(func.arguments[0].values[0].value, `'a', 'b'`);
    assert.equal(func.arguments[1].cluster, false);
    assert.equal(func.arguments[1].values[0].value, 'red');
});

test('argument text is kept as written', () => {
    // numeric-looking text used to become a number: @p(01) printed 1
    const values = input => parseCss(input)[0].value[0][0].arguments.map(a => a.values[0].value);
    assert.deepEqual(values(`content: @p(01, 1.50, 0x10, 1e3);`), ['01', '1.50', '0x10', '1e3']);
});

test('a trailing comma adds no argument', () => {
    // lazy @match read the empty one as its else value
    const args = input => parseCss(input)[0].value[0][0].arguments.map(a => a.values);
    assert.deepEqual(args(`a: @match(x, red, blue,);`), [[text('x')], [text('red')], [text('blue')]]);
    assert.deepEqual(args(`a: @match(x, red, blue,\n);`), [[text('x')], [text('red')], [text('blue')]]);
    assert.deepEqual(args(`a: @match(x, , blue);`), [[text('x')], [], [text('blue')]]);
    assert.deepEqual(args(`a: @p();`), [[]]);
});

test('a leading ± expands an argument into its negative and positive', () => {
    const shape = values => values.map(v => v.type === 'func' ? v.name : v.value);
    const args = input => parseCss(input)[0].value[0][0].arguments;

    let [rule] = parseCss(`transform: rotate(@pick(±45deg));`);
    let pick = rule.value[0][1];
    assert.equal(pick.name, '@pick');
    assert.deepEqual(pick.arguments.map(arg => arg.values[0].value), ['-45deg', '45deg']);

    // a call after the sign is part of it: -@r(10) and @r(10)
    assert.deepEqual(args(`width: @p(±@r(10));`).map(a => shape(a.values)), [['-', '@r'], ['@r']]);
    assert.deepEqual(args(`width: @p(±@r);`).map(a => shape(a.values)), [['-', '@r'], ['@r']]);
    assert.deepEqual(args(`width: @p(±2@r(10), 1);`).map(a => shape(a.values)), [['-2', '@r'], ['2', '@r'], ['1']]);

    // a wrapping pair is stripped from the positive copy only
    assert.deepEqual(
        args(`width: @p(±(a + 1));`).map(a => [a.cluster, shape(a.values)]),
        [[false, ['-(a + 1)']], [true, ['a + 1']]]
    );

    // ± anywhere else is text
    assert.deepEqual(
        args(`width: @p(a±1, "±1", @r(1)±3);`).map(a => shape(a.values)),
        [['a±1'], ['±1'], ['@r', '±3']]
    );
});

test('every function node gets a unique position', () => {
    let positions = [];
    (function walk(nodes) {
        for (let node of nodes) {
            if (Array.isArray(node)) walk(node);
            else if (node && typeof node === 'object') {
                if (node.type === 'func') {
                    positions.push(node.position);
                    walk(node.arguments.map(arg => arg.values));
                }
                if (Array.isArray(node.value)) walk(node.value);
            }
        }
    })(parseCss(`background: @p(@r(1), @r(1)); width: @r(1)px;`));
    assert.equal(positions.length, 4);
    assert.equal(new Set(positions).size, 4);
});

test('@use inlines a variable at the top level, in pseudos and in conds', () => {
    let extra = { getVariable: name => ({ '--rule': 'color: red;' }[name] || '') };

    let [pseudo] = parseCss(`:after { @use: var(--rule); content: "x"; }`, extra);
    assert.equal(pseudo.styles[0].property, 'color');
    assert.equal(pseudo.styles[1].property, 'content');

    let [rule, cond] = parseCss(`@use: var(--rule); @nth(1) { @use: var(--rule); }`, extra);
    assert.equal(rule.property, 'color');
    assert.equal(cond.type, 'cond');
    assert.equal(cond.styles[0].property, 'color');
});

test('@use skips a variable that refers to itself', () => {
    let vars = {
        '--self': '@use: var(--self); color: red;',
        '--a': '@use: var(--b); width: 1px;',
        '--b': '@use: var(--a); height: 2px;',
        '--twice': '@use: var(--twice), var(--twice); color: blue;',
    };
    let extra = { getVariable: name => vars[name] || '' };

    let parsed = parseCss(`@use: var(--self); margin: 0;`, extra);
    assert.deepEqual(parsed.map(r => r.property), ['color', 'margin']);
    assert.equal(parsed.warnings.length, 1);
    assert.equal(parsed.warnings[0].message, 'circular @use: --self');

    // through another variable
    parsed = parseCss(`@use: var(--a);`, extra);
    assert.deepEqual(parsed.map(r => r.property), ['height', 'width']);
    assert.equal(parsed.warnings[0].message, 'circular @use: --a');

    // two references in one value used to expand exponentially
    parsed = parseCss(`@use: var(--twice);`, extra);
    assert.deepEqual(parsed.map(r => r.property), ['color']);
    assert.equal(parsed.warnings.length, 2);

    // the guard is per expansion: the same variable twice in a row is fine
    parsed = parseCss(`@use: var(--rule), var(--rule);`, {
        getVariable: name => ({ '--rule': 'color: red;' }[name] || ''),
    });
    assert.deepEqual(parsed.map(r => r.property), ['color', 'color']);
    assert.equal(parsed.warnings.length, 0);
});

test('a quoted paren does not leak into block probing', () => {
    assert.deepEqual(ast(`color: red; content: "("; :after { color: blue; }`), [
        rule('color', text('red')),
        rule('content', text('"("')),
        {
            type: 'pseudo', selector: ':after', selectors: ['&:after'],
            styles: [rule('color', text('blue'))],
        },
    ]);

    // a later quoted ")" must not rebalance the depth and turn
    // preceding rules into a bogus cond selector
    let result = parseCss(`content: "("; @even (")") { color: blue; }`);
    assert.equal(result.length, 2);
    assert.equal(result[0].type, 'rule');
    assert.equal(result[0].property, 'content');
    assert.equal(result[1].type, 'cond');
    assert.equal(result[1].name, '@even');
});

test('a malformed keyframes step stays inside the block', () => {
    // a '}' after the step name closes the keyframes
    // instead of opening a step body
    let result = parseCss(`@keyframes x { 50% } color: red;`);
    assert.equal(result.length, 2);
    assert.equal(result[0].type, 'keyframes');
    assert.equal(result[0].steps.length, 1);
    assert.equal(result[0].steps[0].styles.length, 0);
    assert.equal(result[1].property, 'color');

    // a stray ';' yields an empty step and the next step parses normally
    let [k] = parseCss(`@keyframes x { 50%; to { opacity: 0; } }`);
    assert.equal(k.steps.length, 2);
    assert.equal(k.steps[1].styles[0].property, 'opacity');
});

test('svg times syntax expands through @svg', () => {
    const svgArgs = input => parseCss(input)[0].value[0][0].arguments;
    const hasM = args => args.some(arg =>
        arg.values.some(v => v.type === 'func' && v.name === '@M'));

    assert.ok(hasM(svgArgs(`background: @svg(circle*3 { r: 4 })`)));
    // inside an inline block riding on a statement value
    assert.ok(hasM(svgArgs(`background: @svg(path { href: defs g circle*2 {} })`)));
    // the words alone in content are not times syntax
    let args = svgArgs(`background: @svg(text { content: "3 { times pureName" })`);
    assert.ok(!hasM(args));
    assert.ok(args[0].values[0].value.includes('times pureName'));
});

test('commas inside quotes do not split the value', () => {
    let [rule] = parseCss(`content: "a, b";`);
    assert.equal(rule.value.length, 1);
    assert.equal(rule.value[0][0].value, '"a, b"');
});

test('nested blocks inside a pseudo parse as conds', () => {
    // used to be read as a rule whose name swallowed the '{'
    let [pseudo] = parseCss(`:hover { @nth(1) { color: red } }`);
    assert.equal(pseudo.type, 'pseudo');
    assert.equal(pseudo.styles.length, 1);
    assert.equal(pseudo.styles[0].type, 'cond');
    assert.equal(pseudo.styles[0].name, '@nth');
});

test('a @doodle body keeps its π for its own parse, which skips quotes', () => {
    let [rule] = parseCss(`background: @doodle(:after { content: "π" } --a: π);`);
    assert.equal(rule.value[0][0].arguments[0].values[0].value, ':after { content: "π" } --a: π');
});

test('@pattern bodies are kept verbatim like @doodle', () => {
    let [rule] = parseCss(`background: @pattern(grid: 2; fill: @p(red, blue););`);
    let [arg] = rule.value[0][0].arguments;
    assert.equal(arg.values.length, 1);
    assert.equal(arg.values[0].value, 'grid: 2; fill: @p(red, blue);');
});

test('a quote or paren in a // comment does not end a @pattern, @shaders or @scene body', () => {
    for (let name of ['pattern', 'shaders', 'scene', 'shaders400', 'pattern2x3']) {
        let rules = parseCss(`background: @${name}(\n  // don't (fill\n  fill: #fff;\n); color: red;`);
        assert.deepEqual(rules.map(r => r.property), ['background', 'color'], name);
        assert.equal(rules[0].value[0][0].arguments[0].values[0].value, "// don't (fill\n  fill: #fff;");
    }
    // a nested doodle has no // comments; a url keeps its //
    let [doodle] = parseCss(`background: @doodle(background: url(//a.b/c.png));`);
    assert.equal(doodle.value[0][0].arguments[0].values[0].value, 'background: url(//a.b/c.png)');
});

test('a // comment is dropped from a @shape, @plot or @tile body', () => {
    for (let name of ['shape', 'plot', 'Plot', 'tile']) {
        let rules = parseCss(`clip-path: @${name}(\n  // don't (r: .1\n  r: .5;\n); color: red;`);
        assert.deepEqual(rules.map(r => r.property), ['clip-path', 'color'], name);
        assert.equal(rules[0].value[0][0].arguments[0].values[0].value, 'r: .5;');
    }
});

test('empty statements are dropped', () => {
    let rules = parseCss(`color: red;; width: 1px; @keyframes x { from { ; opacity: 0 } }`);
    assert.deepEqual(rules.map(r => r.property || r.type), ['color', 'width', 'keyframes']);
    assert.deepEqual(rules[2].steps[0].styles.map(r => r.property), ['opacity']);
});

test('quotes only strip when they wrap the whole argument', () => {
    let [rule] = parseCss(`content: @p("a" "b", "c", 'it"s');`);
    let args = rule.value[0][0].arguments;
    assert.deepEqual(args.map(a => [a.values[0].value, a.cluster]), [
        ['"a" "b"', false], ['c', true], ['it"s', true],
    ]);
});

test('selectors resolve against the enclosing block', () => {
    const selectors = code => parseCss(code).map(n => n.selectors);
    // the raw text stays as written, the resolved list stands on '&'
    let [pseudo] = parseCss(`:after { x: y }`);
    assert.equal(pseudo.selector, ':after');
    assert.deepEqual(pseudo.selectors, ['&:after']);
    // a leading pseudo compounds, '&' substitutes, anything else descends
    assert.deepEqual(
        selectors(`&:hover {} & :hover {} .foo {} .dark & {} & {}`),
        [['&:hover'], ['& :hover'], ['& .foo'], ['.dark &'], ['&']]
    );
    // nested lists cross with the enclosing list
    let [outer] = parseCss(`:a, :b { :c, :d { x: y } }`);
    assert.deepEqual(outer.selectors, ['&:a', '&:b']);
    assert.deepEqual(outer.styles[0].selectors, ['&:a:c', '&:b:c', '&:a:d', '&:b:d']);
    // :doodle and :container start over from the host and the grid
    let [hover] = parseCss(`:hover { :doodle { x: y } :container { x: y } }`);
    assert.deepEqual(hover.styles.map(n => n.selectors), [[':host'], [':container']]);
});

test('nested lists that multiply past 1000 selectors drop their block', () => {
    for (let open of [':a,:b{', '& &{']) {
        let rules = parseCss(open.repeat(30) + 'x: y' + '}'.repeat(30) + 'z: w');
        assert.equal(rules.at(-1).property, 'z');
        assert.deepEqual(rules.warnings.map(w => w.message), ['selector too large']);
    }
});

test('selector lists split on top-level commas only', () => {
    let [pseudo] = parseCss(`:is(a, b), [title="a,b"],
        & :hover { x: y }`);
    assert.deepEqual(pseudo.selectors, ['&:is(a, b)', '& [title="a,b"]', '& :hover']);
});

test('host selectors fold pseudo-classes into :host()', () => {
    let [doodle] = parseCss(`:doodle(.a) { :hover { :after { x: y } } ::part(p) { x: y } }`);
    assert.deepEqual(doodle.selectors, [':host(.a)']);
    let [hover, part] = doodle.styles;
    assert.deepEqual(hover.selectors, [':host(.a:hover)']);
    // pseudo-elements stay outside the parens
    assert.deepEqual(hover.styles[0].selectors, [':host(.a:hover):after']);
    assert.deepEqual(part.selectors, [':host(.a)::part(p)']);
    // written directly, with nested parens, and :host-context untouched
    assert.deepEqual(parseCss(`:doodle:hover { x: y }`)[0].selectors, [':host(:hover)']);
    assert.deepEqual(
        parseCss(`:doodle { :not(:is(.a, .b)):focus { x: y } }`)[0].styles[0].selectors,
        [':host(:not(:is(.a, .b)):focus)']
    );
    assert.deepEqual(
        parseCss(`:host-context(.d) { &:hover { x: y } }`)[0].styles[0].selectors,
        [':host-context(.d):hover']
    );
});

test('host selector folding leaves unrecognised compounds untouched', () => {
    const selectors = selector => parseCss(`${selector} { x: y }`)[0].selectors;
    assert.deepEqual(selectors(`:doodle#hero.foo:hover`), [':host(#hero.foo:hover)']);
    assert.deepEqual(selectors(`:doodle:hover, .x`), [':host(:hover)', '& .x']);
    assert.deepEqual(selectors(`:doodle:not(:is(:where(.a, .b))):focus`), [':host:not(:is(:where(.a, .b))):focus']);
    assert.deepEqual(selectors(`:doodle[title="]"]:hover`), [':host[title="]"]:hover']);
});

test(':container(...) reads as a compound on the grid', () => {
    let [pseudo] = parseCss(`:container(.x) .y, :container { :hover { x: y } }`);
    assert.deepEqual(pseudo.selectors, [':container.x .y', ':container']);
    assert.deepEqual(pseudo.styles[0].selectors, [':container.x .y:hover', ':container:hover']);
});

test('the selector context passes through conds and @use, then restores', () => {
    let [hover] = parseCss(`:hover { @nth(1) { :after { x: y } } }`);
    assert.deepEqual(hover.styles[0].styles[0].selectors, ['&:hover:after']);

    let extra = { getVariable: name => ({ '--rule': ':after { x: y }' }[name] || '') };
    let [used] = parseCss(`:hover { @use: var(--rule); }`, extra);
    assert.deepEqual(used.styles[0].selectors, ['&:hover:after']);

    let [, after] = parseCss(`:hover { :focus { x: y } } :after { x: y }`);
    assert.deepEqual(after.selectors, ['&:after']);
});

test('blocks dispatch on their opener', () => {
    const types = code => parseCss(code).map(n => n.type + ':' + (n.name || n.selector || n.property));
    // any non-@ block is a selector, quotes and parens do not fool the probe
    assert.deepEqual(
        types(`[title="{"] { x: y } .foo { x: y } @cell.random { x: y } @keyframes2 { x: y }`),
        ['pseudo:[title="{"]', 'pseudo:.foo', 'cond:@cell.random', 'cond:@keyframes2']
    );
    // a selector without a block is dropped, not swallowed to the next '{'
    assert.deepEqual(types(`:hover; color: red; :after { x: y }`), ['rule:color', 'pseudo::after']);
});

test('@ blocks keep their source text', () => {
    let [face, rule] = parseCss(`@font-face { src: url("}"); } color: red;`);
    assert.equal(face.type, 'cond');
    assert.equal(face.raw(), '@font-face { src: url("}"); }');
    assert.equal(rule.property, 'color');
    // nested blocks and positions inside a pseudo included
    let [doodle] = parseCss(`:doodle { @function --f(--x) { result: 1; @media (a) { result: 2 } } x: y }`);
    assert.equal(doodle.styles[0].raw(), '@function --f(--x) { result: 1; @media (a) { result: 2 } }');
    assert.equal(doodle.styles[1].property, 'x');
    let [nth] = parseCss(`@nth(1) { x: y }`);
    assert.equal(nth.raw(), '@nth(1) { x: y }');
});

test('cond segments record the spacing before them', () => {
    const segments = code => parseCss(code)[0].segments.map(n => [n.keyword || '()', n.spaced]);
    assert.deepEqual(
        segments(`@media screen and (min-width: 1px) { x: y }`),
        [['screen', true], ['and', true], ['()', true]]
    );
    assert.deepEqual(segments(`@container style(--x: 1) { x: y }`), [['style', true], ['()', false]]);
    assert.deepEqual(segments(`@nth(1) { x: y }`), [['()', false]]);
    assert.deepEqual(segments(`@nth not (1) { x: y }`), [['not', true], ['()', true]]);
});

test('argument text is built from tokens', () => {
    const argsOf = input => parseCss(input)[0].value[0][0].arguments.map(a => a.values);
    // comments go and whitespace collapses, quoted text stays as written
    assert.deepEqual(
        argsOf(`a: @p(a /* x */ b,\n  c   d, rgb(1, 2), "a  b");`),
        [[text('a b')], [text('c d')], [text('rgb(1, 2)')], [text('a  b')]]
    );
    // whitespace next to a function is kept: `a @r(1)` is not `a@r(1)`
    let [glued, spaced] = argsOf(`a: @p(a@r(1)b, a @r(1) b);`);
    assert.deepEqual([glued[0], glued[2]], [text('a'), text('b')]);
    assert.deepEqual([spaced[0], spaced[2]], [text('a '), text(' b')]);
    // so does the spacing of an at-rule prelude
    let [media] = parseCss(`@media (min-width: @calc(1)px) { x: y }`);
    let [prelude] = media.segments[0].arguments;
    assert.deepEqual([prelude.values[0], prelude.values[2]], [text('min-width: '), text('px')]);
});

test('a leading --name in an argument reads a variable', () => {
    const argsOf = input => parseCss(input)[0].value[0][0].arguments.map(a => a.values);
    assert.deepEqual(
        argsOf(`a: @p(--x, --x * 2, a --x, var(--x), --my_var-1);`),
        [
            [{ type: 'var', name: '--x' }],
            [{ type: 'var', name: '--x' }, text(' * 2')],
            [text('a --x')],
            [text('var(--x)')],
            [{ type: 'var', name: '--my_var-1' }],
        ]
    );
});

test('a wrapped --name still reads the variable', () => {
    const argOf = input => parseCss(input)[0].value[0][0].arguments[0];
    // `(--a)` keeps the whole value as one argument and reads it
    let arg = argOf(`width: @p((--a));`);
    assert.equal(arg.cluster, true);
    assert.deepEqual(arg.values, [{ type: 'var', name: '--a' }]);
    arg = argOf(`width: @p("--a");`);
    assert.deepEqual(arg.values, [{ type: 'var', name: '--a' }]);
    // text after the name stays text
    arg = argOf(`width: @p((--a px));`);
    assert.deepEqual(arg.values, [{ type: 'var', name: '--a' }, text(' px')]);
});

test('svg variable declarations become setters where they stand', () => {
    const valuesOf = input => parseCss(input)[0].value[0][0].arguments[0].values;
    // `--size: 10` is the internal `@--(size, 10)`, ahead of the reads after it
    let [head, set, rest] = valuesOf(`@content: @svg(--size: 10; viewBox: 0 0 $size $size;);`);
    assert.deepEqual(head, text('svg{'));
    assert.equal(set.name, '@--');
    assert.deepEqual(set.arguments.map(arg => arg.values), [[text('size')], [text('10')]]);
    assert.deepEqual(rest, text('viewBox:0 0 '));
    // inside elements and inline block values too
    let names = valuesOf(`@content: @svg(g { --r: 5; } rect { fill: defs linearGradient { --c: red } });`)
        .filter(v => v.name === '@--').map(v => v.arguments[0].values[0].value);
    assert.deepEqual(names, ['r', 'c']);
});

test('$ keeps its suffix as the unit', () => {
    const funcOf = input => parseCss(input)[0].value[0][0];
    let px = funcOf(`a: $px(1+1);`);
    assert.equal(px.name, '@$');
    assert.equal(px.unit, 'px');
    let bare = funcOf(`a: $(x);`);
    assert.equal(bare.name, '@$');
    assert.equal(bare.unit, undefined);
    // without an argument list the suffix is the expression itself
    let lone = funcOf(`a: $123;`);
    assert.equal(lone.name, '@$');
    assert.equal(lone.unit, undefined);
    assert.deepEqual(lone.arguments, [argument([text('123')])]);
});

test('a glued value is the size of a composable and an argument otherwise', () => {
    const funcOf = input => parseCss(input)[0].value[0][0];
    let doodle = funcOf(`a: @doodle100x50(x: y);`);
    assert.equal(doodle.name, '@doodle');
    assert.equal(doodle.size, '100x50');
    assert.deepEqual(doodle.arguments, [argument([text('x: y')])]);
    let m = funcOf(`a: @m2x3(1);`);
    assert.equal(m.size, undefined);
    assert.deepEqual(m.arguments[0], argument([text('2x3')]));
});

test('a . after a function name with no call after it is text', () => {
    const values = input => parseCss(input)[0].value[0].map(v => v.type === 'func' ? v.name : v.value);
    assert.deepEqual(values(`content: "x @i. y";`), ['"x ', '@i', '. y"']);
    assert.deepEqual(values(`content: @i...;`), ['@i', '...']);
    assert.deepEqual(values(`a: @abs.@sin(1)`), ['@abs']);
    assert.deepEqual(parseCss(`a: @i.5`)[0].value[0][0].arguments, [argument([text('.5')])]);
});

test('a ; inside an open paren stays in the value, as the browser reads it', () => {
    // `doodle(` without the @ used to end at the first `;`, leaving an
    // unbalanced value that swallowed every later rule in the browser
    let [rule, next] = parseCss(`background: doodle(a: 1; b: 2);\ncolor: red;`);
    assert.equal(rule.property, 'background');
    assert.equal(rule.value[0].map(v => v.value).join(''), 'doodle(a:1;b:2)');
    assert.equal(next.property, 'color');

    // parens inside quotes do not count
    let [content, color] = parseCss(`content: "("; color: blue;`);
    assert.equal(content.value[0][0].value, '"("');
    assert.equal(color.property, 'color');

    // a value that never closes its paren runs to the block end and warns
    let parsed = parseCss(`width: calc(1px; height: 2px;`);
    assert.equal(parsed.length, 1);
    assert.equal(parsed.warnings[0].message, 'unclosed (');
});

test('a < inside an open paren stays in the value', () => {
    // a range query in CSS if() used to end the value at the `<`
    let [rule, next] = parseCss(`color: if(media(width < 600px): red; else: blue); background: tan;`);
    assert.equal(rule.value[0].map(v => v.value).join(''), 'if(media(width < 600px):red;else:blue)');
    assert.equal(next.property, 'background');
    // a tag after a value still ends it
    let [color] = parseCss(`color: red</style>`);
    assert.equal(color.value[0][0].value, 'red');
});

test('a statement without a colon warns instead of passing through as an at-rule', () => {
    // `color red;` used to be emitted verbatim, where the browser ate the rule after it
    let parsed = parseCss(`color red; width: 1px; @import url(x);`);
    assert.deepEqual(parsed.map(r => r.property || r.value), ['width', '@import url(x);']);
    assert.deepEqual(parsed.warnings, [{ message: 'missing ":" in "color red"', pos: [0, 0] }]);
});

test('a block after a property and a function name warns and is dropped', () => {
    let parsed = parseCss(`background: @doodle { @grid: 2; } color: blue;`);
    assert.deepEqual(parsed.map(r => r.property || r.type), ['pseudo', 'color']);
    assert.deepEqual(parsed[0].selectors, []);
    assert.deepEqual(parsed.warnings.map(w => w.message), ['@doodle needs ( ), not { }']);
});

test('a comment inside a selector list is not a selector', () => {
    let [pseudo] = parseCss(`:before, /* :after, */ :hover { x: y }`);
    assert.deepEqual(pseudo.selectors, ['&:before', '&:hover']);
    let [quoted] = parseCss(`[title="a /* b */ c"] { x: y }`);
    assert.deepEqual(quoted.selectors, ['& [title="a /* b */ c"]']);
});

test('unbalanced parens, quotes and braces warn instead of silently dropping the rest', () => {
    const messages = code => parseCss(code).warnings.map(w => w.message);
    assert.deepEqual(messages(`@nth(1 { color: red; } width: 2px;`), ['unbalanced ( or quote in "@nth(1{color:red;}width:2px;"']);
    assert.deepEqual(messages(`:a { :b { x: y`), ['unclosed {', 'unclosed {']);
    assert.deepEqual(messages(`content: "oops; color: red;`), ['unclosed quote']);
    assert.deepEqual(messages(`background: @pattern(fill: red`), ['unclosed (']);
});

test('π inside a quoted string stays as written', () => {
    assert.deepEqual(ast(`content: "π"; --a: π;`), [rule('content', text('"π"')), rule('--a', text(String(Math.PI)))]);
    let [p] = parseCss(`content: @p("π", π);`);
    assert.deepEqual(p.value[0][0].arguments.map(a => a.values[0].value), ['π', String(Math.PI)]);
});

test('π touching a digit or after a name stays for the expression to multiply', () => {
    assert.deepEqual(ast(`--a: π2; --b: 2π; --c: π x; --d: kπ;`), [rule('--a', text('π2')), rule('--b', text('2π')), rule('--c', text(String(Math.PI) + ' x')), rule('--d', text('kπ'))]);
    let [p] = parseCss(`content: @p(π2, π);`);
    assert.deepEqual(p.value[0][0].arguments.map(a => a.values[0].value), ['π2', String(Math.PI)]);
    let [q] = parseCss(`background: @pattern(a: π2; b: π;);`);
    assert.equal(q.value[0][0].arguments[0].values[0].value, `a: π2; b: ${Math.PI};`);
    assert.equal(paintOf(`--k: 3; @content: @pattern(fill: $kπ);`), 'fill: $kπ');
});

test('a < in a value is text unless a tag follows', () => {
    assert.deepEqual(ast(`--c: a < b; --d: 1 <= 2; color: red</style>`), [
        rule('--c', text('a < b')), rule('--d', text('1 <= 2')), rule('color', text('red')),
    ]);
    let parsed = parseCss(`--x: 1; <!-- c --> color: red; <foo`);
    assert.deepEqual(parsed.map(r => r.property), ['--x', 'color']);
    assert.deepEqual(parsed.warnings, [{ message: 'unclosed tag', pos: [31, 0] }]);
});

test('a user function call parses as its body written inline', () => {
    assert.deepEqual(ast(`--twice(x): { $(x * 2) } width: $twice(3)px;`), ast(`width: $((3) * 2)px;`));
    // the body can be @svg elements, *N copies included
    assert.deepEqual(
        ast(`--dot(r, c): { circle { r: $r; fill: $c } } background: @svg($dot(2, rgb(0, 0, 1)) $dot(3, red));`),
        ast(`background: @svg(circle { r: 2; fill: rgb(0, 0, 1) } circle { r: 3; fill: red });`));
    assert.deepEqual(
        ast(`--bars(m): { rect*$(m) { x: $(@n / m) } } background: @svg($bars(4));`),
        ast(`background: @svg(rect*$((4)) { x: $(@n / (4)) });`));
    // quoted text stays as written
    assert.deepEqual(ast(`--f(): { red } content: "$f()"; color: $f();`), ast(`content: "$f()"; color: red;`));
    assert.deepEqual(ast('--f(): { red } content: `$f()`;'), ast('content: `$f()`;'));
});

test('a user function is called with parens, and with $ outside math', () => {
    // without parens $f reads the variable --f, and @f is a built-in call
    assert.deepEqual(ast(`--f(): red; --f: 1; a: $f; b: $f(); c: @f();`), ast(`--f: 1; a: $f; b: red; c: @f();`));
    // a name that isn't defined stays a unit
    assert.deepEqual(ast(`--f(x): [$x]; a: $px(1 + 1); b: $g(2);`), ast(`a: $px(1 + 1); b: $g(2);`));
});

test('$name( calls the function even where a parameter shares its name', () => {
    assert.deepEqual(
        ast(`--two(x): $(x * 2); --c(two = 0): { path { d: M $two(5) $two } } background: @svg($c(100));`),
        ast(`background: @svg(path { d: M $((5) * 2) 100 });`));
    // the parameter is passed into the call as $two
    assert.deepEqual(ast(`--g(a): $(a * 3); --f(g): $g($g); width: $f(2)px;`), ast(`width: $((2) * 3)px;`));
});

test('user function arguments', () => {
    // a call inside an argument expands first, where it is written
    assert.deepEqual(
        ast(`--a(x): { $b($x) } --b(y): { $(y + 1) } width: $a($b(1));`),
        ast(`width: $(($((1) + 1)) + 1);`));
    // @n and sin() keep their names even when a parameter shares them
    assert.deepEqual(ast(`--f(n, sin): { $(@n + sin(n)) } width: $f(2, 3);`), ast(`width: $(@n + sin((2)));`));
    // only top-level commas split, and a missing argument is empty
    assert.deepEqual(ast(`--f(a, b): { $a|$b } x: $f(rgb(1, 2, 3)); y: $f(1, 2);`), ast(`x: rgb(1, 2, 3)|; y: 1|2;`));
    assert.deepEqual(
        ast(`--f(k): $($k * 10) $k * 10; width: $f(@i - 1);`),
        ast(`width: $((@i - 1) * 10) @i - 1 * 10;`));
});

test('a user function name can start with _', () => {
    assert.deepEqual(ast(`--_f(x): $(x * 2); --f_(y): { $y } w: $_f(3); v: $f_(1);`), ast(`w: $((3) * 2); v: 1;`));
    assert.equal(parseCss(`w: $_f(3);`)[0].value[0][0].unit, '_f');
});

test('a user function parameter can have a default', () => {
    // a call that stops short takes the defaults of the rest, pasted as written
    assert.deepEqual(
        ast(`--f(a, b = 2, c = $w): { $a|$b|$c } x: $f(1); y: $f(1, 3); z: $f(1, 3, 4);`),
        ast(`x: 1|2|$w; y: 1|3|$w; z: 1|3|4;`));
    // a call without arguments takes them all; inside $() a default is parenthesized
    assert.deepEqual(ast(`--k(n = @r(2, 3)): $(n * 3); width: $k();`), ast(`width: $((@r(2, 3)) * 3);`));
    // the `=` before a default comes first, one inside it stays
    assert.deepEqual(ast(`--k(n = $(2 = 2)): [$n]; width: $k();`), ast(`width: [$(2 = 2)];`));
});

test('a user function call with too many or too few arguments warns', () => {
    let warnings = code => parseCss(code).warnings.map(w => w.message);
    assert.deepEqual(warnings(`--f(k): $(k * 10); a: $f(1, 2, 3);`), ['$f(k): too many args']);
    assert.deepEqual(warnings(`--f(a, b, c = 3): $(a + b); a: $f(1);`), ['$f() is missing b']);
    assert.deepEqual(warnings(`--f(a, b = 2): [$a|$b]; --g(): red; a: $f(1); b: $f(, 2); c: $f(1, ); d: $g();`), []);
});

test('a user function calling itself warns and expands to nothing', () => {
    let code = `--f(x): { [$g($x)] } --g(x): { $f($x) } width: $f(1);`;
    assert.deepEqual(parseCss(code).warnings.map(w => w.message), ['$f() calls itself']);
    assert.deepEqual(ast(code), ast(`width: [];`));
});

test('only a top-level --name(params): { } is a user function definition', () => {
    // inside a block it is still a declaration
    assert.equal(ast(`@at(1, 1) { --f(x): red }`)[0].styles[0].property, '--f(x)');
    // a definition alone emits nothing
    assert.deepEqual(ast(`--f(x): { color: $x }`), []);
    // the space kept before `:` doesn't stop it
    assert.deepEqual(ast(`--twice(x) : $(x * 2); width: $twice(3)px;`), ast(`width: $((3) * 2)px;`));
    // without the dashes it stays a nested selector
    assert.equal(ast(`f(x): { color: red }`)[0].selector, 'f(x):');
});

test('an @svg() body defines user functions of its own, at any statement', () => {
    assert.deepEqual(
        ast(`a: @svg(svg { --d(r): circle { r: $r } $d(1) g { --c(): blue; $d($c()) } });`),
        ast(`a: @svg(svg { circle { r: 1 } g { circle { r: blue } } });`));
    // seen in that @svg only, where it hides a sheet function and calls the others
    assert.deepEqual(
        ast(`--c(): red; --k(): 2; a: @svg(rect { fill: $c() }); b: @svg(--c(): blue; rect { fill: $c(); x: $k() });`),
        ast(`a: @svg(rect { fill: red }); b: @svg(rect { fill: blue; x: 2 });`));
});

test('a user function body without braces is one statement', () => {
    // up to its `;`, or through the block it opens
    assert.deepEqual(
        ast(`--twice(x): $(x * 2); --dot(r, c): circle { r: $r; fill: $c } width: $twice(3)px; background: @svg($dot(2, red));`),
        ast(`width: $((3) * 2)px; background: @svg(circle { r: 2; fill: red });`));
    // a block inside parens does not end it
    assert.deepEqual(ast(`--pic(c): @svg(circle { fill: $c }); background: $pic(red);`), ast(`background: @svg(circle { fill: red });`));
    assert.deepEqual(ast(`--f(a): $(a*2); width: $f(@r(9));`), ast(`width: $((@r(9))*2);`));
});

test('a statement reading the parameters of the body without braces before it warns', () => {
    let warnings = code => parseCss(code).warnings.map(w => w.message);
    assert.deepEqual(warnings(`--f(x): width: $x; height: $x; $f(1px);`), ['--f(): body needs { }']);
    assert.deepEqual(warnings(`--f(bx, w): M $(bx - w) 0; --d: L $(bx + w) 0;`), ['--f(): body needs { }']);
    assert.deepEqual(warnings(`--f(x): width: $x; /* next */ --g(x): height: $x;`), []);
    assert.deepEqual(warnings(`--c: red; --f(c): fill: $c; background: $c;`), []);
    assert.deepEqual(warnings(`--f(x): { width: $x } height: $x;`), []);
});

test('a user function name is read whole', () => {
    // a call to rand-int is not a call to rand
    assert.deepEqual(ast(`--rand(x): [$x]; width: $rand-int(1, 3);`), ast(`width: $rand-int(1, 3);`));
    // digits and a - between words are part of the name
    assert.deepEqual(ast(`--f2(x): [$x]; --my-dot(r): <$r>; a: $f2(3); b: $my-dot(4);`), ast(`a: [3]; b: <4>;`));
    // a - before a number is not
    assert.deepEqual(ast(`--k(x = 2): $x; a: $(k-1(5));`), ast(`a: $(k-1(5));`));
    // nor eaten by a parameter that names its start
    assert.deepEqual(ast(`--rand-int(a): [$a]; --f(rand): $rand-int(1); width: $f(5);`), ast(`width: [1];`));
});

test('a user function parameter name is read whole', () => {
    // $x1 is not $x followed by 1
    assert.deepEqual(ast(`--f(x): [$x1|$x]; width: $f(5);`), ast(`width: [$x1|5];`));
    // names with digits and _ bind, in and out of $()
    assert.deepEqual(
        ast(`--f(a1, a_b, _c): [$a1|$a_b|$_c] $(a1 + a_b + _c2); width: $f(1, 2, 3);`),
        ast(`width: [1|2|3] $((1) + (2) + _c2);`));
});

test('a user function parameter binds bare inside $() with a unit, and in the calls there', () => {
    assert.deepEqual(
        ast(`--f(x): $px(x) $4(x + 1) $%(x) rgb(x); width: $f(5);`),
        ast(`width: $px((5)) $4((5) + 1) $%((5)) rgb(x);`));
    assert.deepEqual(
        ast(`--g(c): [$c]; --f(c): $g(c) $g($c) $(c + $g(c)); width: $f(red);`),
        ast(`width: [c] [red] $((red) + ([((red))]));`));
});

test('a call inside $() reads its body as math, as one value', () => {
    assert.deepEqual(
        ast(`--h(x): x * 2 + $x; width: $(1 + $h(@x - 1) * 3);`),
        ast(`width: $(1 + ((@x - 1) * 2 + (@x - 1)) * 3);`));
    assert.deepEqual(
        ast(`--h(x): x + 1; --b(x): $h(x) * 2; width: $($b(@y));`),
        ast(`width: $(((((@y)) + 1) * 2));`));
    assert.deepEqual(ast(`--n(): foo; width: $($n());`), ast(`width: $(foo);`));
    assert.deepEqual(ast(`--h(x): x + $x; width: $h(2);`), ast(`width: x + 2;`));
});

test('a bare name( calls the user function where a bare parameter binds, unless a built-in has its name', () => {
    assert.deepEqual(
        ast(`--h(x): x + 1; a: $(2 * h(3)); b: $px(h(1)); @match(h(i) > 2) { color: red }`),
        ast(`a: $(2 * ((3) + 1)); b: $px(((1) + 1)); @match(((i) + 1) > 2) { color: red }`));
    // in a body called there, and for a function passed by name
    assert.deepEqual(
        ast(`--h(x): x + 1; --g(x): h(x) * 2; --lit(f): $($f(1) - $f(2)); a: $($g(@y)); b: $lit(h);`),
        ast(`a: $(((((@y)) + 1) * 2)); b: $(((1) + 1) - ((2) + 1));`));
    // elsewhere it is text, @pattern and @scene included
    assert.deepEqual(ast(`--h(x): x + 1; a: h(3); b: @match(h(1), 1, 2);`), ast(`a: h(3); b: @match(h(1), 1, 2);`));
    assert.deepEqual(
        ast(`--h(x): x + 1; @content: @pattern(fill: h(1) + $h(2););`),
        ast(`@content: @pattern(fill: h(1) + (2 + 1););`));
    // a built-in wins, and $ still calls the definition
    assert.deepEqual(
        ast(`--sin(x): 0; --pick(x): 1; a: $(sin(1) + $sin(1) + pick(2: 3, 4));`),
        ast(`a: $(sin(1) + 0 + pick(2: 3, 4));`));
    // the longest defined name wins, as in calc: b-h(1) is b - h(1)
    assert.deepEqual(
        ast(`--h(x): [x]; --a-h(x): <x>; a: $(b-h(1) + a-h(2) + @h(3) + $h + x2h(4) + 2h(5));`),
        ast(`a: $(b-([(1)]) + (<(2)>) + @h(3) + $h + x2h(4) + 2([(5)]));`));
});

test('the test of a @match(test) { } block reads as math, the @match() value function\'s does not', () => {
    assert.deepEqual(
        ast(`--far(n): pick(n: 1, 6); background: @svg(g*4 { @match($far(@n) > 2) { rect {} } });`),
        ast(`background: @svg(g*4 { @match((pick((@n): 1, 6)) > 2) { rect {} } });`));
    assert.deepEqual(
        ast(`--f(n): { @match(n > 2) { color: red } } $f(@i);`),
        ast(`@match((@i) > 2) { color: red }`));
    assert.deepEqual(ast(`--f(n): @match(n > 2, red, n); color: $f(1);`), ast(`color: @match(n > 2, red, n);`));
});

test('@pick and @p split an index off their first argument at a colon', () => {
    let pick = code => {
        let [func] = parseCss(`a: ${code};`)[0].value[0];
        return [func.at ?? false, func.arguments.map(arg => arg.values.map(v => v.value ?? v.name).join(''))];
    };
    assert.deepEqual(pick('@pick(x + y: red, blue)'), [true, ['x + y', 'red', 'blue']]);
    assert.deepEqual(pick('@p(@i: a b, c)')[0], true);
    // a quoted colon is text, and so is a colon past the first argument
    assert.deepEqual(pick(`@pick('a:b', c)`), [false, ['a:b', 'c']]);
    assert.deepEqual(pick('@pick(a, b: c)'), [false, ['a', 'b: c']]);
    // the rest of the family reads the colon as written
    assert.deepEqual(pick('@pn(k: a, b)'), [false, ['k: a', 'b']]);
});

test('a user function definition and call skip quoted text', () => {
    // a ; or } in quotes ends neither the statement nor the body
    assert.equal(ast(`content: "a;--f(x): b";`)[0].value[0][0].value, '"a;--f(x): b"');
    assert.deepEqual(
        ast(`--f(x): content: "$x;}"; --g(y): { content: "}" $y } a: $f(1); b: $g(2);`),
        ast(`a: content: "1;}"; b: content: "}" 2;`));
    // a comma or ) in quotes doesn't split or close the arguments
    assert.deepEqual(ast(`--f(x, y): [$x|$y]; a: $f("a,b", "c)d");`), ast(`a: ["a,b"|"c)d"];`));
});

// the body of the first @pattern or @scene, as the preprocessor leaves it, spaces collapsed
const paintOf = code => {
    let find = n => Array.isArray(n) ? n.flatMap(find) : n && typeof n === 'object'
        ? (n.type === 'func' && /^@(pattern|scene)/.test(n.name) ? [n] : Object.values(n).flatMap(find)) : [];
    let [f] = find(parseCss(code));
    return f.arguments.map(a => a.values.map(v => v.value).join('')).join(',').replace(/\s+/g, ' ').trim();
};

test('in @pattern and @scene a user function argument is one value', () => {
    // a compound argument keeps its parentheses, a name or a number reads as written
    assert.equal(paintOf(`--f(a, b): $a * $b; @content: @pattern(fill: $f(x + 1, uv.x););`),
        'fill: (x + 1) * uv.x;');
    assert.equal(paintOf(`--f(a): $a ** 2; @content: @scene(k: $f(-1); sphere { r: k });`),
        'k: (-1) ** 2; sphere { r: k }');
    // in CSS it is pasted as before
    assert.deepEqual(ast(`--f(a, b): $a * $b; width: $f(1 + 1, 2);`), ast(`width: 1 + 1 * 2;`));
    // after a number it multiplies, so a number argument stays apart
    assert.equal(paintOf(`--f(a): .5a + 2$a + a; @content: @pattern(fill: $f(.4););`), 'fill: .5(.4) + 2(.4) + .4;');
    // so does a number the call gives
    assert.equal(paintOf(`--k(): 3; --f(x): x; @content: @pattern(fill: 2$k() + $f(2)$f(.5););`), 'fill: 2(3) + 2(.5);');
});

test('in @pattern and @scene an expression body is one value next to other terms', () => {
    let h = `--h(x): -.07 + .045 * x;`;
    assert.equal(paintOf(`${h} @content: @pattern(fill: vec3($h(1) - $h(2)););`),
        'fill: vec3((-.07 + .045 * 1) - (-.07 + .045 * 2));');
    assert.equal(paintOf(`${h} @content: @pattern(match { $h(1) - $h(2) > 0 { fill: 1; } });`),
        'match { (-.07 + .045 * 1) - (-.07 + .045 * 2) > 0 { fill: 1; } }');
    assert.equal(paintOf(`${h} --g(x): $h(x) * 2; @content: @pattern(fill: $g(1););`),
        'fill: (-.07 + .045 * 1) * 2;');
    // the whole value, an argument or a statement's head reads as written
    assert.equal(paintOf(`${h} @content: @pattern(fill: $h(1););`), 'fill: -.07 + .045 * 1;');
    assert.equal(paintOf(`${h} @content: @pattern(fill: sin($h(1)););`), 'fill: sin(-.07 + .045 * 1);');
    assert.equal(paintOf(`--s(): sphere; @content: @scene($s() { r: .5 });`), 'sphere { r: .5 }');
});

test('a function that assigns result runs its statements before the statement calling it', () => {
    let code = `--perlin(p): { pi: floor($p); pf: fract($p); result: pf * pi; };
        @content: @pattern(pi: 3; b: $perlin(uv * 4) + $perlin(pi); fill: b;);`;
    // a compound argument is computed once into a name of the call's own, its
    // names are its own, so the caller's pi stays 3, and its result takes the call's place
    assert.equal(paintOf(code), [
        'pi: 3;perlin_1_p: uv * 4; perlin_1_pi: floor(perlin_1_p); perlin_1_pf: fract(perlin_1_p); perlin_1_result: perlin_1_pf * perlin_1_pi;',
        'perlin_2_pi: floor(pi); perlin_2_pf: fract(pi); perlin_2_result: perlin_2_pf * perlin_2_pi;',
        'b: perlin_1_result + perlin_2_result; fill: b;',
    ].join(' '));
});

test('the last result a call runs is its value, in a block too', () => {
    assert.equal(paintOf(`--f(): { a: 1; result: a; result: a + 1; }; @content: @pattern(fill: $f(););`),
        'f_1_a: 1; f_1_result: f_1_a; f_1_result: f_1_a + 1; fill: f_1_result;');
    assert.equal(paintOf(`--inside(p): { d: length($p) - .5; result: 0; match(d < 0) { result: 1; } };
        @content: @pattern(fill: $inside(uv - .5););`),
        'inside_1_p: uv - .5; inside_1_d: length(inside_1_p) - .5; inside_1_result: 0; match(inside_1_d < 0) { inside_1_result: 1; } fill: inside_1_result;');
    // a body of one statement, unbraced, and the ; after the last one is optional
    assert.equal(paintOf(`--f(x): result: $x * 2; @content: @pattern(fill: $f(uv.x + 1););`),
        'f_1_x: uv.x + 1; f_1_result: f_1_x * 2; fill: f_1_result;');
    assert.equal(paintOf(`--f(): { a: 1; result: a }; @content: @pattern(fill: $f(););`),
        'f_1_a: 1; f_1_result: f_1_a; fill: f_1_result;');
});

test('in @scene a value function\'s match block becomes values', () => {
    assert.equal(paintOf(`--skin(q): { result: #c99; match { q.y > .2 { result: #eee; } } };
        @content: @scene(sphere { fill: $skin(p * 2) });`), [
        'sphere {skin_1_q: p * 2; skin_1_result: #c99; skin_1_1: match((skin_1_q.y > .2), 1, 0);',
        'skin_1_result: match(skin_1_1 == 1, #eee, skin_1_result); fill: skin_1_result }',
    ].join(' '));
    assert.equal(paintOf(`--f(c): { match { a { result: 1; } else { match(b) { k: 2; $c: k; } result: 0; } } };
        @content: @scene(w: 1; sphere { r: $f(w) });`), [
        'w: 1; sphere {f_1_1: match((a), 1, 2); f_1_result: 1; f_1_2: match((b), 1, 0); f_1_k: 2;',
        'w: match(f_1_1 == 2 && f_1_2 == 1, f_1_k, w); f_1_result: match(f_1_1 == 2, 0, f_1_result); r: f_1_result }',
    ].join(' '));
    assert.equal(paintOf(`--f(): { match(a) { result: 1; } }; @content: @pattern(fill: $f(););`),
        'match(a) { f_1_result: 1; } fill: f_1_result;');
    assert.equal(paintOf(`--g(c): { $c: 9; result: 1 }; --f(c): { result: .3; match { $c > 5 { k: $g($c); } } };
        @content: @scene(w: 1; sphere { r: $f(w) * w });`), [
        'w: 1; sphere {f_1_result: .3; f_1_1: match((w > 5), 1, 0); w: match(f_1_1 == 1, 9, w);',
        'g_2_result: 1; f_1_k: g_2_result; r: f_1_result * w }',
    ].join(' '));
});

test('a value function reads the caller until it assigns a name, and writes the caller only through $p:', () => {
    assert.equal(paintOf(`--f(): { w: w + 1; result: w * 2; }; @content: @pattern(w: 1; fill: $f(););`),
        'w: 1;f_1_w: w + 1; f_1_result: f_1_w * 2; fill: f_1_result;');
    // a parameter it assigns writes the variable passed for it
    assert.equal(paintOf(`--f(out): { $out: 1; result: 2; }; @content: @pattern(n: 0; fill: $f(n) + n;);`),
        'n: 0;n: 1; f_1_result: 2; fill: f_1_result + n;');
    // the same for a parameter named over several tokens
    assert.equal(paintOf(`--f(x1): { $x1: 1; result: 2; }; @content: @pattern(n: 0; fill: $f(n) + n;);`),
        'n: 0;n: 1; f_1_result: 2; fill: f_1_result + n;');
    // a color's digits are no names, whatever it calls its own
    assert.equal(paintOf(`--f(): { a: 1; e: 2; result: mix(#e0402a, #fae, a / e); }; @content: @pattern(fill: $f(););`),
        'f_1_a: 1; f_1_e: 2; f_1_result: mix(#e0402a, #fae, f_1_a / f_1_e); fill: f_1_result;');
    assert.equal(paintOf(`--f(q): { q.y: abs(q.y); result: q; }; @content: @pattern(fill: $f(pos), 0;);`),
        'f_1_q: pos; f_1_q.y: abs(pos.y); f_1_result: f_1_q; fill: f_1_result, 0;');
    // a loop name and the names in a block are its own too
    assert.equal(paintOf(`--sum(n): { s: 0; repeat(4 as k) { s: s + k * $n; } result: s; }; @content: @pattern(fill: $sum(.1););`),
        'sum_1_s: 0; repeat(4 as sum_1_k) { sum_1_s: sum_1_s + sum_1_k * .1; } sum_1_result: sum_1_s; fill: sum_1_result;');
});

test('value calls nest: in arguments, in bodies, in block heads', () => {
    let code = `--twice(x): { y: 2 * $x; result: y; }; --sq(x): $x * $x;
        @content: @pattern(match($twice(1) > 1) { fill: $sq($twice(uv.x + 1)); });`;
    assert.equal(paintOf(code), [
        'twice_1_y: 2 * 1; twice_1_result: twice_1_y;',
        'match(twice_1_result > 1) {twice_2_x: uv.x + 1; twice_2_y: 2 * twice_2_x; twice_2_result: twice_2_y; fill: twice_2_result * twice_2_result; }',
    ].join(' '));
});

test('in CSS a body of result declarations alone reads as the last one\'s value', () => {
    assert.deepEqual(ast(`--double(x): { result: $(x * 2); } width: $double(2)px;`), ast(`width: $((2) * 2)px;`));
    assert.deepEqual(ast(`--f(x): { result: 1; result: $x; } a: $f(red);`), ast(`a: red;`));
    assert.deepEqual(ast(`--f(x): result: $x; a: $f("a;b");`), ast(`a: "a;b";`));
    // with anything else it pastes, so an @svg-filter element keeps its result
    assert.deepEqual(ast(`--fx(): { in: a; result: b; } a: $fx();`), ast(`a: in: a; result: b;`));
});

test('in @pattern and @scene a parameter reads bare, as a name of the function\'s own', () => {
    // compound arguments once, swizzles kept, a call of the same name left alone
    assert.equal(paintOf(`--n(p): { f: fract(p); result: f.x * p.y; }; @content: @pattern(fill: $n(uv * 4););`),
        'n_1_p: uv * 4; n_1_f: fract(n_1_p); n_1_result: n_1_f.x * n_1_p.y; fill: n_1_result;');
    assert.equal(paintOf(`--sq(a): a * a; --g(mix): mix(mix, 1, .5); @content: @pattern(fill: $sq(x + 1) + $g(uv.x););`),
        'fill: ((x + 1) * (x + 1)) + (mix(uv.x, 1, .5));');
    // assigning it changes the function's copy, $p: the caller's variable
    assert.equal(paintOf(`--f(p): { p: p * 2; result: p + 1; }; @content: @pattern(n: 1; fill: $f(n) + n;);`),
        'n: 1;f_1_p: n * 2; f_1_result: f_1_p + 1; fill: f_1_result + n;');
    assert.equal(paintOf(`--f(out): { $out: 1; result: out * 2; }; @content: @pattern(n: 0; fill: $f(n););`),
        'n: 0;n: 1; f_1_result: n * 2; fill: f_1_result;');
    // it hides a built-in of its name, and a loop name hides it
    assert.equal(paintOf(`--f(x): x * 2; @content: @pattern(fill: $f(uv.y););`), 'fill: uv.y * 2;');
    // not as the end of a longer name
    assert.equal(paintOf(`--f(p): { q_p: p * 2; result: q_p.x; }; @content: @pattern(fill: $f(uv););`),
        'f_1_q_p: uv * 2; f_1_result: f_1_q_p.x; fill: f_1_result;');
    assert.equal(paintOf(`--f(k): { t: 0; repeat(4 as k) { t: t + k; } result: t; }; @content: @pattern(fill: $f(9););`),
        'f_1_t: 0; repeat(4 as f_1_k) { f_1_t: f_1_t + f_1_k; } f_1_result: f_1_t; fill: f_1_result;');
    // not in a color's digits, a texture's CSS, or as the name a statement sets
    assert.equal(paintOf(`--f(a, e): mix(#e0402a, #fae, a / e); @content: @pattern(fill: $f(1, 2););`),
        'fill: mix(#e0402a, #fae, 1 / 2);');
    assert.equal(paintOf(`--paint(c): { texture_0 { background: c; } fill: c; }; @content: @pattern($paint(#f00));`),
        'texture_0 { background: c; } fill: #f00;');
    assert.equal(paintOf(`--ball(r): sphere { r: r; }; @content: @scene($ball(.5 + .1));`), 'sphere { r: (.5 + .1); }');
    // in CSS a bare word stays text
    assert.deepEqual(ast(`--f(fill): fill: $fill; a { $f(red) }`), ast(`a { fill: red; }`));
});

test('a value function cannot run in a repeat() head or a match arm test', () => {
    let code = `--f(): { a: 1; result: a; }; @content: @pattern(repeat(4, $f() > 1) { x: 1; } match { $f() > 0 { fill: 1; } });`;
    assert.deepEqual(parseCss(code).warnings.map(w => w.message), [
        '$f() runs statements; use it as one',
        '$f() runs statements; use it as one',
    ]);
});

test('a body of statements alone still writes the caller\'s names, and comments stay comments', () => {
    assert.equal(paintOf(`--setup(): { a: 1; b: a + 1; }; @content: @pattern($setup() fill: b;);`),
        'a: 1; b: a + 1; fill: b;');
    // without result a body ending in an expression is statements too, as before
    assert.equal(paintOf(`--g(): { a: 1; a + 1 }; @content: @pattern(fill: 1; $g());`), 'fill: 1; a: 1; a + 1');
    // // starts a comment in a body, quotes and all
    assert.equal(paintOf(`--f(): { a: 1; result: a; }; @content: @pattern(// don't call $f()
        fill: $f(););`), "f_1_a: 1; f_1_result: f_1_a; // don't call $f() fill: f_1_result;");
    // a texture holds a doodle, where calls are CSS
    assert.equal(paintOf(`--f(a, b): $a * $b; @content: @pattern(texture_0 { width: $f(1 + 1, 2)px; } fill: 1;);`),
        'texture_0 { width: 1 + 1 * 2px; } fill: 1;');
});

test('text pulled in by @use calls the user functions around it and keeps its own', () => {
    let vars = {
        '--a': 'width: $twice(2)px;',
        '--b': '--half(x): [$x]; height: $half(4);',
        '--c': 'top: $half(1);',
    };
    let extra = { getVariable: name => vars[name] || '' };
    let main = `--twice(x): $(x * 2); @use: var(--a);`;
    assert.deepEqual(ast(main, extra), ast(`width: $((2) * 2)px;`));
    // half() is seen inside --b only: not by --c nor the main sheet
    let [height, top, left] = ast(`@use: var(--b), var(--c); left: $half(1);`, extra);
    assert.deepEqual(height.value, [[{ type: 'text', value: '[4]' }]]);
    // so they stay $ with the unit half
    assert.equal(top.value[0][0].unit, 'half');
    assert.equal(left.value[0][0].unit, 'half');
});
