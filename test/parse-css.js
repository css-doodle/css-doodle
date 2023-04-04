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

});
