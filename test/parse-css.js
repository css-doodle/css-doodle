import test from 'node:test';
import assert from 'node:assert/strict';

import parseCSS from '../src/parser/parse-css.js';
import compare from './_compare.js';

compare.use(input => {
    return JSON.parse(JSON.stringify(parseCSS(input)));
});

function text(value) {
    return { type: 'text', value };
}

function argument(values, cluster = false) {
    return { values, cluster };
}

test('pseudo quotes', () => {

    function getValue(value) {
        return [
            {
                "type": "pseudo",
                "selector": ":after",
                "selectors": ["&:after"],
                "styles": [
                    {
                        "type": "rule",
                        "property": "content",
                        "value": [
                            [
                                text(`\"${value}\"`)
                            ]
                        ]
                    }
                ]
            }
        ]
    }

    compare(
        `:after { content: ""; }`,
        getValue("")
    );

    compare(
        `:after { content: "x"; }`,
        getValue("x")
    );

    compare(
        `:after { content: ")"; }`,
        getValue(")")
    );

    compare(
        `:after { content: "("; }`,
        getValue("(")
    );

    compare(
        `:after { content: "}"; }`,
        getValue("}")
    );

    compare(
        `:after { content: ";"; }`,
        getValue(";")
    );

    compare(
        `:after { content: "()"; }`,
        getValue("()")
    );

    compare(
        `:after { content: "'"; }`,
        getValue("'")
    );

    compare(
        `:after { content: "x;"; }`,
        getValue("x;")
    );

    compare(
        `:after { content: "x;";;; }`,
        getValue("x;")
    );

    // escaped quotes stay inside the string instead of terminating it
    compare(
        `:after { content: "a\\"b"; }`,
        getValue(`a\\"b`)
    );

});

test('quotes in SVG', () => {
    function getValue(value) {
        return [
            {
                "type": "rule",
                "property": "@content",
                "value": [
                    [
                        {
                            "type": "func",
                            "index": 10,
                            "name": "@svg",
                            "arguments": [
                                argument([
                                    text(`text { content: \"${value}\"; }`)
                                ])
                            ],
                            "variables": {},
                            "position": 1
                        }
                    ]
                ]
            }
        ];
    }

    compare(
        `@content: @svg( text { content: ""; } )`,
        getValue(""),
    );

    compare(
        `@content: @svg( text { content: "}"; })`,
        getValue("}"),
    );

});

test('quotes in content', () => {

    function getValue(value) {
        return [
            {
                "type": "rule",
                "property": '@content',
                "value": [
                    [
                        text(`${value}`)
                    ]
                ],
            }
        ];
    }

    compare(
        `@content: hello;`,
        getValue('hello')
    );

    compare(
        `@content: "hello";`,
        getValue('"hello"')
    )

});

test('calc argument with adjacent paren groups', () => {

    function argTextOf(input) {
        let func = parseCSS(input)[0].value[0][0];
        return func.arguments[0].values[0].value;
    }

    // Only a pair that wraps the whole argument should be stripped. Here the
    // leading `(` and trailing `)` belong to separate groups, so they must stay.
    compare(`width: $((5) % (3));`, '(5) % (3)', false, argTextOf);
    compare(`width: $((5 + 20) % (3));`, '(5 + 20) % (3)', false, argTextOf);
    compare(`width: $(((10)) % ((3)));`, '((10)) % ((3))', false, argTextOf);

    // A pair that genuinely wraps the whole argument is still unwrapped.
    compare(`width: $((5 % 3));`, '5 % 3', false, argTextOf);

});

test('comments', () => {

    // comments no longer leak into properties or values
    compare(`/*x*/color: red;`, [
        { type: 'rule', property: 'color', value: [[text('red')]] }
    ]);

    compare(`width/* note */: 10px;`, [
        { type: 'rule', property: 'width', value: [[text('10px')]] }
    ]);

    compare(`width: /* note */ 10px;`, [
        { type: 'rule', property: 'width', value: [[text('10px')]] }
    ]);

    // but they survive verbatim inside code arguments
    let [rule] = parseCSS(`background: @pattern(/* head */ grid: 10; // note\n fill: #000;);`);
    let body = rule.value[0][0].arguments[0].values[0].value;
    assert.ok(body.includes('// note'));
    assert.ok(body.includes('\n'));

});

test('raw value spans', () => {

    let [rule] = parseCSS(`@seed: 42;`);
    assert.equal(rule.rawValue(), '42');
    assert.equal(rule.raw(), '@seed: 42');

    ;[rule] = parseCSS(`@seed: 4 2 }`);
    assert.equal(rule.rawValue(), '4 2');

    // the value keeps its own colons
    ;[rule] = parseCSS(`background: url(https://example.com/a.png);`);
    assert.equal(rule.rawValue(), 'url(https://example.com/a.png)');

});

