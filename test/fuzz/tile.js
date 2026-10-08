// Random @tile, @plot.scatter and @shape commands with odd values: no throw,
// no NaN or Infinity in the output, and no case slow enough to look hung.
// The PRNG is seeded so every run covers the same cases.
import test from 'node:test';
import assert from 'node:assert/strict';

import Function from '../../src/core/function.js';

const SEED = 20261008;
const CASES = 400;

function makeRandom(seed) {
    let s = seed >>> 0;
    return () => {
        s = (s * 1664525 + 1013904223) >>> 0;
        return s / 2 ** 32;
    };
}

const KINDS = ['slice', 'voronoi', 'delaunay', 'hex', 'triangle', 'grid', 'circle', 'cube', 'penrose'];
const OUTLINES = ['', 'circle', 'heart', 'star', 'infinity', 'square; scale: .5 2', 'r: .02', 'split: 5; turn: 2; fill: evenodd', 'x: 0; y: 0', 'r: cos(4t)'];
const VALUES = ['0', '1', '-1', '.5', '3', '1e9', '-1e9', 'abc', '1/0', '', 'sin(t)', 'random()'];
const ARGS = {
    gap: VALUES, points: ['1', '3', '50', '300', '0', 'abc'], seed: ['0', '1', '1e20', 'abc'],
    relax: VALUES, density: ['1 - y', 'x * x', '0', '-1', 'random()', '1/0'], aspect: ['2', '1 / 3', '16/0', '0', '-1', 'abc'],
    round: VALUES, jitter: VALUES, size: ['1 + x', '0', '-1', '1e9', 'random()'], spread: VALUES,
    stretch: ['3 30', '0', '1e9', '-2'], crack: ['3', '1', '0', '1e9', '-5'], shift: ['.5', '0 .3', '1e9', 'abc'],
    edge: ['.1 * sin(t)', '1e9', '(random() - .5) * sin(t)', '.1 * x * e', '1/0'], slide: ['.05', '.1 * sin(t)', '1e9'],
    pair: ['turn', 'abc'], unit: ['px', 'none', '%'], scale: ['0', '2', '-1'], move: ['.3 -.2', '1e9'],
};
const OUTLINE_ARGS = { round: VALUES, edge: ['.05 * sin(20t)', '-.1', '1e9', '1/0', 'random()'], frame: ['0', '3', '-5', '1e9'], fill: ['evenodd', 'nonzero'] };

function pick(random, list) {
    return list[Math.floor(random() * list.length)];
}

function commands(random, args) {
    let out = [pick(random, OUTLINES)];
    for (let name of Object.keys(args)) {
        if (random() < .3) out.push(name + ': ' + pick(random, args[name]));
    }
    return out.filter(Boolean).join('; ');
}

const cellOf = (n, i) => ({ x: i, y: 1, z: 1, count: i, grid: { x: n, y: 1, z: 1, count: n } });
const finite = s => !/NaN|Infinity/.test(s);
// outlines that go through a pole on purpose
const poles = /1\/0|1e9|tan/;

test('tiles survive random commands', () => {
    let random = makeRandom(SEED);
    for (let c = 0; c < CASES; ++c) {
        let kind = pick(random, KINDS), input = commands(random, ARGS), n = 1 + Math.floor(random() * 40);
        let fn = kind == 'slice' ? Function.tile : Function.tile[kind];
        let start = performance.now();
        for (let i = 1; i <= n; ++i) {
            let out;
            assert.doesNotThrow(() => out = String(fn(cellOf(n, i), { context: {}, extra: [], seed: String(c) })(input)), `@tile.${kind}(${input})`);
            if (!poles.test(input)) assert.ok(finite(out), `@tile.${kind}(${input}) → ${out}`);
        }
        assert.ok(performance.now() - start < 3000, `slow: @tile.${kind}(${input})`);
    }
});

test('scatter survives random commands', () => {
    let random = makeRandom(SEED + 1);
    for (let c = 0; c < CASES / 4; ++c) {
        let input = commands(random, ARGS), n = 1 + Math.floor(random() * 40), out;
        assert.doesNotThrow(() => out = String(Function.plot.scatter(cellOf(n, 1), { context: {}, extra: [], seed: String(c) })(input)), `@plot.scatter(${input})`);
        if (!poles.test(input)) assert.ok(finite(out), `@plot.scatter(${input}) → ${out}`);
    }
});

test('outlines survive random round:, edge: and frame:', () => {
    let random = makeRandom(SEED + 2);
    for (let c = 0; c < CASES; ++c) {
        let input = commands(random, OUTLINE_ARGS), out;
        let start = performance.now();
        assert.doesNotThrow(() => out = Function.shape({}, { seed: String(c) })(input), `@shape(${input})`);
        if (!poles.test(input)) assert.ok(finite(out), `@shape(${input}) → ${out}`);
        assert.ok(performance.now() - start < 1000, `slow: @shape(${input})`);
    }
});
