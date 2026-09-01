// Equivalence fuzzing for calc expression templates: whenever
// compileTemplate accepts a set of segments, evaluating the template
// with hole values in the context must equal parsing the spliced
// string — for any segments and any values toPlainNumber accepts.
// Rejections (null) always fall back to splicing and need no check.
// The PRNG is seeded so every run covers the same cases; a failure
// message carries the segments, values and context to reproduce.
import test from 'node:test';
import assert from 'node:assert/strict';

import calc, { compileTemplate, toPlainNumber, isSignLeading } from '../src/core/calc.js';

const SEED = parseInt(process.env.FUZZ_TEMPLATE_SEED) || 20260901;
const ROUNDS = parseInt(process.env.FUZZ_TEMPLATE_ROUNDS) || 4000;

// mirrors the guard target: the $ deref path treats a lone name specially
const RE_NAME = /^[a-zA-Z_][a-zA-Z0-9_-]*$/;

function makeRandom(seed) {
    let s = seed >>> 0;
    return () => {
        s = (s * 1664525 + 1013904223) >>> 0;
        return s / 2 ** 32;
    };
}

function pick(random, list) {
    return list[Math.floor(random() * list.length)];
}

// every one of these passes toPlainNumber, so the template path engages
const VALUES = [
    '0', '1', '7', '42', '-3', '+5', '.5', '12.', '007',
    '1e3', '1e-3', '-0', ' 5 ', '0.30000000000000004',
    '1e309', '9007199254740993', 3, -2.5, 0.1,
];

const VAR_NAMES = ['a', 'b', 'k', 't', 'x1', 'foo'];
const FN_NAMES = ['sin', 'cos', 'abs', 'sqrt', 'max', 'pow', 'gcd'];
const OPS = [
    '+', '-', '*', '/', '%', '^', '**', '==', '!=', '<=', '>=',
    '&&', '||', '<', '>', '&', '|', '÷', '∧', '∨', '≤', '≥', '≠',
];

// a writer that records fixed text and hole values as they interleave
function makeWriter() {
    return {
        segments: [''],
        values: [],
        text(s) { this.segments[this.segments.length - 1] += s; },
        hole(v) { this.values.push(v); this.segments.push(''); },
    };
}

function genTerm(random, w, depth) {
    let r = random();
    if (r < 0.3 || w.values.length >= 20) {
        w.text(pick(random, ['2', '3', '10', '.5', '0', 'π', ...VAR_NAMES]));
    } else if (r < 0.6) {
        w.hole(pick(random, VALUES));
    } else if (r < 0.7 && depth < 3) {
        w.text('(');
        genExpr(random, w, depth + 1);
        w.text(')');
    } else if (r < 0.9 && depth < 3) {
        w.text(pick(random, FN_NAMES) + '(');
        genExpr(random, w, depth + 1);
        if (random() < 0.4) {
            w.text(',');
            genExpr(random, w, depth + 1);
        }
        w.text(')');
    } else {
        w.text(pick(random, ['-', '!']));
        genTerm(random, w, depth + 1);
    }
}

function genExpr(random, w, depth) {
    genTerm(random, w, depth);
    let terms = 1 + Math.floor(random() * 3);
    for (let i = 0; i < terms; i++) {
        let space = random() < 0.3 ? ' ' : '';
        w.text(space + pick(random, OPS) + space);
        genTerm(random, w, depth);
    }
}

// raw segment garbage: presses on every boundary rule at once
const GARBAGE = `0123456789abkstx.+-*/%^()!<>=&|,eE ÷∧∨≤≥≠π_·`;

function genGarbage(random, w) {
    let holes = 1 + Math.floor(random() * 3);
    for (let i = 0; i < holes; i++) {
        let len = Math.floor(random() * 6);
        let chunk = '';
        for (let j = 0; j < len; j++) {
            chunk += GARBAGE[Math.floor(random() * GARBAGE.length)];
        }
        w.text(chunk);
        w.hole(pick(random, VALUES));
    }
    if (random() < 0.7) {
        let len = Math.floor(random() * 6);
        for (let j = 0; j < len; j++) {
            w.text(GARBAGE[Math.floor(random() * GARBAGE.length)]);
        }
    }
}

function genContext(random) {
    let context = {};
    for (let name of VAR_NAMES) {
        let r = random();
        if (r < 0.4) context[name] = Math.floor(random() * 20) - 10;
        else if (r < 0.5) context[name] = '2*3';
    }
    // shadowing a built-in resolves through the context on both paths
    if (random() < 0.1) context.sin = () => 2;
    return context;
}