test('argument cluster', () => {

    let [rule] = parseCSS(`background: @p(('a', 'b'), red);`);
    let func = rule.value[0][0];
    assert.equal(func.arguments[0].cluster, true);
    assert.equal(func.arguments[0].values[0].value, `'a', 'b'`);
    assert.equal(func.arguments[1].cluster, false);
    assert.equal(func.arguments[1].values[0].value, 'red');

});

test('plus-minus argument expansion', () => {

    let [rule] = parseCSS(`transform: rotate(@pick(±45deg));`);
    let pick = rule.value[0][1];
    assert.equal(pick.name, '@pick');
    assert.deepEqual(
        pick.arguments.map(arg => arg.values[0].value),
        ['-45deg', '45deg']
    );

});

test('function positions are unique', () => {

    let ast = parseCSS(`background: @p(@r(1), @r(1)); width: @r(1)px;`);
    let positions = [];
    ;(function walk(nodes) {
        for (let node of nodes) {
            if (Array.isArray(node)) walk(node);
            else if (node && typeof node === 'object') {
                if (node.type === 'func') {
                    positions.push(node.position);
                    walk(node.arguments.map(arg => arg.values));
                }
                if (node.value && Array.isArray(node.value)) walk(node.value);
            }
        }
    })(ast);
    assert.equal(positions.length, 4);
    assert.equal(new Set(positions).size, 4);

});

test('@use inlines variables in nested blocks', () => {

    let extra = {
        getVariable: name => ({ '--rule': 'color: red;' }[name] || '')
    };
    let [pseudo] = parseCSS(`:after { @use: var(--rule); content: "x"; }`, extra);
    assert.equal(pseudo.styles[0].property, 'color');
    assert.equal(pseudo.styles[1].property, 'content');

    // at the top level and inside conds too
    let [rule, cond] = parseCSS(`@use: var(--rule); @nth(1) { @use: var(--rule); }`, extra);
    assert.equal(rule.property, 'color');
    assert.equal(cond.type, 'cond');
    assert.equal(cond.styles[0].property, 'color');

});

test('quoted paren does not leak into block probing', () => {

    compare(
        `color: red; content: "("; :after { color: blue; }`,
        [
            {
                "type": "rule",
                "property": "color",
                "value": [[text('red')]]
            },
            {
                "type": "rule",
                "property": "content",
                "value": [[text('"("')]]
            },
            {
                "type": "pseudo",
                "selector": ":after",
                "selectors": ["&:after"],
                "styles": [
                    {
                        "type": "rule",
                        "property": "color",
                        "value": [[text('blue')]]
                    }
                ]
            }
        ]
    );

    // a later quoted ")" must not rebalance the depth and turn
    // preceding rules into a bogus cond selector
    let result = parseCSS(`content: "("; @even (")") { color: blue; }`);
    assert.equal(result.length, 2);
    assert.equal(result[0].type, 'rule');
    assert.equal(result[0].property, 'content');
    assert.equal(result[1].type, 'cond');
    assert.equal(result[1].name, '@even');

});

test('malformed keyframes step stays inside the block', () => {

    // a '}' after the step name closes the keyframes
    // instead of opening a step body
    let result = parseCSS(`@keyframes x { 50% } color: red;`);
    assert.equal(result.length, 2);
    assert.equal(result[0].type, 'keyframes');
    assert.equal(result[0].steps.length, 1);
    assert.equal(result[0].steps[0].styles.length, 0);
    assert.equal(result[1].property, 'color');

    // a stray ';' yields an empty step and the next step parses normally
    let [k] = parseCSS(`@keyframes x { 50%; to { opacity: 0; } }`);
    assert.equal(k.steps.length, 2);
    assert.equal(k.steps[1].styles[0].property, 'opacity');

});

test('svg times syntax expands through @svg', () => {

    function svgArgs(input) {
        let [rule] = parseCSS(input);
        return rule.value[0][0].arguments;
    }

    function hasM(args) {
        return args.some(arg =>
            arg.values.some(v => v.type === 'func' && v.name === '@M'));
    }

    // times on a block expands into @M
    assert.ok(hasM(svgArgs(`background: @svg(circle*3 { r: 4 })`)));

    // times inside an inline block riding on a statement value
    assert.ok(hasM(svgArgs(`background: @svg(path { href: defs g circle*2 {} })`)));

    // the words alone in content are not times syntax
    let args = svgArgs(`background: @svg(text { content: "3 { times pureName" })`);
    assert.ok(!hasM(args));
    assert.ok(args[0].values[0].value.includes('times pureName'));

});

