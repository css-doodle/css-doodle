import { parseLinear } from '../parser/parse-linear-expr.js';

const CHANNELS = ['r', 'g', 'b', 'a'];

function tidyCoefficient(value) {
    return Number.isInteger(value) ? value + 0 : Number(value.toPrecision(12));
}

function parseRow(input) {
    let expr = String(input).trim().toLowerCase();
    if (!expr) return;
    let { coefficients, constant, error } = parseLinear(expr, CHANNELS);
    if (error) return;
    return [...coefficients, constant].map(tidyCoefficient);
}

export function expandColorMatrices(root, warn = () => {}) {
    if (root?.name !== 'filter' || !Array.isArray(root.value)) return root;
    for (let token of root.value) {
        if (token.type !== 'block' || token.name.toLowerCase() !== 'channels') continue;
        let rows = [[1, 0, 0, 0, 0], [0, 1, 0, 0, 0], [0, 0, 1, 0, 0], [0, 0, 0, 1, 0]];
        let attributes = [];
        for (let t of token.value) {
            if (t.type !== 'statement') continue;
            let channel = CHANNELS.indexOf(t.name.toLowerCase());
            if (channel < 0) {
                attributes.push(t);
                continue;
            }
            let row = parseRow(t.value);
            if (row) {
                rows[channel] = row;
            } else {
                warn(`channels ${t.name}: invalid expression "${t.value}"; keeping identity`);
            }
        }
        token.name = 'feColorMatrix';
        token.value = [
            ...attributes,
            { type: 'statement', name: 'type', value: 'matrix' },
            { type: 'statement', name: 'values', value: rows.flat().join(' ') },
        ];
    }
    return root;
}
