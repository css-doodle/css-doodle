import test from 'node:test';
import assert from 'node:assert/strict';

import { scan } from '../../src/parser/tokenizer.js';

// [type, value] per token, with the open/close status of quotes
const tokens = (input, options) => scan(input, options).map(t =>
    t.status ? [t.type, t.value, t.status] : [t.type, t.value]
);

test('words, symbols and spaces', () => {
    assert.deepEqual(tokens(''), []);
    assert.deepEqual(tokens('abc p'), [
        ['Word', 'abc'],
        ['Space', ' '],
        ['Word', 'p'],
    ]);
    assert.deepEqual(tokens('abc @p'), [
        ['Word', 'abc'],
        ['Space', ' '],
        ['Symbol', '@'],
        ['Word', 'p'],
    ]);
    assert.deepEqual(tokens('color: red;'), [
        ['Word', 'color'],
        ['Symbol', ':'],
        ['Word', 'red'],
        ['Symbol', ';'],
    ]);
    assert.deepEqual(tokens('@pick(red, blue)'), [
        ['Symbol', '@'],
        ['Word', 'pick'],
        ['Symbol', '('],
        ['Word', 'red'],
        ['Symbol', ','],
        ['Word', 'blue'],
        ['Symbol', ')'],
    ]);
    // a run of spaces is one token
    assert.deepEqual(tokens('@position: top  right'), [
        ['Symbol', '@'],
        ['Word', 'position'],
        ['Symbol', ':'],
        ['Word', 'top'],
        ['Space', ' '],
        ['Word', 'right'],
    ]);
    assert.deepEqual(tokens('x, y: red;'), [
        ['Word', 'x'],
        ['Symbol', ','],
        ['Word', 'y'],
        ['Symbol', ':'],
        ['Word', 'red'],
        ['Symbol', ';'],
    ]);
});

test('quotes open and close, the other quote inside is content', () => {
    assert.deepEqual(tokens('content: "hello: world"'), [
        ['Word', 'content'],
        ['Symbol', ':'],
        ['Symbol', '"', 'open'],
        ['Word', 'hello'],
        ['Symbol', ':'],
        ['Space', ' '],
        ['Word', 'world'],
        ['Symbol', '"', 'close'],
    ]);
    assert.deepEqual(tokens(`content: "it's fine"`), [
        ['Word', 'content'],
        ['Symbol', ':'],
        ['Symbol', '"', 'open'],
        ['Word', 'it'],
        ['Symbol', "'"],
        ['Word', 's'],
        ['Space', ' '],
        ['Word', 'fine'],
        ['Symbol', '"', 'close'],
    ]);
    assert.deepEqual(tokens(`"url('#id')"`), [
        ['Symbol', '"', 'open'],
        ['Word', 'url'],
        ['Symbol', '('],
        ['Symbol', "'"],
        ['Word', '#id'],
        ['Symbol', "'"],
        ['Symbol', ')'],
        ['Symbol', '"', 'close'],
    ]);
});

test('backslash escapes the next character', () => {
    assert.deepEqual(tokens('content: "\\"hello"'), [
        ['Word', 'content'],
        ['Symbol', ':'],
        ['Symbol', '"', 'open'],
        ['Word', '"hello'],
        ['Symbol', '"', 'close'],
    ]);
    assert.deepEqual(tokens('content: "\\@p"'), [
        ['Word', 'content'],
        ['Symbol', ':'],
        ['Symbol', '"', 'open'],
        ['Word', '@p'],
        ['Symbol', '"', 'close'],
    ]);
    // outside a string a lone backslash is a word
    assert.deepEqual(tokens('content: \\"x"'), [
        ['Word', 'content'],
        ['Symbol', ':'],
        ['Word', '\\'],
        ['Symbol', '"', 'open'],
        ['Word', 'x'],
        ['Symbol', '"', 'close'],
    ]);
    assert.deepEqual(tokens('content: "say \\"hi\\""'), [
        ['Word', 'content'],
        ['Symbol', ':'],
        ['Symbol', '"', 'open'],
        ['Word', 'say'],
        ['Space', ' '],
        ['Word', '"hi'],
        ['Word', '"'],
        ['Symbol', '"', 'close'],
    ]);
    assert.deepEqual(tokens('"a\\\\"'), [
        ['Symbol', '"', 'open'],
        ['Word', 'a'],
        ['Word', '\\'],
        ['Symbol', '"', 'close'],
    ]);
});