test('commas inside quotes do not split the value', () => {
    let [rule] = parseCSS(`content: "a, b";`);
    assert.equal(rule.value.length, 1);
    assert.equal(rule.value[0][0].value, '"a, b"');
});

test('nested blocks inside a pseudo parse as conds', () => {
    // used to be read as a rule whose name swallowed the '{'
    let [pseudo] = parseCSS(`:hover { @nth(1) { color: red } }`);
    assert.equal(pseudo.type, 'pseudo');
    assert.equal(pseudo.styles.length, 1);
    assert.equal(pseudo.styles[0].type, 'cond');
    assert.equal(pseudo.styles[0].name, '@nth');
});

test('@pattern bodies are kept verbatim like @doodle', () => {
    let [rule] = parseCSS(`background: @pattern(grid: 2; fill: @p(red, blue););`);
    let [arg] = rule.value[0][0].arguments;
    assert.equal(arg.values.length, 1);
    assert.equal(arg.values[0].value, 'grid: 2; fill: @p(red, blue);');
});

test('empty statements are dropped', () => {
    let rules = parseCSS(`color: red;; width: 1px; @keyframes x { from { ; opacity: 0 } }`);
    assert.deepEqual(rules.map(r => r.property || r.type), ['color', 'width', 'keyframes']);
    assert.deepEqual(rules[2].steps[0].styles.map(r => r.property), ['opacity']);
});

test('quotes only strip when they wrap the whole argument', () => {
    let [rule] = parseCSS(`content: @p("a" "b", "c", 'it"s');`);
    let args = rule.value[0][0].arguments;
    assert.deepEqual(args.map(a => [a.values[0].value, a.cluster]), [
        ['"a" "b"', false], ['c', true], ['it"s', true],
    ]);
});

test('selectors resolve against the enclosing block', () => {
    let selectors = code => parseCSS(code).map(n => n.selectors);
    // the raw text stays as written, the resolved list stands on '&'
    let [pseudo] = parseCSS(`:after { x: y }`);
    assert.equal(pseudo.selector, ':after');
    assert.deepEqual(pseudo.selectors, ['&:after']);
    // a leading pseudo compounds, '&' substitutes, anything else descends
    assert.deepEqual(selectors(`&:hover {} & :hover {} .foo {} .dark & {} & {}`),
        [['&:hover'], ['& :hover'], ['& .foo'], ['.dark &'], ['&']]);
    // nested lists cross with the enclosing list
    let [outer] = parseCSS(`:a, :b { :c, :d { x: y } }`);
    assert.deepEqual(outer.selectors, ['&:a', '&:b']);
    assert.deepEqual(outer.styles[0].selectors, ['&:a:c', '&:b:c', '&:a:d', '&:b:d']);
    // :doodle and :container start over from the host and the grid
    let [hover] = parseCSS(`:hover { :doodle { x: y } :container { x: y } }`);
    assert.deepEqual(hover.styles.map(n => n.selectors), [[':host'], [':container']]);
});

test('selector lists split on top-level commas only', () => {
    let [pseudo] = parseCSS(`:is(a, b), [title="a,b"],
        & :hover { x: y }`);
    assert.deepEqual(pseudo.selectors, ['&:is(a, b)', '& [title="a,b"]', '& :hover']);
});

test('host selectors fold pseudo-classes into :host()', () => {
    let [doodle] = parseCSS(`:doodle(.a) { :hover { :after { x: y } } ::part(p) { x: y } }`);
    assert.deepEqual(doodle.selectors, [':host(.a)']);
    let [hover, part] = doodle.styles;
    assert.deepEqual(hover.selectors, [':host(.a:hover)']);
    // pseudo-elements stay outside the parens
    assert.deepEqual(hover.styles[0].selectors, [':host(.a:hover):after']);
    assert.deepEqual(part.selectors, [':host(.a)::part(p)']);
    // written directly, with nested parens, and :host-context untouched
    assert.deepEqual(parseCSS(`:doodle:hover { x: y }`)[0].selectors, [':host(:hover)']);
    assert.deepEqual(parseCSS(`:doodle { :not(:is(.a, .b)):focus { x: y } }`)[0].styles[0].selectors,
        [':host(:not(:is(.a, .b)):focus)']);
    assert.deepEqual(parseCSS(`:host-context(.d) { &:hover { x: y } }`)[0].styles[0].selectors,
        [':host-context(.d):hover']);
});

