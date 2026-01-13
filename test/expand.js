import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import expand from '../src/utils/expand.js';
import compare from './_compare.js';

// Create a simple identity function to test expand
const identity = expand((...args) => args);

compare.use(identity);

describe('expand', () => {

  describe('range expansion', () => {
    test('basic character ranges', () => {
      compare('[a-c]', ['a', 'b', 'c']);
      compare('[A-C]', ['A', 'B', 'C']);
      compare('[0-3]', ['0', '1', '2', '3']);
      compare('[x-z]', ['x', 'y', 'z']);
    });

    test('reverse ranges', () => {
      compare('[c-a]', ['c', 'b', 'a']);
      compare('[Z-X]', ['Z', 'Y', 'X']);
      compare('[9-5]', ['9', '8', '7', '6', '5']);
      compare('[z-x]', ['z', 'y', 'x']);
    });

    test('single character range', () => {
      compare('[a-a]', ['a']);
      compare('[5-5]', ['5']);
      compare('[Z-Z]', ['Z']);
    });

    test('individual characters (no range)', () => {
      compare('[abc]', ['a', 'b', 'c']);
      compare('[xyz]', ['x', 'y', 'z']);
      compare('[123]', ['1', '2', '3']);
      compare('[a]', ['a']);
    });

    test('mixed ranges and individual characters', () => {
      compare('[xa-c]', ['x', 'a', 'b', 'c']);
      compare('[a-cx]', ['a', 'b', 'c', 'x']);
      compare('[a-c0-2]', ['a', 'b', 'c', '0', '1', '2']);
    });

    test('special character ranges', () => {
      compare('[!-#]', ['!', '"', '#']);
      compare('[(-*]', ['(', ')', '*']);
    });

    test('case sensitivity (crosses ASCII boundary)', () => {
      compare('[Y-b]', ['Y', 'Z', '[', '\\', ']', '^', '_', '`', 'a', 'b']);
    });
  });

  describe('edge cases', () => {
    test('hyphen at end is treated as literal', () => {
      compare('[ab-]', ['a', 'b', '-']);
    });

    test('double hyphen is skipped', () => {
      // Second '-' is skipped by continue check (expr[i-1] == '-')
      compare('[a--c]', ['a', 'b', 'c']);
    });

    test('empty brackets', () => {
      compare('[]', []);
    });

    test('whitespace inside brackets', () => {
      compare('[ -!]', [' ', '!']);
    });

    test('unicode characters', () => {
      compare('[αβγ]', ['α', 'β', 'γ']);
    });

    test('large unicode range', () => {
      // Range from 'A' (65) to 'Ɓ' (385) = 321 chars
      const result = identity('[A-Ɓ]');
      assert.strictEqual(result.length, 321);
      assert.strictEqual(result[0], 'A');
      assert.strictEqual(result[result.length - 1], 'Ɓ');
    });
  });

  describe('passthrough behavior', () => {
    test('non-bracket input passes through', () => {
      compare('abc', ['abc']);
      compare('hello', ['hello']);
      compare('123', ['123']);
      compare('', ['']);
    });

    test('malformed brackets starting with [', () => {
      // Starts with '[' so build_range called, returns []
      compare('[abc', []);
      compare('[', []);
    });

    test('malformed brackets not starting with [', () => {
      // Doesn't start with '[', passed through as-is
      compare('abc]', ['abc]']);
      compare(']', [']']);
    });

    test('numbers pass through unchanged', () => {
      compare([[123]], [123]);
      compare([[[1, 2, 3]]], [[1, 2, 3]]);
    });
  });

  describe('expand wrapper function', () => {
    test('wraps function and expands arguments', () => {
      const joinFn = expand((...args) => args.join('-'));
      compare.use(joinFn);
      
      compare('[a-c]', 'a-b-c');
      compare('[1-3]', '1-2-3');
    });

    test('handles multiple arguments', () => {
      const concatFn = expand((...args) => args);
      
      const result1 = concatFn('[a-b]', '[1-2]');
      const result2 = concatFn('x', '[a-c]', 'y');
      const result3 = concatFn('hello', 'world');
      
      assert.deepStrictEqual(result1, ['a', 'b', '1', '2']);
      assert.deepStrictEqual(result2, ['x', 'a', 'b', 'c', 'y']);
      assert.deepStrictEqual(result3, ['hello', 'world']);
    });
  });

});
