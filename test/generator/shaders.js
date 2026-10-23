import test from 'node:test';
import assert from 'node:assert/strict';

import { generateFragment, shaderError } from '../../src/generator/shaders.js';

test('pos is defined when the fragment uses it', () => {
    let fragment = generateFragment('void main() { FragColor = vec4(pos, 0.0, 1.0); }', []);
    assert.match(fragment, /#define\s+pos\b/);
});

test('pos is not defined when unused', () => {
    let fragment = generateFragment('void main() { FragColor = vec4(1.0); }', []);
    assert.doesNotMatch(fragment, /#define\s+pos\b/);
});

test('pos is not defined when the fragment already declares it', () => {
    let fragment = generateFragment('void main() { vec2 pos = gl_FragCoord.xy / u_resolution; FragColor = vec4(pos, 0.0, 1.0); }', []);
    assert.doesNotMatch(fragment, /#define\s+pos\b/);
});

test('a shader error names the token it points at', () => {
    assert.equal(shaderError(`ERROR: 0:3: '1.0' : syntax error\nERROR: 1 compilation errors.  No code generated.\n`).message, 'invalid 1.0');
    assert.equal(shaderError('\nerror: too many uniforms\nmore\n').message, 'shader failed');
    assert.equal(shaderError('').message, 'shader failed');
});

test('an out vec4 declared after other statements on its line is the output', () => {
    let source = generateFragment('precision highp float; out vec4 o; void main() { o = vec4(1); }', []);
    assert.ok(!source.includes('FragColor'), source);
});
