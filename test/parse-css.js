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
        "selectors": [":after"],
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

});
