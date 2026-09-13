import test from 'node:test';
import assert from 'node:assert/strict';

import { generateFragment } from '../../src/generator/shaders.js';

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