test(':container(...) reads as a compound on the grid', () => {
    let [pseudo] = parseCSS(`:container(.x) .y, :container { :hover { x: y } }`);
    assert.deepEqual(pseudo.selectors, [':container.x .y', ':container']);
    assert.deepEqual(pseudo.styles[0].selectors, [':container.x .y:hover', ':container:hover']);
});

test('the selector context passes through conds and @use', () => {
    let [hover] = parseCSS(`:hover { @nth(1) { :after { x: y } } }`);
    assert.deepEqual(hover.styles[0].styles[0].selectors, ['&:hover:after']);
    let extra = {
        getVariable: name => ({ '--rule': ':after { x: y }' }[name] || '')
    };
    let [used] = parseCSS(`:hover { @use: var(--rule); }`, extra);
    assert.deepEqual(used.styles[0].selectors, ['&:hover:after']);
    // and is restored once the block closes
    let [, after] = parseCSS(`:hover { :focus { x: y } } :after { x: y }`);
    assert.deepEqual(after.selectors, ['&:after']);
});

test('blocks dispatch on their opener', () => {
    let types = code => parseCSS(code).map(n => n.type + ':' + (n.name || n.selector || n.property));
    // any non-@ block is a selector, quotes and parens do not fool the probe
    assert.deepEqual(types(`[title="{"] { x: y } .foo { x: y } @cell.random { x: y } @keyframes2 { x: y }`),
        ['pseudo:[title="{"]', 'pseudo:.foo', 'cond:@cell.random', 'cond:@keyframes2']);
    // a selector without a block is dropped, not swallowed to the next '{'
    assert.deepEqual(types(`:hover; color: red; :after { x: y }`), ['rule:color', 'pseudo::after']);
});

test('@ blocks keep their source text', () => {
    let [face, rule] = parseCSS(`@font-face { src: url("}"); } color: red;`);
    assert.equal(face.type, 'cond');
    assert.equal(face.raw(), '@font-face { src: url("}"); }');
    assert.equal(rule.property, 'color');
    // nested blocks and positions inside a pseudo included
    let [doodle] = parseCSS(`:doodle { @function --f(--x) { result: 1; @media (a) { result: 2 } } x: y }`);
    assert.equal(doodle.styles[0].raw(), '@function --f(--x) { result: 1; @media (a) { result: 2 } }');
    assert.equal(doodle.styles[1].property, 'x');
    let [nth] = parseCSS(`@nth(1) { x: y }`);
    assert.equal(nth.raw(), '@nth(1) { x: y }');
});

test('cond segments record the spacing before them', () => {
    let segments = code => parseCSS(code)[0].segments.map(n => [n.keyword || '()', n.spaced]);
    assert.deepEqual(segments(`@media screen and (min-width: 1px) { x: y }`),
        [['screen', true], ['and', true], ['()', true]]);
    assert.deepEqual(segments(`@container style(--x: 1) { x: y }`), [['style', true], ['()', false]]);
    assert.deepEqual(segments(`@nth(1) { x: y }`), [['()', false]]);
    assert.deepEqual(segments(`@nth not (1) { x: y }`), [['not', true], ['()', true]]);
});

test('argument text is built from tokens', () => {

    let argsOf = input => parseCSS(input)[0].value[0][0].arguments.map(a => a.values);
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
    let [media] = parseCSS(`@media (min-width: @calc(1)px) { x: y }`);
    let [prelude] = media.segments[0].arguments;
    assert.deepEqual([prelude.values[0], prelude.values[2]], [text('min-width: '), text('px')]);

});

test('a leading --name in an argument reads a variable', () => {

    let argsOf = input => parseCSS(input)[0].value[0][0].arguments.map(a => a.values);
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

test('$ keeps its suffix as the unit', () => {

    let funcOf = input => parseCSS(input)[0].value[0][0];
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

    let funcOf = input => parseCSS(input)[0].value[0][0];
    let doodle = funcOf(`a: @doodle100x50(x: y);`);
    assert.equal(doodle.name, '@doodle');
    assert.equal(doodle.size, '100x50');
    assert.deepEqual(doodle.arguments, [argument([text('x: y')])]);
    let m = funcOf(`a: @m2x3(1);`);
    assert.equal(m.size, undefined);
    assert.deepEqual(m.arguments[0], argument([text('2x3')]));

});

test('svg variable declarations stay text inside @svg', () => {

    function funcOf(input) {
        let [rule] = parseCSS(input);
        return rule.value[0][0];
    }

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
