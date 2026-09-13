import * as acorn from 'acorn';

const TAGS = ['css', 'svg', 'glsl'];
export const TAG_RE = new RegExp(String.raw`\b(?:${TAGS.join('|')})\``);

const GLSL_PUNCT = /[-+*/%<>=!&|?:,;(){}\[\]]/;
const GLSL_GLUE = /^(\+\+|--|<<|>>|<=|>=|==|!=|&&|\|\||\^\^|[-+*/%&|^]=|\/[/*])$/;

function cssCollapse(s) {
    return s
        .replace(/([:;><{])\s+/g, '$1')
        .replace(/\s+([:;><}{])/g, '$1')
        .replace(/\s+([{}])\s+/g, '$1')
        .replace(/>\s+</g, '><')
        .replace(/\s{2,}/g, ' ');
}

function glslSqueeze(line) {
    return line.replace(/\s+/g, ' ').replace(/(.) (?=(.))/g, (space, before, after) =>
        (GLSL_PUNCT.test(before) || GLSL_PUNCT.test(after)) && !GLSL_GLUE.test(before + after)
            ? before
            : space
    );
}

function boundary(ws) {
    return ws === undefined ? '' : ws.includes('\n') ? '\n' : ' ';
}

function glslCollapse(s) {
    const leading = boundary(s.match(/^\s+/)?.[0]);
    const trailing = boundary(s.match(/\s+$/)?.[0]);
    const kept = s.split('\n').map(l => l.replace(/\/\/.*$/, '').trim()).filter(Boolean);
    let out = kept[0] ?? '';
    for (let i = 1; i < kept.length; i++) {
        // `#` directives own their line, so they keep the newline on both sides.
        const directive = /^#/.test(kept[i - 1]) || /^#/.test(kept[i]);
        out += (directive ? '\n' : ' ') + kept[i];
    }
    out = out.split('\n').map(l => /^#/.test(l) ? l : glslSqueeze(l)).join('\n');
    if (!out) return leading === '\n' || trailing === '\n' ? '\n' : leading || trailing;
    return leading + out + trailing;
}

function walk(node, visit) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
        for (const n of node) walk(n, visit);
        return;
    }
    if (node.type) visit(node);
    for (const key in node) walk(node[key], visit);
}

export function stripTaggedTemplates(src) {
    const ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'module' });
    const edits = [];
    walk(ast, node => {
        if (node.type !== 'TaggedTemplateExpression') return;
        if (node.tag.type !== 'Identifier' || !TAGS.includes(node.tag.name)) return;
        const collapse = node.tag.name === 'glsl' ? glslCollapse : cssCollapse;
        edits.push({ start: node.tag.start, end: node.quasi.start, text: '' });
        for (const quasi of node.quasi.quasis) {
            edits.push({ start: quasi.start, end: quasi.end, text: collapse(quasi.value.raw) });
        }
    });
    edits.sort((a, b) => b.start - a.start);
    for (const { start, end, text } of edits) {
        src = src.slice(0, start) + text + src.slice(end);
    }
    return src.trim();
}
