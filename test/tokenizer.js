import test from 'node:test';
import assert from 'node:assert/strict';

import { scan } from '../src/parser/tokenizer.js';
import compare from './_compare.js';

compare.use((input, options) => {
    return Array.from(scan(input, options)).map(n => {
        let ret = {
            type: n.type,
            value: n.value
        };
        if (n.status) {
            ret.status = n.status;
        }
        return ret;
    });
});

test('basic', () => {

    compare('', []);

    compare('abc p', [
        { type: 'Word', value: 'abc' },
        { type: 'Space', value: ' ' },
        { type: 'Word', value: 'p' },
    ]);

    compare('abc @p', [
        { type: 'Word', value: 'abc' },
        { type: 'Space', value: ' ' },
        { type: 'Symbol', value: '@' },
        { type: 'Word', value: 'p' },
    ]);

    compare('color: red;', [
        { type: 'Word', value: 'color' },
        { type: 'Symbol', value: ':' },
        { type: 'Word', value: 'red' },
        { type: 'Symbol', value: ';' },
    ]);

    compare('@pick(red, blue)', [
        { type: 'Symbol', value: '@' },
        { type: 'Word', value: 'pick' },
        { type: 'Symbol', value: '(' },
        { type: 'Word', value: 'red' },
        { type: 'Symbol', value: ',' },
        { type: 'Word', value: 'blue' },
        { type: 'Symbol', value: ')' },
    ]);

    compare('@position: top  right', [
        { type: 'Symbol', value: '@' },
        { type: 'Word', value: 'position' },
        { type: 'Symbol', value: ':' },
        { type: 'Word', value: 'top'},
        { type: 'Space', value: ' ' },
        { type: 'Word', value: 'right' },
    ]);

    compare('content: "hello: world"', [
        { type: 'Word', value: 'content' },
        { type: 'Symbol', value: ':' },
        { type: 'Symbol', value: '"', status: 'open' },
        { type: 'Word', value: 'hello' },
        { type: 'Symbol', value: ':' },
        { type: 'Space', value: ' ' },
        { type: 'Word', value: 'world' },
        { type: 'Symbol', value: '"', status: 'close' },
    ]);

    compare('x, y: red;', [
        { type: 'Word', value: 'x' },
        { type: 'Symbol', value: ',' },
        { type: 'Word', value: 'y' },
        { type: 'Symbol', value: ':' },
        { type: 'Word', value: 'red' },
        { type: 'Symbol', value: ';' },
    ]);

});

test('quotes', () => {

    // A different quote inside a string is literal content
    compare(`content: "it's fine"`, [
        { type: 'Word', value: 'content' },
        { type: 'Symbol', value: ':' },
        { type: 'Symbol', value: '"', status: 'open' },
        { type: 'Word', value: 'it' },
        { type: 'Symbol', value: "'" },
        { type: 'Word', value: 's' },
        { type: 'Space', value: ' ' },
        { type: 'Word', value: 'fine' },
        { type: 'Symbol', value: '"', status: 'close' },
    ]);

    compare(`"url('#id')"`, [
        { type: 'Symbol', value: '"', status: 'open' },
        { type: 'Word', value: 'url' },
        { type: 'Symbol', value: '(' },
        { type: 'Symbol', value: "'" },
        { type: 'Word', value: '#id' },
        { type: 'Symbol', value: "'" },
        { type: 'Symbol', value: ')' },
        { type: 'Symbol', value: '"', status: 'close' },
    ]);

});

test('escape', () => {

    compare('content: "\\"hello"', [
        { type: 'Word', value: 'content' },
        { type: 'Symbol', value: ':' },
        { type: 'Symbol', value: '"', status: 'open' },
        { type: 'Word', value: '"hello' },
        { type: 'Symbol', value: '"', status: 'close' },
    ]);

    compare('content: "\\@p"', [
        { type: 'Word', value: 'content' },
        { type: 'Symbol', value: ':' },
        { type: 'Symbol', value: '"', status: 'open' },
        { type: 'Word', value: '@p' },
        { type: 'Symbol', value: '"', status: 'close' },
    ]);

    compare('content: \\"x"', [
        { type: 'Word', value: 'content' },
        { type: 'Symbol', value: ':' },
        { type: 'Word', value: '\\' },
        { type: 'Symbol', value: '"', status: 'open' },
        { type: 'Word', value: 'x' },
        { type: 'Symbol', value: '"', status: 'close' },
    ]);

    compare('content: "say \\"hi\\""', [
        { type: 'Word', value: 'content' },
        { type: 'Symbol', value: ':' },
        { type: 'Symbol', value: '"', status: 'open' },
        { type: 'Word', value: 'say' },
        { type: 'Space', value: ' ' },
        { type: 'Word', value: '"hi' },
        { type: 'Word', value: '"' },
        { type: 'Symbol', value: '"', status: 'close' },
    ]);

    // Escaped backslash
    compare('"a\\\\"', [
        { type: 'Symbol', value: '"', status: 'open' },
        { type: 'Word', value: 'a' },
        { type: 'Word', value: '\\' },
        { type: 'Symbol', value: '"', status: 'close' },
    ]);

});

