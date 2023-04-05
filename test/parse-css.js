import test from 'ava';

import parseCSS from '../src/parser/parse-css.js';
import compare from './_compare.js';

compare.use(input => {
  return JSON.parse(JSON.stringify(parseCSS(input)));
});

test('pseudo quotes', t => {

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

  compare(t,
    `:after { content: ""; }`,
    getValue("")
  );

  compare(t,
    `:after { content: "x"; }`,
    getValue("x")
  );

  compare(t,
    `:after { content: ")"; }`,
    getValue(")")
  );

  compare(t,
    `:after { content: "("; }`,
    getValue("(")
  );

  compare(t,
    `:after { content: "}"; }`,
    getValue("}")
  );

  compare(t,
    `:after { content: ";"; }`,
    getValue(";")
  );

  compare(t,
    `:after { content: "()"; }`,
    getValue("()")
  );

  compare(t,
    `:after { content: "'"; }`,
    getValue("'")
  );

  compare(t,
    `:after { content: "x;"; }`,
    getValue("x;")
  );

  compare(t,
    `:after { content: "x;";;; }`,
    getValue("x;")
  );

});

test('quotes in SVG', t => {

  function getValue(value) {
    return [
      {
        "type": "cond",
        "name": "@svg",
        "styles": [],
        "arguments": [
          [
            {
              "type": "text",
              "value": `text { content: \"${value}\"; }`
            }
          ]
        ]
      }
    ];
  }

  compare(t,
    `@svg( text { content: ""; } )`,
    getValue(""),
  );

  compare(t,
    `@svg( text { content: "}"; } )`,
    getValue("}"),
  );

});
