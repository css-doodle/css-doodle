// Mutation fuzzing over the fixture corpus: parse and generate must
// survive any input without throwing. The PRNG is seeded so every run
// covers the same cases; a failure message carries the mutated source.
import test from 'node:test';
import assert from 'node:assert/strict';

import parseCss from '../src/parser/parse-css.js';
import generateCss from '../src/generator/css.js';
import parseGrid from '../src/parser/parse-grid.js';
import fixtures from './diff/fixtures.js';

const SEED = 20260901;
const ROUNDS = 16;

function makeRandom(seed) {
    let s = seed >>> 0;
    return () => {
        s = (s * 1664525 + 1013904223) >>> 0;
        return s / 2 ** 32;
    };
}

// characters that steer the grammar: brackets, quotes, sigils, operators
const POOL = `()[]{}"'\`@$,;:<>&|!?~±π^*/%=.-\\ \n`;

function mutate(code, random) {
    let at = Math.floor(random() * code.length);
    let len = 1 + Math.floor(random() * 5);
    switch (Math.floor(random() * 5)) {
        case 0: // truncate
            return code.slice(0, at);
        case 1: // delete a span
            return code.slice(0, at) + code.slice(at + len);
        case 2: // duplicate a span
            return code.slice(0, at + len) + code.slice(at);
        case 3: // insert a tricky character
            return code.slice(0, at)
                + POOL[Math.floor(random() * POOL.length)]
                + code.slice(at);
        default: { // swap two characters
            let b = Math.floor(random() * code.length);
            let chars = [...code];
            [chars[at], chars[b]] = [chars[b], chars[at]];
            return chars.join('');
        }
    }
}

test('mutated corpus inputs never throw', () => {
    const random = makeRandom(SEED);
    for (let { name, code, extra } of fixtures) {
        let extraArg = extra
            ? { getVariable: n => extra[n] || '' }
            : undefined;
        for (let i = 0; i < ROUNDS; i++) {
            let mutated = mutate(code, random);
            try {
                let tokens = parseCss(mutated, extraArg);
                // maxGrid 64 mirrors the component's getMaxGrid()
                generateCss(tokens, parseGrid('2'), 42, 64);
            } catch (e) {
                assert.fail(
                    `${name}#${i} threw: ${e && e.stack || e}\n`
                    + `--- mutated source ---\n${mutated}`);
            }
        }
    }
});