test('numbers', () => {

    compare('padding: 0 10px', [
        { type: 'Word', value: 'padding' },
        { type: 'Symbol', value: ':' },
        { type: 'Number', value: '0' },
        { type: 'Space', value: ' ' },
        { type: 'Number', value: '10' },
        { type: 'Word', value: 'px' },
    ]);

    compare('opacity:.5', [
        { type: 'Word', value: 'opacity' },
        { type: 'Symbol', value: ':' },
        { type: 'Number', value: '.5' },
    ]);

    compare('0.5', [
        { type: 'Number', value: '0.5' },
    ]);

    compare('.5', [
        { type: 'Number', value: '.5' },
    ]);

    compare('.5px', [
        { type: 'Number', value: '.5' },
        { type: 'Word', value: 'px' },
    ]);

    compare('0..5', [
        { type: 'Number', value: '0' },
        { type: 'Word', value: '..' },
        { type: 'Number', value: '5' },
    ]);

    compare('0.5.9', [
        { type: 'Number', value: '0.5' },
        { type: 'Number', value: '.9' },
    ]);

    compare('10e9', [
        { type: 'Number', value: '10e9' },
    ]);
    compare('.5E9px', [
        { type: 'Number', value: '.5E9' },
        { type: 'Word', value: 'px' },
    ]);

    compare('10e+9', [
        { type: 'Number', value: '10e+9' },
    ]);

    compare('10e-9', [
        { type: 'Number', value: '10e-9' },
    ]);

    compare('10e+-9', [
        { type: 'Number', value: '10' },
        { type: 'Word', value: 'e' },
        { type: 'Symbol', value: '+' },
        { type: 'Number', value: '-9' },
    ]);

    compare('0x', [
        { type: 'Number', value: '0' },
        { type: 'Word', value: 'x' },
    ]);

    compare('0x12af', [
        { type: 'Number', value: '0x12af' }
    ]);

    compare('0x12afga', [
        { type: 'Number', value: '0x12af' },
        { type: 'Word', value: 'ga' },
    ]);

    compare('-10', [
        { type: 'Number', value: '-10' }
    ]);

    compare('n-10', [
        { type: 'Word', value: 'n' },
        { type: 'Symbol', value: '-' },
        { type: 'Number', value: '10' },
    ]);

    compare('5-10', [
        { type: 'Number', value: '5' },
        { type: 'Symbol', value: '-' },
        { type: 'Number', value: '10' },
    ]);

    compare('n - 10', [
        { type: 'Word', value: 'n' },
        { type: 'Space', value: ' ' },
        { type: 'Symbol', value: '-' },
        { type: 'Space', value: ' ' },
        { type: 'Number', value: '10' },
    ]);

    compare('n -10', [
        { type: 'Word', value: 'n' },
        { type: 'Space', value: ' ' },
        { type: 'Number', value: '-10' },
    ]);

});

test('comments', () => {

    compare('/* color: red', []);
    compare('/* color: red */', []);
    compare('/*/', []);
    compare('/**/', []);
    compare('/***/', []);
    compare(
        `
      /**
       * ignore me
       *
       */

      color:red
    `,
        [
            { type: 'Word', value: 'color' },
            { type: 'Symbol', value: ':' },
            { type: 'Word', value: 'red' },
        ]
    );

    compare(
        `
      /* ignore me */

      color:red

      /* ignore me */

    `,
        [
            { type: 'Word', value: 'color' },
            { type: 'Symbol', value: ':' },
            { type: 'Word', value: 'red' },
        ]
    );

    // A comment separates tokens like a space does
    compare('a/* x */b', [
        { type: 'Word', value: 'a' },
        { type: 'Space', value: ' ' },
        { type: 'Word', value: 'b' },
    ]);

    compare('red;/* x */blue', [
        { type: 'Word', value: 'red' },
        { type: 'Symbol', value: ';' },
        { type: 'Word', value: 'blue' },
    ]);

    // Comment inside a string is literal content
    compare('"a /* b */ c"', [
        { type: 'Symbol', value: '"', status: 'open' },
        { type: 'Word', value: 'a' },
        { type: 'Space', value: ' ' },
        { type: 'Symbol', value: '/' },
        { type: 'Symbol', value: '*' },
        { type: 'Space', value: ' ' },
        { type: 'Word', value: 'b' },
        { type: 'Space', value: ' ' },
        { type: 'Symbol', value: '*' },
        { type: 'Symbol', value: '/' },
        { type: 'Space', value: ' ' },
        { type: 'Word', value: 'c' },
        { type: 'Symbol', value: '"', status: 'close' },
    ]);

});

test('line breaks', () => {

    compare(['a \nb', { preserveLineBreak: true }], [
        { type: 'Word', value: 'a' },
        { type: 'Space', value: '\n' },
        { type: 'Word', value: 'b' },
    ]);

    compare(['a // hi\nb', { preserveLineBreak: true, ignoreInlineComment: true }], [
        { type: 'Word', value: 'a' },
        { type: 'Space', value: '\n' },
        { type: 'Word', value: 'b' },
    ]);

});

