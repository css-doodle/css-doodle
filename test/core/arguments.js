import test from 'node:test';
import assert from 'node:assert/strict';

import { sequence, expand, getNamedArguments } from '../../src/core/arguments.js';

// --- sequence ---

const indices = count => sequence(count, i => i);

test('sequence: plain counts', () => {
    assert.deepEqual(indices(3), [1, 2, 3]);
    assert.deepEqual(indices('3'), [1, 2, 3]);
    assert.deepEqual(indices(3.2), [1, 2, 3, 4]);
    assert.deepEqual(indices(0), []);
});

test('sequence: grid counts walk rows first', () => {
    assert.deepEqual(indices('2x3'), [1, 2, 3, 4, 5, 6]);
    assert.deepEqual(
        sequence('2x3', (i, x, y) => [x, y]),
        [[1, 1], [2, 1], [1, 2], [2, 2], [1, 3], [2, 3]]
    );
});

test('sequence: ranges run in either direction', () => {
    assert.deepEqual(indices('1-4'), [1, 2, 3, 4]);
    assert.deepEqual(indices('4-1'), [4, 3, 2, 1]);
    assert.deepEqual(indices('5-5'), [5]);
});

test('sequence: negative counts produce nothing', () => {
    assert.deepEqual(indices(-3), []);
    assert.deepEqual(indices(-1), []);
    assert.deepEqual(indices('-5'), []);
    assert.deepEqual(indices('-2x3'), []);
});

test('sequence: grid product is capped', () => {
    assert.ok(indices('65536x65536').length <= 65536);
    assert.ok(indices('1000x1000').length <= 65536);
    assert.equal(indices('100x100').length, 10000);
});

// --- expand ---

const args = expand((...values) => values);

test('expand: character ranges', () => {
    assert.deepEqual(args('[a-c]'), ['a', 'b', 'c']);
    assert.deepEqual(args('[A-C]'), ['A', 'B', 'C']);
    assert.deepEqual(args('[0-3]'), ['0', '1', '2', '3']);
    assert.deepEqual(args('[x-z]'), ['x', 'y', 'z']);
    // reversed
    assert.deepEqual(args('[c-a]'), ['c', 'b', 'a']);
    assert.deepEqual(args('[Z-X]'), ['Z', 'Y', 'X']);
    assert.deepEqual(args('[9-5]'), ['9', '8', '7', '6', '5']);
    // single
    assert.deepEqual(args('[a-a]'), ['a']);
    assert.deepEqual(args('[5-5]'), ['5']);
    // punctuation and a range across the ASCII case gap
    assert.deepEqual(args('[!-#]'), ['!', '"', '#']);
    assert.deepEqual(args('[(-*]'), ['(', ')', '*']);
    assert.deepEqual(args('[Y-b]'), ['Y', 'Z', '[', '\\', ']', '^', '_', '`', 'a', 'b']);
});

test('expand: individual characters and mixed lists', () => {
    assert.deepEqual(args('[abc]'), ['a', 'b', 'c']);
    assert.deepEqual(args('[123]'), ['1', '2', '3']);
    assert.deepEqual(args('[a]'), ['a']);
    assert.deepEqual(args('[xa-c]'), ['x', 'a', 'b', 'c']);
    assert.deepEqual(args('[a-cx]'), ['a', 'b', 'c', 'x']);
    assert.deepEqual(args('[a-c0-2]'), ['a', 'b', 'c', '0', '1', '2']);
    assert.deepEqual(args('[αβγ]'), ['α', 'β', 'γ']);
});

test('expand: hyphen placement', () => {
    // a trailing hyphen is literal, a doubled one is skipped
    assert.deepEqual(args('[ab-]'), ['a', 'b', '-']);
    assert.deepEqual(args('[a--c]'), ['a', 'b', 'c']);
    assert.deepEqual(args('[ -!]'), [' ', '!']);
    assert.deepEqual(args('[]'), []);
});

test('expand: a large unicode range', () => {
    let result = args('[A-Ɓ]');
    assert.equal(result.length, 321);
    assert.equal(result[0], 'A');
    assert.equal(result.at(-1), 'Ɓ');
});

test('expand: anything else passes through', () => {
    assert.deepEqual(args('abc'), ['abc']);
    assert.deepEqual(args('123'), ['123']);
    assert.deepEqual(args(''), ['']);
    assert.deepEqual(args(123), [123]);
    // an array argument is spread into the list
    assert.deepEqual(args([1, 2, 3]), [1, 2, 3]);
    // a stray closing bracket is text
    assert.deepEqual(args('abc]'), ['abc]']);
    assert.deepEqual(args(']'), [']']);
    // an unclosed opening bracket expands to nothing
    assert.deepEqual(args('[abc'), []);
    assert.deepEqual(args('['), []);
});

test('expand: every argument of the wrapped function expands', () => {
    assert.deepEqual(args('[a-b]', '[1-2]'), ['a', 'b', '1', '2']);
    assert.deepEqual(args('x', '[a-c]', 'y'), ['x', 'a', 'b', 'c', 'y']);
    assert.deepEqual(args('hello', 'world'), ['hello', 'world']);
    let joined = expand((...values) => values.join('-'));
    assert.equal(joined('[a-c]'), 'a-b-c');
    assert.equal(joined('[1-3]'), '1-2-3');
});

// --- getNamedArguments ---

test('named arguments fill by position, then by name', () => {
    assert.deepEqual(getNamedArguments(['a', 'b'], ['a', 'b']), { a: 'a', b: 'b' });
    assert.deepEqual(getNamedArguments(['a=8', 'b=9'], ['a', 'b']), { a: '8', b: '9' });
    assert.deepEqual(getNamedArguments(['8', '7', 'b=9'], ['a', 'b']), { a: '8', b: '9' });
    // a positional value after a named one is dropped
    assert.deepEqual(getNamedArguments(['a=8', '9'], ['a', 'b']), { a: '8' });
    // unknown names are ignored
    assert.deepEqual(getNamedArguments(['a=8', 'c=9'], ['a', 'b']), { a: '8' });
    assert.deepEqual(getNamedArguments(['a=8', 'c=9'], ['a', 'b', 'x']), { a: '8' });
    // an = inside the value belongs to the value
    assert.deepEqual(
        getNamedArguments(['a=@r(100 = 3)', 'b=9'], ['a', 'b', 'x']),
        { a: '@r(100 = 3)', b: '9' }
    );
});
