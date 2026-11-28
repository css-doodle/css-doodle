import { scan, iterator, textOf, itemsOf, Token } from './tokenizer.js';
import parseValueGroup from './parse-value-group.js';
import { parseBody, readRaw, namesOf, rowsOf, readMatch } from './parse-body.js';
import { adjustName } from '../lib/svg.js';

const RE_ENTITY_TAIL = /&(#\d+|#x[0-9a-fA-F]+|amp|lt|gt|quot|apos)$/;

function endsEntity(tokens) {
    return RE_ENTITY_TAIL.test(textOf(tokens.slice(-8)));
}

const MAX_BLOCKS = 65536;

function resolveId(block) {
    let selector = block.pureName || block.name;
    let baseName = selector.split(/[#.]/)[0];
    if (!baseName) {
        return block;
    }
    let id = selector.match(/#([^.#]+)/);
    if (id && !block.value.find(n => n.type === 'statement' && n.name === 'id')) {
        block.value.push({ type: 'statement', name: 'id', value: id[1] });
    }
    let classes = selector.match(/\.([^.#]+)/g);
    if (classes) {
        let names = classes.map(c => c.slice(1)).join(' ');
        let at = block.value.findIndex(n => n.type === 'statement' && n.name === 'class');
        if (at >= 0) {
            block.value[at] = { ...block.value[at], value: names + ' ' + block.value[at].value };
        } else {
            block.value.push({ type: 'statement', name: 'class', value: names });
        }
    }
    block.name = adjustName(baseName);
    return block;
}

function makeBlock(name, value = []) {
    let block = { type: 'block', name, value };
    if (/\*\s*[0-9@$(]/.test(name)) {
        let at = name.indexOf('*');
        block.times = name.slice(at + 1).trim();
        block.pureName = name.slice(0, at).trim();
    }
    return block;
}

function wrapChain(block, selectors) {
    let name;
    while (name = selectors.pop()) {
        block = resolveId(makeBlock(name, [block]));
    }
    return block;
}

function readGroupBlocks(iter, groups) {
    let first = groups[0];
    let start = ++iter.blocks;
    let inner = parseBody(iter, makeBlock(first.pop()), svg);
    let size = iter.blocks - start + 1;
    let body = groups.length > 1 ? inner.value.slice() : null;
    let blocks = [wrapChain(resolveId(inner), first)];
    for (let i = 1; i < groups.length && iter.blocks < MAX_BLOCKS; ++i) {
        iter.blocks += size;
        let selectors = groups[i];
        let block = makeBlock(selectors.pop(), structuredClone(body));
        blocks.push(wrapChain(resolveId(block), selectors));
    }
    return blocks;
}

function readStatement(iter, token) {
    let fragment = [];
    let inlineBlock;
    let quote = 0;
    let paren = 0;
    let empty = iter.curr(1)?.isSymbol('}');
    let text = token.name === 'content';
    while (!empty && iter.next()) {
        let curr = iter.curr();
        let next = iter.curr(1);
        if ((curr.isSymbol('(') || text && curr.isSymbol('{')) && !quote) {
            paren++;
        } else if ((curr.isSymbol(')') || text && curr.isSymbol('}')) && !quote && paren) {
            paren--;
        }
        if (curr.status && curr.isSymbol("'", '"')) {
            quote += curr.status === 'open' ? 1 : -1;
        }
        if (!quote && !paren && curr.isSymbol(';')) {
            if (!endsEntity(fragment)) break;
            if (next && !next.isSymbol('}') && next.index > curr.index + 1) {
                fragment.push(curr);
                curr = new Token('Space', ' ', next.pos, curr.index + 1);
            }
        }
        let isStatementBreak = !quote && (!paren || curr.isSymbol("'", '"')) && (!next || next.isSymbol('}'));
        if (!paren && !quote && curr.isSymbol('{')) {
            let selectors = getSelectors(fragment);
            if (!selectors.length) {
                token.value = textOf(readRaw(iter));
                token.raw = true;
                break;
            }
            inlineBlock = readGroupBlocks(iter, [selectors])[0];
            break;
        }
        fragment.push(curr);
        if (isStatementBreak) {
            break;
        }
    }
    if (inlineBlock) {
        token.value = inlineBlock;
        token.value.inline = true;
    } else if (fragment.length) {
        let last = fragment.at(-1);
        token.value = text ? iter.source.slice(fragment[0].index, last.index + last.value.length) : textOf(fragment);
    }
    return fragment;
}

function readStyleBlock(iter, groups) {
    let cssSelectors = groups.map(group => group.slice(group.indexOf('style') + 1).join(' ')).filter(Boolean);
    let styleContent = textOf(readRaw(iter));
    if (cssSelectors.length) {
        styleContent = cssSelectors.join(', ') + '{' + styleContent + '}';
    }
    return makeBlock('style', styleContent);
}

function readSvgBlocks(iter, head) {
    let match = head[0]?.isSymbol('@') && readMatch(iter, head.slice(1), svg, false);
    if (match) {
        let [{ test, value }] = match.arms;
        return [{ ...makeBlock('match', value), test }];
    }
    let groups = getSelectorGroups(head).map(group => group.map(s => /^style$/i.test(s) ? 'style' : s));
    if (!groups.length) {
        return null;
    }
    if (groups[0].includes('style')) {
        return [readStyleBlock(iter, groups)];
    }
    return readGroupBlocks(iter, groups);
}

function readSvgStatement(iter, head) {
    let prev = iter.curr(-1);
    let next = iter.curr(1);
    if (prev && next && /^(xlink:(actuate|arcrole|href|role|show|title|type)|xml:(base|lang|space))$/i.test(prev.value + ':' + next.value)) {
        return null;
    }
    let names = namesOf(head), dashed = names.find(p => p.startsWith('--'));
    let statement = {
        type: 'statement',
        name: names[0],
        value: ''
    };
    let valueTokens = readStatement(iter, statement);
    if (names.length > 1 && !dashed) {
        statement.origin = { name: names, value: statement.value };
    }
    let rows = rowsOf(names, statement.value, parseValueGroup);
    let shared = rows.length > 1 && rows.every(r => r.value === statement.value) && typeof statement.value === 'string'
        && dashed;
    if (shared) {
        rows = [rows.find(r => r.name === shared), ...rows.filter(r => r.name !== shared)];
    }
    return rows.map(({ name, value }, i) => {
        let item = rows.length === 1 ? statement : { ...statement };
        item.name = name;
        item.value = value;
        if (name.startsWith('--')) {
            item.variable = true;
        } else if (!name.includes('--')) {
            item.name = adjustName(name);
        }
        if (shared && i) {
            item.from = shared;
        }
        if (item.name === 'viewBox') {
            item.detail = parseViewBox(valueTokens);
        }
        return item;
    });
}

function readSvgTail(head, last) {
    let text = textOf(head);
    if (last && typeof last.value === 'string') {
        last.value += ';' + text;
        return [];
    }
    return /^\s*[a-z][\w-]*\s*$/i.test(text) ? [makeBlock(adjustName(text.trim()))] : [];
}

const svg = {
    readBlocks: readSvgBlocks,
    readStatement: readSvgStatement,
    readTail: readSvgTail,
};

function getSelectorGroups(tokens) {
    return itemsOf(tokens).map(getSelectors).filter(group => group.length);
}

function getSelectors(tokens) {
    let result = [];
    let it = iterator(tokens);
    let hasSymbol;
    let depth = 0;
    while (it.next()) {
        let curr = it.curr();
        let prev = it.curr(-1);
        if (curr.isSymbol('(')) depth++;
        else if (curr.isSymbol(')') && depth) depth--;
        if (curr.isSymbol('>') && !depth) {
            hasSymbol = false;
            continue;
        }
        let glued = prev?.isNumber();
        if (curr.isWord() && !hasSymbol && !glued || !result.length) {
            result.push(curr.value.trim());
        } else {
            result.push((result.pop() + curr.value).trim());
        }
        if (curr.isSymbol()) {
            hasSymbol = true;
        } else if (!curr.isSpace()) {
            hasSymbol = false;
        }
    }
    return result.filter(name => name.length);
}

function parseViewBox(tokens) {
    const viewBox = { value: [] };
    let field;
    for (let token of tokens) {
        if (token.isNumber()) {
            if (field) {
                viewBox[field] = Number(token.value);
                field = null;
            } else if (viewBox.value.length < 4) {
                viewBox.value.push(Number(token.value));
            }
        } else if (token.isWord()) {
            field = token.value;
        }
    }
    return viewBox;
}

function skipHeadSVG(block) {
    const isRoot = item => item.name === 'svg' && Array.isArray(item.value);
    let headSVG = block.value.find(isRoot);
    if (!headSVG) {
        return block;
    }
    headSVG.value = block.value.flatMap(item => isRoot(item) ? item.value : item);
    return headSVG;
}

function parse(source, root) {
    let iter = Object.assign(iterator(scan(source, { ignoreInlineComment: true })), { source, blocks: 0 });
    let tokens = parseBody(iter, root || makeBlock('svg'), svg);
    return root ? tokens : skipHeadSVG(tokens);
}

export default parse;