function splice(segments, values) {
    let out = segments[0];
    for (let i = 0; i < values.length; i++) {
        out += values[i] + segments[i + 1];
    }
    return out;
}

// would the consumer take the template path for these values?
function wouldTemplate(segments, values) {
    let compiled = compileTemplate(segments);
    if (compiled === null) return false;
    for (let i = 0; i < values.length; i++) {
        if (toPlainNumber(values[i]) === null) return false;
        if (compiled.signSensitive[i] && isSignLeading(values[i])) return false;
    }
    return true;
}

test('known re-association hazards stay on the splicing path', () => {
    // every shape below was a fuzz finding: the spliced string and the
    // placeholder expression tokenize differently, so the consumer must
    // splice. Pinned here so they never depend on the fuzz seed.
    const hazards = [
        [['(-', ')'], ['-3']],        // `--3` reads as a variable miss
        [['(-', ')'], ['+5']],        // `-+5` reads as a variable miss
        [['(--', ')'], ['5']],        // scanner sign absorption: `--5`
        [['(2-1)', ''], ['+5']],      // `)+5` binary vs `)·a` multiply
        [[' 5 ', ''], ['+5']],        // `5 +5` binary vs `5 ·a` multiply
        [['4', ''], ['1e-3']],        // `41e-3` scans as one number
        [['5E-', ''], ['0.3']],       // `5E-0` exponent absorption
        [['k ', ''], ['5']],          // `k 5` scans as the variable k5
        [['', ' 7'], ['5']],          // `·a 7` glues into a variable
        [['', ' (2)'], ['5']],        // `·a (2)` reads as a call
    ];
    for (let [segments, values] of hazards) {
        assert.equal(
            wouldTemplate(segments, values), false,
            `template path must not engage for ${JSON.stringify(segments)} ${JSON.stringify(values)}`);
    }
    // and the common shapes must keep the fast path
    const fine = [
        [['sin(', ')*10'], ['4000']],
        [['2-', ''], ['5']],
        [['(', ')'], ['-3']],
        [['2*', ''], ['-3']],
        [['', '+1'], ['-3']],
    ];
    for (let [segments, values] of fine) {
        assert.equal(
            wouldTemplate(segments, values), true,
            `template path should engage for ${JSON.stringify(segments)} ${JSON.stringify(values)}`);
    }
});

test('template evaluation matches spliced-string parsing', () => {
    const random = makeRandom(SEED);
    let accepted = 0;
    for (let i = 0; i < ROUNDS; i++) {
        let w = makeWriter();
        if (random() < 0.5) genExpr(random, w, 0);
        else genGarbage(random, w);
        if (!w.values.length) continue;

        let compiled = compileTemplate(w.segments);
        if (compiled === null) continue;
        accepted++;

        let spliced = splice(w.segments, w.values);
        assert.ok(
            !RE_NAME.test(spliced.trim()),
            `#${i} spliced form reads as a lone name (deref hazard): ${spliced}`);

        let context = genContext(random);
        let holes = Object.assign({}, context);
        let spliceFallback = false;
        for (let j = 0; j < w.values.length; j++) {
            let num = toPlainNumber(w.values[j]);
            assert.notEqual(num, null, `#${i} value pool broke toPlainNumber`);
            // the consumer splices sign-sensitive holes holding
            // sign-leading values; no template claim to check there
            if (compiled.signSensitive[j] && isSignLeading(w.values[j])) {
                spliceFallback = true;
                break;
            }
            holes[compiled.names[j]] = num;
        }
        if (spliceFallback) continue;

        let a = calc(spliced, context);
        let b = calc(compiled.template, holes);
        assert.ok(
            Object.is(a, b),
            `#${i} diverged: spliced ${a} vs template ${b}\n`
            + `--- segments ---\n${JSON.stringify(w.segments)}\n`
            + `--- values ---\n${JSON.stringify(w.values)}\n`
            + `--- spliced ---\n${spliced}\n`
            + `--- template ---\n${compiled.template}\n`
            + `--- context ---\n${JSON.stringify(context)}`);
    }
    // the guards must not silently reject everything: that would make
    // this test vacuous and the optimization dead
    assert.ok(
        accepted > ROUNDS / 20,
        `only ${accepted}/${ROUNDS} samples reached the template path`);
});