test('numbers: decimals, exponents, hex', () => {
    assert.deepEqual(tokens('padding: 0 10px'), [
        ['Word', 'padding'],
        ['Symbol', ':'],
        ['Number', '0'],
        ['Space', ' '],
        ['Number', '10'],
        ['Word', 'px'],
    ]);
    assert.deepEqual(tokens('opacity:.5'), [
        ['Word', 'opacity'],
        ['Symbol', ':'],
        ['Number', '.5'],
    ]);
    assert.deepEqual(tokens('0.5'), [['Number', '0.5']]);
    assert.deepEqual(tokens('.5'), [['Number', '.5']]);
    assert.deepEqual(tokens('.5px'), [['Number', '.5'], ['Word', 'px']]);
    assert.deepEqual(tokens('0..5'), [['Number', '0'], ['Word', '..'], ['Number', '5']]);
    assert.deepEqual(tokens('0.5.9'), [['Number', '0.5'], ['Number', '.9']]);

    assert.deepEqual(tokens('10e9'), [['Number', '10e9']]);
    assert.deepEqual(tokens('.5E9px'), [['Number', '.5E9'], ['Word', 'px']]);
    assert.deepEqual(tokens('10e+9'), [['Number', '10e+9']]);
    assert.deepEqual(tokens('10e-9'), [['Number', '10e-9']]);
    assert.deepEqual(tokens('10e+-9'), [
        ['Number', '10'],
        ['Word', 'e'],
        ['Symbol', '+'],
        ['Number', '-9'],
    ]);

    assert.deepEqual(tokens('0x'), [['Number', '0'], ['Word', 'x']]);
    assert.deepEqual(tokens('0x12af'), [['Number', '0x12af']]);
    assert.deepEqual(tokens('0x12afga'), [['Number', '0x12af'], ['Word', 'ga']]);
});

test('a minus is a sign after a space or an operator, a symbol after a value', () => {
    assert.deepEqual(tokens('-10'), [['Number', '-10']]);
    assert.deepEqual(tokens('n-10'), [['Word', 'n'], ['Symbol', '-'], ['Number', '10']]);
    assert.deepEqual(tokens('5-10'), [['Number', '5'], ['Symbol', '-'], ['Number', '10']]);
    assert.deepEqual(tokens('n - 10'), [
        ['Word', 'n'],
        ['Space', ' '],
        ['Symbol', '-'],
        ['Space', ' '],
        ['Number', '10'],
    ]);
    assert.deepEqual(tokens('n -10'), [['Word', 'n'], ['Space', ' '], ['Number', '-10']]);
});

test('a minus after a closing bracket is a subtraction', () => {
    // ')-81' used to tokenize as ')' followed by the number -81
    assert.deepEqual(tokens('(1)-2'), [
        ['Symbol', '('],
        ['Number', '1'],
        ['Symbol', ')'],
        ['Symbol', '-'],
        ['Number', '2'],
    ]);
    assert.deepEqual(tokens('(1) - 2'), [
        ['Symbol', '('],
        ['Number', '1'],
        ['Symbol', ')'],
        ['Space', ' '],
        ['Symbol', '-'],
        ['Space', ' '],
        ['Number', '2'],
    ]);
    assert.deepEqual(tokens('sin(x)-81'), [
        ['Word', 'sin'],
        ['Symbol', '('],
        ['Word', 'x'],
        ['Symbol', ')'],
        ['Symbol', '-'],
        ['Number', '81'],
    ]);
    assert.deepEqual(tokens('v[1]-2'), [
        ['Word', 'v'],
        ['Symbol', '['],
        ['Number', '1'],
        ['Symbol', ']'],
        ['Symbol', '-'],
        ['Number', '2'],
    ]);
    // still a sign at the start or after an operator
    assert.deepEqual(tokens('(-5)'), [['Symbol', '('], ['Number', '-5'], ['Symbol', ')']]);
    assert.deepEqual(tokens('1+(-5)'), [
        ['Number', '1'],
        ['Symbol', '+'],
        ['Symbol', '('],
        ['Number', '-5'],
        ['Symbol', ')'],
    ]);
});

