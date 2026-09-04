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
});

test('quoted content inside an @svg argument', () => {
    const content = value => [rule('@content', {
        type: 'func',
        index: 10,
        name: '@svg',
        arguments: [argument([text(`text { content: "${value}"; }`)])],
        variables: {},
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

test('raw() and rawValue() span the source text', () => {
    let [seed] = parseCss(`@seed: 42;`);
    assert.equal(seed.rawValue(), '42');
    assert.equal(seed.raw(), '@seed: 42');

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
    assert.deepEqual(args(`width: @p(±2@r(10), 1);`).map(a => shape(a.values)), [['-2', '@r'], ['2', '@r'], [1]]);

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

test('@pattern bodies are kept verbatim like @doodle', () => {
    let [rule] = parseCss(`background: @pattern(grid: 2; fill: @p(red, blue););`);
    let [arg] = rule.value[0][0].arguments;
    assert.equal(arg.values.length, 1);
    assert.equal(arg.values[0].value, 'grid: 2; fill: @p(red, blue);');
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

test('svg variable declarations stay text inside @svg', () => {
    const funcOf = input => parseCss(input)[0].value[0][0];
    // `--size:` at the head of the argument declares, it is not a var read
    let func = funcOf(`@content: @svg(--size: 10; viewBox: 0 0 $size $size;);`);
    assert.equal(func.variables['--size'].length, 1);
    let head = func.arguments[0].values[0];
    assert.equal(head.type, 'text');
    assert.ok(head.value.startsWith('--size'));
    // a plain `--name` argument still reads
    let read = funcOf(`width: @rand(--a);`);
    assert.deepEqual(read.arguments[0].values[0], { type: 'var', name: '--a' });
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
    assert.equal(parsed.warnings[0].message, 'unclosed ( in value');
});
