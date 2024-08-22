import it from 'node:test';

import parseCSS from '../src/parser/parse-css.js';
import compare from './_compare.js';

compare.use(input => {
  return JSON.parse(JSON.stringify(parseCSS(input)));
});

it('pseudo quotes', () => {

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

it('quotes in SVG', () => {
  function getValue(value) {
    return [
      {
        "type": "cond",
        "addition": [],
        "name": "@svg",
        "styles": [],
        "arguments": [],
        "segments": [
          {
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
      }
    ];
  }

  compare(
    `@svg( text { content: ""; } )`,
    getValue(""),
  );

  compare(
    `@svg( text { content: "}"; } )`,
    getValue("}"),
  );

});

it('quotes in content', () => {

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

},);
