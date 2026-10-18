// Grammar-driven fuzzing: docs/grammar.md written as seeded generators, so
// every case is a valid doodle instead of a mutated one. Checked:
// - §8: an expression with the fewest parentheses evaluates as the fully
//   parenthesized one, so precedence and associativity follow the table;
// - §2–§7: a doodle compiles without throwing or leaking `undefined`,
//   `NaN` or `[object`, the same each time, the same with whitespace and
//   comments where §1 drops them, and the same with its statements
//   inserted by @use;
// - §9.1: an @svg body read again from its own source gives the same tree.
// The PRNG is seeded so every run covers the same cases; a failure
// message carries the source to reproduce.
import test from 'node:test';
import assert from 'node:assert/strict';

import calc from '../../src/core/calc.js';
import parseCss from '../../src/parser/parse-css.js';
import parseSvg from '../../src/parser/parse-svg.js';
import parseGrid from '../../src/parser/parse-grid.js';
import svgSourceOf from '../../src/parser/svg-source.js';
import generateCss from '../../src/generator/css.js';

const SEED = parseInt(process.env.FUZZ_GRAMMAR_SEED) || 20261019;
const ROUNDS = parseInt(process.env.FUZZ_GRAMMAR_ROUNDS) || 300;

function makeRandom(seed) {
    let s = seed >>> 0;
    return () => {
        s = (s * 1664525 + 1013904223) >>> 0;
        return s / 2 ** 32;
    };
}

let random;
const pick = list => list[Math.floor(random() * list.length)];
const chance = p => random() < p;
const some = (min, max, fn) => Array.from({ length: min + Math.floor(random() * (max - min + 1)) }, fn);

// Slots where §1 drops whitespace: `_` takes spaces, `__` sits between
// statements and also takes a comment or an empty `;`, and SEMI is the
// optional `;` before `}`. `plain` empties them, `spaced` fills them.
const _ = '\uE000', __ = '\uE001', SEMI = '\uE002';
const plain = code => code.replace(/[\uE000-\uE002]/g, '');
const spaced = code => code
    .replace(/\uE000/g, () => pick([' ', '\n', '  ']))
    .replace(/\uE001/g, () => pick([' ', '\n  ', ' /* c */ ', ';']))
    .replace(/\uE002/g, ';');

// statements as { text, block }: a declaration ends with `;`, the last
// one before `}` or the end only optionally
const join = items => items
    .map(({ text, block }, k) => block ? text : text + (k < items.length - 1 ? ';' : SEMI))
    .join(__);
const decl = text => ({ text, block: false });
const block = (head, body) => ({ text: `${head}${_}{${__}${body}${__}}`, block: true });

// --- §8 expressions ---

// binary levels loosest first, then sign, adjacent product, power and not
const BINARY = [
    ['||', '∨'], ['&&', '∧'], ['<', '>', '<=', '>=', '≤', '≥', '=', '==', '!=', '≠'],
    ['|'], ['&'], ['<<', '>>'], ['+', '-'], ['*', '/', '÷', '%'],
];
const RIGHT = [true, true];
const SIGN = 8, PRODUCT = 9, POWER = 10, NOT = 11, ATOM = 12;
const CANON = { '∨': '||', '∧': '&&', '≤': '<=', '≥': '>=', '=': '==', '≠': '!=', '÷': '/', '**': '^' };
const CONTEXT = { x: 3, y: 5, i: 2, X: 8 };

// `min` has the fewest parentheses, `full` one around every operand
const node = (p, min, full) => ({ p, min, full });
const operand = (e, p) => e.p < p ? `(${e.min})` : e.min;

