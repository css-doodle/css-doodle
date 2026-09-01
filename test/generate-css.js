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
