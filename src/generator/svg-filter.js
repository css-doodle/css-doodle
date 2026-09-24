import parseValueGroup from '../parser/parse-value-group.js';
import parseFilterRegion from '../parser/parse-filter-region.js';
import { removeQuotes } from '../lib/type.js';
import { expandColorMatrices } from './color-matrix.js';

export const FILTER_COMMANDS = [
    'frequency', 'scale', 'octave', 'seed', 'blur', 'erode', 'dilate'
];

const DEFAULT_REGION = parseFilterRegion('20%');

function statement(name, value) {
    return { type: 'statement', name, value };
}

function findStatement(list, name) {
    return list.find(token => token.type === 'statement' && token.name === name);
}

function isPrimitive(token) {
    return token?.type === 'block'
        && Array.isArray(token.value)
        && /^(fe[A-Z]|channels$)/i.test(token.name);
}

function expandGroup(g, output, seed, warn, nextResult, chainInput) {
    let el = (name, attrs) => output.push({
        type: 'block', name,
        value: attrs.map(([n, v]) => statement(n, v)),
    });
    if (g.dilate) el('feMorphology', [['operator', 'dilate'], ['radius', g.dilate]]);
    if (g.erode) el('feMorphology', [['operator', 'erode'], ['radius', g.erode]]);
    if (g.blur) el('feGaussianBlur', [['stdDeviation', g.blur]]);
    if (!g.frequency) {
        for (let name of ['scale', 'octave', 'seed']) {
            if (g[name]) warn(`svg-filter ${name}: needs frequency`);
        }
        return;
    }
    let [x, y = x] = parseValueGroup(g.frequency);
    let turbulence = [
        ['type', 'fractalNoise'],
        ['baseFrequency', `${x} ${y}`],
        ['seed', g.seed ?? seed],
    ];
    if (g.octave) turbulence.push(['numOctaves', g.octave]);
    let input = 'SourceGraphic', noise;
    if (g.scale && chainInput) {
        let last = output.findLast(isPrimitive);
        if (last) {
            let result = findStatement(last.value, 'result');
            if (!result) {
                last.value.push(result = statement('result', nextResult('input')));
            }
            input = removeQuotes(result.value);
        }
        noise = nextResult('noise');
        turbulence.push(['result', noise]);
    }
    el('feTurbulence', turbulence);
    if (g.scale) {
        el('feDisplacementMap', noise
            ? [['in', input], ['in2', noise], ['scale', g.scale]]
            : [['in', input], ['scale', g.scale]]);
    }
}

export function expandFilterShorthands(root, seed, warn = () => {}, { chainInput = true } = {}) {
    if (root?.name !== 'filter' || !Array.isArray(root.value)) return root;

    let used = new Set(root.value.filter(isPrimitive).flatMap(token => {
        let result = findStatement(token.value, 'result');
        return result ? [removeQuotes(result.value)] : [];
    }));
    let id = 0;
    let nextResult = kind => {
        let name;
        do name = `cssd-${kind}-${++id}`;
        while (used.has(name));
        used.add(name);
        return name;
    };
    let output = [];
    let group = null;
    let found = false;
    let region;

    let flush = () => {
        if (group) expandGroup(group, output, seed, warn, nextResult, chainInput);
        group = null;
    };

    for (let token of root.value) {
        let name = token.type === 'statement' && token.name.toLowerCase();
        if (name === 'region') {
            flush();
            found = true;
            let parsed = parseFilterRegion(token.value);
            if (parsed) region = parsed;
            else warn('svg-filter region: invalid value');
            continue;
        }
        if (name && FILTER_COMMANDS.includes(name)) {
            found = true;
            (group ??= { __proto__: null })[name] = token.value;
            continue;
        }
        flush();
        output.push(token);
    }
    flush();

    if (found) {
        output.unshift(...Object.entries(region || DEFAULT_REGION)
            .filter(([name]) => !findStatement(output, name))
            .map(([name, value]) => statement(name, value)));
    }
    root.value = output;
    // numOctaves is an integer; @r() often yields floats
    for (let token of output) {
        if (token.type !== 'block' || token.name.toLowerCase() !== 'feturbulence') continue;
        token.value = token.value.filter(t => {
            if (t.type !== 'statement' || t.name !== 'numOctaves') return true;
            let n = Math.trunc(t.value);
            if (Number.isFinite(n)) {
                t.value = String(Math.max(1, n));
                return true;
            }
            warn('svg-filter numOctaves: expected integer');
        });
    }
    return root;
}

export function expandFilter(root, seed, warn, options) {
    expandFilterShorthands(root, seed, warn, options);
    expandColorMatrices(root, warn);
    return root;
}
