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

function lastPrimitive(output) {
    return output.findLast(isPrimitive);
}

function resultNames(tokens) {
    let used = new Set(tokens.filter(isPrimitive).flatMap(token => {
        let result = findStatement(token.value, 'result');
        return result ? [removeQuotes(result.value)] : [];
    }));
    let id = 0;
    return kind => {
        let name;
        do name = `cssd-${kind}-${++id}`;
        while (used.has(name));
        used.add(name);
        return name;
    };
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
    if (!g.scale) {
        el('feTurbulence', turbulence);
        return;
    }
    if (!chainInput) {
        el('feTurbulence', turbulence);
        el('feDisplacementMap', [['in', 'SourceGraphic'], ['scale', g.scale]]);
        return;
    }
    // displacement reads from the last primitive in the pipeline
    let input = lastPrimitive(output);
    let inputName = 'SourceGraphic';
    if (input) {
        let result = findStatement(input.value, 'result');
        if (!result) {
            input.value.push(result = statement('result', nextResult('input')));
        }
        inputName = removeQuotes(result.value);
    }
    let noise = nextResult('noise');
    turbulence.push(['result', noise]);
    el('feTurbulence', turbulence);
    el('feDisplacementMap', [['in', inputName], ['in2', noise], ['scale', g.scale]]);
}

export function expandFilterShorthands(root, seed, warn = () => {}, { chainInput = true } = {}) {
    if (root?.name !== 'filter' || !Array.isArray(root.value)) return root;

    let nextResult = resultNames(root.value);
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
    return root;
}

export function expandFilter(root, seed, warn, options) {
    expandFilterShorthands(root, seed, warn, options);
    expandColorMatrices(root, warn);
    return root;
}