test('token position', () => {
    let tokens = scan('ab\ncd');
    assert.deepEqual(tokens[0].pos, [0, 0]);
    assert.deepEqual(tokens[2].pos, [0, 1]);
});

test('token index', () => {
    // For tokens whose value mirrors the raw text, index points at the
    // token's first char in the trimmed source
    let sources = [
        'color: red;',
        '@pick(red, blue)',
        '  padding: 0 10px  ',
        'a { width: 0x12af; height: 10e-9; }',
        ':nth-child( 2n - 1 ) { opacity: .5; }',
        'content: "hello: world"; v[1]-2',
        'a/* x */b (1)-2',
        'grid: 4x4 / 100%;',
    ];
    for (let source of sources) {
        let input = source.trim();
        for (let t of scan(source)) {
            if (t.isSpace()) continue;
            assert.equal(
                input.slice(t.index, t.index + t.value.length), t.value,
                `index mismatch for ${t.type} ${JSON.stringify(t.value)} in ${JSON.stringify(source)}`
            );
        }
    }

    // Space tokens index at the start of the whitespace (or comment) run
    let tokens = scan('a  /* x */  b');
    assert.deepEqual(
        tokens.map(t => [t.value, t.index]),
        [['a', 0], [' ', 1], ['b', 12]]
    );

    // Escaped words index at the backslash; the value excludes it
    let escaped = scan('"say \\"hi\\""');
    let word = escaped.find(t => t.value === '"hi');
    assert.equal(word.index, 5);

    // Indexes are strictly increasing
    let prev = -1;
    for (let t of scan(':after { content: @pick("a", "b"); }')) {
        assert.ok(t.index > prev, `indexes not increasing at ${t.value}`);
        prev = t.index;
    }
});


test('svg', () => {

    compare('<svg></svg>', [
        { type: 'Symbol', value: '<' },
        { type: 'Word', value: 'svg' },
        { type: 'Symbol', value: '>' },
        { type: 'Symbol', value: '<' },
        { type: 'Symbol', value: '/' },
        { type: 'Word', value: 'svg' },
        { type: 'Symbol', value: '>' }
    ]);

    compare('<circle r="@r(10)" />', [
        { type: 'Symbol', value: '<' },
        { type: 'Word', value: 'circle' },
        { type: 'Space', value: ' ' },
        { type: 'Word', value: 'r' },
        { type: 'Symbol', value: '=' },
        { type: 'Symbol', value: '"', status: 'open' },
        { type: 'Symbol', value: '@' },
        { type: 'Word', value: 'r' },
        { type: 'Symbol', value: '(' },
        { type: 'Number', value: '10' },
        { type: 'Symbol', value: ')' },
        { type: 'Symbol', value: '"', status: 'close' },
        { type: 'Space', value: ' ' },
        { type: 'Symbol', value: '/' },
        { type: 'Symbol', value: '>' }
    ]);

});

test('dot symbols', () => {
    compare('1 _.1px', [
        { type: 'Number', value: '1' },
        { type: 'Space', value: ' ' },
        { type: 'Symbol', value: '_' },
        { type: 'Number', value: '.1' },
        { type: 'Word', value: 'px' },
    ])
});

test('subtraction after closing parenthesis', () => {
    // Issue: ')-81' was being tokenized as ')' followed by '-81' (negative number)
    // instead of ')' '-' '81' (subtraction operator)

    compare('(1)-2', [
        { type: 'Symbol', value: '(' },
        { type: 'Number', value: '1' },
        { type: 'Symbol', value: ')' },
        { type: 'Symbol', value: '-' },
        { type: 'Number', value: '2' },
    ]);

    compare('(1) - 2', [
        { type: 'Symbol', value: '(' },
        { type: 'Number', value: '1' },
        { type: 'Symbol', value: ')' },
        { type: 'Space', value: ' ' },
        { type: 'Symbol', value: '-' },
        { type: 'Space', value: ' ' },
        { type: 'Number', value: '2' },
    ]);

    compare('sin(x)-81', [
        { type: 'Word', value: 'sin' },
        { type: 'Symbol', value: '(' },
        { type: 'Word', value: 'x' },
        { type: 'Symbol', value: ')' },
        { type: 'Symbol', value: '-' },
        { type: 'Number', value: '81' },
    ]);

    // Negative number is still valid at the start or after operators
    compare('(-5)', [
        { type: 'Symbol', value: '(' },
        { type: 'Number', value: '-5' },
        { type: 'Symbol', value: ')' },
    ]);

    compare('1+(-5)', [
        { type: 'Number', value: '1' },
        { type: 'Symbol', value: '+' },
        { type: 'Symbol', value: '(' },
        { type: 'Number', value: '-5' },
        { type: 'Symbol', value: ')' },
    ]);

    // Same for closing brackets
    compare('v[1]-2', [
        { type: 'Word', value: 'v' },
        { type: 'Symbol', value: '[' },
        { type: 'Number', value: '1' },
        { type: 'Symbol', value: ']' },
        { type: 'Symbol', value: '-' },
        { type: 'Number', value: '2' },
    ]);
});
