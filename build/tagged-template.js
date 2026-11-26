import * as acorn from 'acorn';

const TAGS = ['css', 'glsl'];
export const TAG_RE = new RegExp(String.raw`\b(?:${TAGS.join('|')})\``);

const GLSL_PUNCT = /[-+*/%<>=!&|^?:,;(){}\[\]]/;
const GLSL_GLUE = /^(\+\+|--|<<|>>|<=|>=|==|!=|&&|\|\||\^\^|[-+*/%&|^]=|\/[/*])$/;

const GLSL_IDENT = /\\[nrtb]|(?<=^|[^a-zA-Z0-9_$])g_[a-zA-Z]\w+\b|(?<=\\[nrtb])g_[a-zA-Z]\w+\b/g;
const GLSL_KEEP = new Set(['g_place', 'g_to']);
const GLSL_CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
const glslNames = new Map();

function mangleGlslIdent(match) {
    if (match[0] === '\\' || GLSL_KEEP.has(match)) return match;
    let short = glslNames.get(match);
    if (!short) {
        let n = glslNames.size;
        short = '_' + GLSL_CHARS[n % 52] + (n >= 52 ? GLSL_CHARS[(n / 52 | 0) - 1] : '');
        glslNames.set(match, short);
    }
    return short;
}

export function mangleGlsl(src) {
    const ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'module' });
    const edits = [];
    const rewrite = text => text.replace(GLSL_IDENT, mangleGlslIdent);
    walk(ast, node => {
        if (node.type === 'Literal' && (typeof node.value === 'string' || node.regex)) {
            const text = rewrite(node.raw);
            if (text !== node.raw) edits.push({ start: node.start, end: node.end, text });
        } else if (node.type === 'TemplateElement') {
            const text = rewrite(node.value.raw);
            if (text !== node.value.raw) edits.push({ start: node.start, end: node.end, text });
        }
    });
    if (!edits.length) return src;
    edits.sort((a, b) => b.start - a.start);
    for (const { start, end, text } of edits) {
        src = src.slice(0, start) + text + src.slice(end);
    }
    return src;
}

function cssCollapse(s) {
    return s
        .replace(/([:;><{])\s+/g, '$1')
        .replace(/\s+([:;><}{])/g, '$1')
        .replace(/\s+([{}])\s+/g, '$1')
        .replace(/>\s+</g, '><')
        .replace(/\s{2,}/g, ' ');
}

function glslSqueeze(line) {
    return line.replace(/\s+/g, ' ')
        // 1.0 → 1., 0.5 → .5
        .replace(/(?<=[^\w.])(\d+\.)0+(?=[^\w.])/g, '$1').replace(/(?<=[^\w.])0\.(?=\d)/g, '.').replace(/(.) (?=(.))/g, (space, before, after) =>
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
    out = out.split('\n').map(l => /^#define (\S+) (.+)$/.test(l)
        ? l.replace(/^#define (\S+) (.+)$/, (_, lhs, rhs) => `#define ${lhs} ${glslSqueeze(rhs)}`)
        : /^#/.test(l) ? l : glslSqueeze(l)
    ).join('\n');
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