function expression(depth = 3) {
    if (depth < 1 || chance(.3)) return atom(depth);
    let a = expression(depth - 1), b = expression(depth - 1);
    switch (pick(['binary', 'binary', 'binary', 'sign', 'product', 'power', 'not'])) {
        case 'binary': {
            let level = Math.floor(random() * BINARY.length), op = pick(BINARY[level]);
            let [l, r] = RIGHT[level] ? [level + 1, level] : [level, level + 1];
            return node(level, `${operand(a, l)} ${op} ${operand(b, r)}`, `(${a.full}) ${CANON[op] || op} (${b.full})`);
        }
        case 'sign': {
            // a sign before a sign is wrapped, `--x` reads a custom property
            let op = pick(['-', '+']);
            return node(SIGN, op + operand(a, SIGN + 1), `${op}(${a.full})`);
        }
        case 'product': {
            // an unsigned number right before a name, a call or `(`
            let n = pick(['2', '3', '.5', '1.5']);
            let tail = b.p >= PRODUCT && /^[a-z(]/i.test(b.min) ? b.min : `(${b.min})`;
            return node(PRODUCT, n + tail, `(${n}) * (${b.full})`);
        }
        case 'power': {
            let op = pick(['^', '**']);
            return node(POWER, `${operand(a, POWER + 1)} ${op} ${operand(b, POWER)}`, `(${a.full}) ^ (${b.full})`);
        }
        default:
            return node(NOT, '!' + operand(a, NOT), `!(${a.full})`);
    }
}

function atom(depth) {
    if (depth > 0 && chance(.3)) {
        let name = pick(['min', 'max', 'abs', 'mod', 'match', 'pick']);
        let args = some(name === 'abs' ? 1 : 2, name === 'abs' ? 1 : 4, () => expression(depth - 1));
        let print = key => name === 'pick'
            ? `pick(${args[0][key]}: ${args.slice(1).map(a => a[key]).join(', ')})`
            : `${name}(${args.map(a => a[key]).join(', ')})`;
        return node(ATOM, print('min'), print('full'));
    }
    let v = pick(['x', 'y', 'i', 'X', '0', '1', '2', '7', '.5', '2.5']);
    return node(ATOM, v, v);
}

// --- §9.1 svg bodies; `doodle` allows calls, copies, @match and variables ---

const COLORS = ['red', '#00f', 'tan', 'hsl(10 20% 30%)'];
let defined = [];

function svgBody(depth, doodle) {
    let value = () => doodle && chance(.4) ? call(0) : pick(['1', '2.5', ...COLORS]);
    let heads = ['circle', 'rect', 'g', 'path', 'g > circle', 'g circle', `circle,${_}rect`, 'rect#a', 'circle.b'];
    if (doodle) heads.push('circle*3', 'g*2x2', 'rect*2-4');
    let statements = [
        () => decl(`viewBox:${_}0 0 10 10`),
        () => decl(`${pick(['cx', 'r', 'fill', 'stroke'])}:${_}${value()}`),
        () => decl(`stroke,${_}fill:${_}${pick(COLORS)}`),
        () => decl(`x,${_}y:${_}1,${_}2`),
        () => decl(`fill:${_}defs radialGradient${_}{${_}stop${_}{${_}offset:${_}0;${_}stop-color:${_}red${SEMI}${_}}${_}}`),
        () => block('text', join([decl(`content:${_}"a; b"`)])),
        () => ({ text: `style${_}{${_}circle { fill: red }${_}}`, block: true }),
        () => depth > 0 ? block(pick(heads), svgBody(depth - 1, doodle)) : block(pick(heads), ''),
    ];
    if (doodle) statements.push(
        () => decl(`--s:${_}${pick(['2', '@i', '$(x + 1)'])}`),
        () => decl(`r:${_}$(s * 2)`),
    );
    if (doodle && depth > 0) statements.push(() => block(`@match(${expression(1).min})`, svgBody(depth - 1, doodle)));
    if (doodle && defined.includes('dot')) statements.push(() => decl(`$dot(${pick(['1', '2, blue', '@r(3)'])})`));
    return join(some(1, 3, () => pick(statements)()));
}

// --- §2–§7 doodles ---

const DEFINITIONS = {
    twice: `--twice(v):${_}$(v * 2)`,
    double: `--double(v):${_}{${_}result:${_}$(v * 2);${_}}`,
    dot: `--dot(r, c = red):${_}circle${_}{${_}r:${_}$r;${_}fill:${_}$c${SEMI}${_}}`,
};
const args = items => `${_}${some(1, 3, () => pick(items)).join(`,${_}`)}${_}`;

function call(depth) {
    let forms = [
        () => `@p(${args(COLORS)})`,
        () => `@pn(${args(COLORS)})`,
        () => `@r(${pick(['10', '-5, 5', '360deg', '.5, 1'])})`,
        () => pick(['@i', '@x', '@y', '@I', '@X']),
        () => `$(${_}${expression().min}${_})`,
        () => `$px(${expression().min})`,
        () => `@pick(${expression(2).min}:${args(COLORS)})`,
        () => `@m${pick([2, 3])}(${pick(COLORS)})`,
        () => `@round.r(10)`,
    ];
    if (defined.includes('twice')) forms.push(() => `$twice(${expression(2).min})`);
    if (defined.includes('double')) forms.push(() => `$double(${expression(2).min})`);
    if (depth > 0) forms.push(() => `@svg(${_}${svgBody(depth - 1, true)}${_})`);
    return pick(forms)();
}

function value(depth) {
    let item = () => chance(.4) ? pick(['1px', 'solid', '50%', 'calc(100% - 2px)', 'var(--k)', '"a, b; c"', '"@i"']) : call(depth);
    return some(1, 2, () => some(1, 3, item).join(' ')).join(`,${_}`);
}

const SELECTORS = [':hover', '::after', 'span', '.dark &', ':doodle', ':container', ':doodle(.dark)', ':nth-child(2)'];
const anb = () => pick(['2n', '2n+1', '2n + 1', '-1n + 3', 'odd', 'even', '3', 'n']);
const CONDITIONS = [
    () => `@nth(${_}${anb()}${_})`, () => `@row(${anb()})`, () => `@col(${anb()})`,
    () => '@even', () => '@odd', () => `@random(${pick(['.3', '.5', '2'])})`,
    () => `@match(${_}${expression(2).min}${_})`, () => `@cell not (${expression(2).min})`,
    () => `@at(1,${_}2)`, () => '@media (hover)', () => '@supports (display: grid)',
];
const PROPERTIES = ['background', 'color', 'width', 'opacity', 'rotate', 'border', 'content', '--k', '--c'];

function statement(depth, top) {
    let forms = [
        () => decl(`${pick(PROPERTIES)}:${_}${value(depth)}`),
        () => decl(`${pick(PROPERTIES)}:${_}${value(depth)}`),
        () => block(some(1, 2, () => pick(SELECTORS)).join(`,${_}`), body(depth - 1)),
        () => block(pick(CONDITIONS)(), body(depth - 1)),
        // steps, not statements: no `;` between them
        () => ({ text: `@keyframes k${depth}${_}{${_}from${_}{${_}rotate:${_}0deg${SEMI}${_}}${_}to${_}{${_}rotate:${_}@r(360deg)${SEMI}${_}}${_}}`, block: true }),
    ];
    if (top) forms.push(
        () => decl(`@size:${_}${pick(['10px', '1em 2em', 'a5'])}`),
        () => decl(`@place:${_}${pick(['center', 'left top', '20% 80%'])}`),
        () => decl(`@gap:${_}1px`),
    );
    return pick(depth > 0 ? forms : forms.slice(0, 2))();
}

const body = depth => join(some(1, 3, () => statement(depth)));

function doodle() {
    defined = Object.keys(DEFINITIONS).filter(() => chance(.5));
    let definitions = defined.map(name => ({ text: DEFINITIONS[name], block: name !== 'twice' }));
    return [definitions, some(1, 3, () => statement(3, true))];
}

// --- properties ---

function failures(label, cases) {
    if (cases.length) assert.fail(`${cases.length} ${label}, the first ones:\n\n${cases.slice(0, 3).join('\n\n')}`);
}

test('§8: the fewest parentheses evaluate as the full ones', () => {
    random = makeRandom(SEED);
    let failed = [];
    for (let n = 0; n < ROUNDS * 10; n++) {
        let e = expression(4), a, b;
        try {
            a = calc(e.min, CONTEXT);
            b = calc(e.full, CONTEXT);
        } catch (error) {
            failed.push(`throws ${error.message}:\n${e.min}`);
            continue;
        }
        if (!(a === b || Object.is(a, b))) failed.push(`${e.min}  →  ${a}\n${e.full}  →  ${b}`);
    }
    failures('expressions fail', failed);
});

test('§2–§7: a doodle compiles cleanly, the same each time, with whitespace where §1 drops it and through @use', () => {
    random = makeRandom(SEED);
    let failed = [];
    let compile = tokens => {
        let out = generateCss(tokens, parseGrid('3x2'), 42, 64);
        // inline @svg defs ids count up across compiles, svg.js nextInlineId
        return JSON.stringify([out.styles.all, out.styles.top, out.content])
            .replace(/(linearGradient|radialGradient|pattern|filter|clipPath|mask|marker|symbol)-\d+/g, '$1-n');
    };
    for (let n = 0; n < ROUNDS; n++) {
        let [definitions, statements] = doodle();
        let code = join([...definitions, ...statements]), source = plain(code), loose = spaced(code);
        // the same statements stored in a custom property and inserted (§2)
        let used = plain(join([...definitions, decl(`@use:${_}var(--u)`)]));
        let extra = { getVariable: name => name === '--u' ? plain(join(statements)) : '' };
        try {
            let tokens = parseCss(source);
            let first = compile(tokens);
            if (/\bundefined\b|\bNaN\b|\[object /.test(first)) failed.push(`leaks:\n${source}`);
            else if (compile(tokens) !== first) failed.push(`differs on the same tokens:\n${source}`);
            else if (compile(parseCss(source)) !== first) failed.push(`differs on a second parse:\n${source}`);
            else if (compile(parseCss(loose)) !== first) failed.push(`differs with whitespace:\n${source}\n--- spaced ---\n${loose}`);
            else if (compile(parseCss(used, extra)) !== first) failed.push(`differs through @use:\n${source}`);
        } catch (e) {
            failed.push(`throws ${e && e.stack || e}:\n${source}`);
        }
    }
    failures('doodles fail', failed);
});

test('§9.1: an @svg body read from its own source gives the same tree', () => {
    random = makeRandom(SEED);
    let failed = [];
    let tree = source => JSON.stringify(parseSvg(source), (k, v) => k === 'origin' ? undefined : v);
    for (let n = 0; n < ROUNDS; n++) {
        let code = svgBody(3, false), source = plain(code), loose = spaced(code);
        let first = tree(source), back = svgSourceOf(parseSvg(source), { repeat: false });
        if (tree(back) !== first) failed.push(`source differs:\n${source}\n--- read back ---\n${back}`);
        else if (tree(loose) !== first) failed.push(`differs with whitespace:\n${source}\n--- spaced ---\n${loose}`);
    }
    failures('svg bodies fail', failed);
});
