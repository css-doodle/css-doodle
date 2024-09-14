import test from 'node:test';

import parseCSS from '../src/parser/parse-css.js';
import compare from './_compare.js';

compare.use(input => {
  return JSON.parse(JSON.stringify(parseCSS(input)));
});

test('pseudo quotes', () => {

  function getValue(value) {
    return [
      {
        "type": "pseudo",
        "selector": ":after",
        "styles": [
          {
            "type": "rule",
            "property": "content",
            "value": [
              [
                {
                  "type": "text",
                  "value": `\"${value}\"`
                }
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
              "name": "@svg",
              "position": 38,
              "type": "func",
              "variables": {},
              "arguments": [
                [
                  {
                    "type": "text",
                    "value": `text { content: \"${value}\"; }`
                  }
                ]
              ]
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
        "property": '@content',
        "type": "rule",
        "value": [
          [
            {
              type: 'text',
              value: `${value}`,
            }
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
