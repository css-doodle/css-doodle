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

test('a shader error reads as its first reason and the line it points at', () => {
    let fragment = generateFragment('void main() {\n  vec2 p = gl_FragCoord.xy / u_resolution;\n  FragColor = vec4(p, 0.5 1.0);\n}', []);
    let n = fragment.split('\n').findIndex(line => line.includes('0.5 1.0')) + 1;
    let err = shaderError(`ERROR: 0:${n}: '1.0' : syntax error\nERROR: 1 compilation errors.  No code generated.\n`, fragment);
    assert.equal(err.message, `syntax error at '1.0'`);
    assert.equal(err.line, 'FragColor = vec4(p, 0.5 1.0)');
});

test('a shader error on a joined line quotes the statement with the token', () => {
    let fragment = 'void main(){vec2 p = gl_FragCoord.xy / u_resolution;FragColor = vec4(p,0.5 1.0);}';
    assert.equal(shaderError(`ERROR: 0:1: '1.0' : syntax error`, fragment).line, 'FragColor = vec4(p,0.5 1.0)');
});

test('a link error without a line reads as its first line', () => {
    let err = shaderError('\nerror: too many uniforms\nmore\n', '');
    assert.equal(err.message, 'error: too many uniforms');
    assert.ok(!err.line);
    assert.equal(shaderError('', '').message, 'link failed');
});