test('block comments are dropped and separate tokens like a space', () => {
    assert.deepEqual(tokens('/* color: red'), []);
    assert.deepEqual(tokens('/* color: red */'), []);
    assert.deepEqual(tokens('/*/'), []);
    assert.deepEqual(tokens('/**/'), []);
    assert.deepEqual(tokens('/***/'), []);
    assert.deepEqual(tokens(`
        /**
         * ignore me
         *
         */

        color:red
    `), [
        ['Word', 'color'],
        ['Symbol', ':'],
        ['Word', 'red'],
    ]);
    assert.deepEqual(tokens('/* ignore me */ color:red /* ignore me */'), [
        ['Word', 'color'],
        ['Symbol', ':'],
        ['Word', 'red'],
    ]);
    assert.deepEqual(tokens('a/* x */b'), [
        ['Word', 'a'],
        ['Space', ' '],
        ['Word', 'b'],
    ]);
    assert.deepEqual(tokens('red;/* x */blue'), [
        ['Word', 'red'],
        ['Symbol', ';'],
        ['Word', 'blue'],
    ]);
    // inside a string a comment is content
    assert.deepEqual(tokens('"a /* b */ c"'), [
        ['Symbol', '"', 'open'],
        ['Word', 'a'],
        ['Space', ' '],
        ['Symbol', '/'],
        ['Symbol', '*'],
        ['Space', ' '],
        ['Word', 'b'],
        ['Space', ' '],
        ['Symbol', '*'],
        ['Symbol', '/'],
        ['Space', ' '],
        ['Word', 'c'],
        ['Symbol', '"', 'close'],
    ]);
});

test('line breaks and inline comments under the shader options', () => {
    assert.deepEqual(tokens('a \nb', { preserveLineBreak: true }), [
        ['Word', 'a'],
        ['Space', '\n'],
        ['Word', 'b'],
    ]);
    assert.deepEqual(tokens('a // hi\nb', { preserveLineBreak: true, ignoreInlineComment: true }), [
        ['Word', 'a'],
        ['Space', '\n'],
        ['Word', 'b'],
    ]);
});

test('markup characters are plain symbols', () => {
    assert.deepEqual(tokens('<svg></svg>'), [
        ['Symbol', '<'],
        ['Word', 'svg'],
        ['Symbol', '>'],
        ['Symbol', '<'],
        ['Symbol', '/'],
        ['Word', 'svg'],
        ['Symbol', '>'],
    ]);
    assert.deepEqual(tokens('<circle r="@r(10)" />'), [
        ['Symbol', '<'],
        ['Word', 'circle'],
        ['Space', ' '],
        ['Word', 'r'],
        ['Symbol', '='],
        ['Symbol', '"', 'open'],
        ['Symbol', '@'],
        ['Word', 'r'],
        ['Symbol', '('],
        ['Number', '10'],
        ['Symbol', ')'],
        ['Symbol', '"', 'close'],
        ['Space', ' '],
        ['Symbol', '/'],
        ['Symbol', '>'],
    ]);
});

test('a symbol followed by a leading-dot number', () => {
    assert.deepEqual(tokens('1 _.1px'), [
        ['Number', '1'],
        ['Space', ' '],
        ['Symbol', '_'],
        ['Number', '.1'],
        ['Word', 'px'],
    ]);
});

test('pos is [column, line]', () => {
    let plain = scan('ab\ncd');
    assert.deepEqual(plain[0].pos, [0, 0]);
    assert.deepEqual(plain[2].pos, [0, 1]);
    // leading whitespace counts: index and pos reference the input as given
    let padded = scan('\n  ab\ncd');
    assert.deepEqual(padded[0].pos, [2, 1]);
    assert.equal(padded[0].index, 3);
    assert.deepEqual(padded[2].pos, [0, 2]);
});

test('index points at the first char of the token in the untrimmed source', () => {
    for (let source of [
        'color: red;',
        '@pick(red, blue)',
        '  padding: 0 10px  ',
        'a { width: 0x12af; height: 10e-9; }',
        ':nth-child( 2n - 1 ) { opacity: .5; }',
        'content: "hello: world"; v[1]-2',
        'a/* x */b (1)-2',
        'grid: 4x4 / 100%;',
    ]) {
        for (let t of scan(source)) {
            if (t.isSpace()) continue;
            assert.equal(
                source.slice(t.index, t.index + t.value.length), t.value,
                `index mismatch for ${t.type} ${JSON.stringify(t.value)} in ${JSON.stringify(source)}`
            );
        }
    }

    // a space token indexes at the start of the whitespace or comment run
    assert.deepEqual(
        scan('a  /* x */  b').map(t => [t.value, t.index]),
        [['a', 0], [' ', 1], ['b', 12]]
    );

    // an escaped word indexes at the backslash; the value excludes it
    let word = scan('"say \\"hi\\""').find(t => t.value === '"hi');
    assert.equal(word.index, 5);

    // indexes are strictly increasing
    let prev = -1;
    for (let t of scan(':after { content: @pick("a", "b"); }')) {
        assert.ok(t.index > prev, `indexes not increasing at ${t.value}`);
        prev = t.index;
    }
});
