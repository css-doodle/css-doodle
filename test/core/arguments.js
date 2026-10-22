import test from 'node:test';
import assert from 'node:assert/strict';

import { sequence, expand, getNamedArguments, MAX_SEQUENCE } from '../../src/core/arguments.js';

// --- sequence ---

const indices = count => sequence(count, i => i);

test('sequence: plain counts', () => {
    assert.deepEqual(indices(3), [1, 2, 3]);
    assert.deepEqual(indices('3'), [1, 2, 3]);
    // a fractional count rounds up, as it did before 0.52
    assert.deepEqual(indices(3.2), [1, 2, 3, 4]);
    assert.deepEqual(indices(3.8), [1, 2, 3, 4]);
    assert.deepEqual(indices(0.5), [1]);
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
    // the grid cap does not cut a range short
    let range = indices('100-1000');
    assert.equal(range.length, 901);
    assert.deepEqual([range[0], range.at(-1)], [100, 1000]);
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

test('expand: characters outside the BMP are one item each', () => {
    assert.deepEqual(args('[😀-😃]'), ['😀', '😁', '😂', '😃']);
    assert.deepEqual(args('[😀🎉✨]'), ['😀', '🎉', '✨']);
});

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

test('expand: `...` fills in the gap up to the next value', () => {
    assert.deepEqual(args('1', '3', '...', '11'), ['1', '3', '5', '7', '9', '11']);
    assert.deepEqual(args('10', '8', '...', '1'), ['10', '8', '6', '4', '2', '1']);
    assert.deepEqual(args('0px', '25px', '...', '100px'), ['0px', '25px', '50px', '75px', '100px']);
    assert.deepEqual(args('.1', '.2', '...', '.5'), ['.1', '.2', '0.3', '0.4', '.5']);
    assert.deepEqual(args('a', 'c', '...', 'i'), ['a', 'c', 'e', 'g', 'i']);
    assert.deepEqual(args('1', '2', '...', '4', '6', '...', '10'), ['1', '2', '3', '4', '6', '8', '10']);
    // a bare number takes the unit of the others
    assert.deepEqual(args('0', '25%', '...', '100%'), ['0', '25%', '50%', '75%', '100%']);
    assert.deepEqual(args('0', '1', '...', '3px'), ['0', '1', '2px', '3px']);
    // ranges expand first
    assert.deepEqual(args('[0-1]', '...', '3'), ['0', '1', '2', '3']);
    // an end behind the gap, or no gap, fills nothing
    assert.deepEqual(args('1', '3', '...', '0'), ['1', '3', '0']);
    assert.deepEqual(args('1', '1', '...', '5'), ['1', '1', '5']);
    // no gap to read stays as written
    for (let list of [['1', '...', '5'], ['1px', '2deg', '...', '5px'], ['1px', '2px', '...', '5deg'],
        ['a', '2', '...', 'z'], ['-.6 0', '.6 0', '...', '1.8 0'], ['1', '2', '...']]) {
        assert.deepEqual(args(...list), list);
    }
});

test('expand: a trailing `...` goes on to the count it is given, and stays without one', () => {
    let fill = (count, ...list) => expand((...a) => a, count)(...list);
    assert.deepEqual(fill(5, '1', '3', '...'), ['1', '3', '5', '7', '9']);
    assert.deepEqual(fill(4, '0s', '.1s', '...'), ['0s', '.1s', '0.2s', '0.3s']);
    // values written past the count all stay
    assert.deepEqual(fill(1, '1', '2', '...'), ['1', '2']);
    // no gap to read, or no count, stays as written
    assert.deepEqual(fill(5, 'red', 'blue', '...'), ['red', 'blue', '...']);
    assert.deepEqual(fill(undefined, '1', '2', '...'), ['1', '2', '...']);
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
    // a positional value after a named one is dropped, even one with an = inside
    assert.deepEqual(getNamedArguments(['a=8', '9'], ['a', 'b']), { a: '8' });
    assert.deepEqual(getNamedArguments(['a=8', '@r(1 = 2)'], ['a', 'b']), { a: '8' });
    // unknown names are ignored
    assert.deepEqual(getNamedArguments(['a=8', 'c=9'], ['a', 'b']), { a: '8' });
    assert.deepEqual(getNamedArguments(['a=8', 'c=9'], ['a', 'b', 'x']), { a: '8' });
    // an = inside the value belongs to the value
    assert.deepEqual(
        getNamedArguments(['a=@r(100 = 3)', 'b=9'], ['a', 'b', 'x']),
        { a: '@r(100 = 3)', b: '9' }
    );
});

test('expand: `a x3` in a list stands for three copies, capped like a sequence', () => {
    let list = expand((...args) => args);
    assert.deepEqual(list('a x3', 'b'), ['a', 'a', 'a', 'b']);
    assert.deepEqual(list('var(--c) x2', '10px 20px x1', 'x3', '2x'), ['var(--c)', 'var(--c)', '10px 20px', 'x3', '2x']);
    assert.deepEqual(list('a x0', 'b'), ['b']);
    assert.deepEqual(list('1', '3', '...', '7', '9 x2'), ['1', '3', '5', '7', '9', '9']);
    assert.equal(list('a x99999').length, MAX_SEQUENCE);
});
