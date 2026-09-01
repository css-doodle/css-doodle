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
