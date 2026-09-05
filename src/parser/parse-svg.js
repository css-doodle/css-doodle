import { scan, iterator, textOf, itemsOf } from './tokenizer.js';
import parseValueGroup from './parse-value-group.js';
import { parseBody, readRaw } from './parse-body.js';
import { adjustName, isSpecialNamespaceAttr } from '../utils/svg.js';

function isSkip(...names) {
    return names.includes('style');
}

// the ';' of `&amp;` or `&#x27;` belongs to the value, not the statement
const RE_ENTITY_TAIL = /&(#\d+|#x[0-9a-fA-F]+|amp|lt|gt|quot|apos)$/;

function endsEntity(tokens) {
    let n = tokens.length;
    let last = tokens[n - 1];
    if (!last || !(last.isWord() || last.isNumber())) return false;
    for (let i = n - 2; i >= 0 && i >= n - 8; --i) {
        let t = tokens[i];
        if (t.isSymbol('&')) {
            let tail = '';
            for (let j = i; j < n; ++j) tail += tokens[j].value;
            return RE_ENTITY_TAIL.test(tail);
        }
        if (!(t.isWord() || t.isNumber())) return false;
    }
    return false;
}

function splitTimes(name, object) {
    let target = Object.assign({}, object);
    if (/\*\s*[0-9]/.test(name)) {
        let [pureName, times] = name.split('*');
        if (times) {
            target.times = times.trim();
            target.pureName = pureName.trim();
        }
    }
    return target;
}

function resolveId(block, skip) {
    // pureName has the `*times` suffix stripped so it can't leak into id/class
    let selector = block.pureName || block.name || '';
    let baseName = selector.split(/[#.]/)[0];
    if (skip || !baseName) {
        return block;
    }
    let id = selector.match(/#([^.#]+)/);
    // an `id:` declaration in the body wins over the selector
    if (id && !block.value.find(n => n.type === 'statement' && n.name === 'id')) {
        block.value.push({ type: 'statement', name: 'id', value: id[1] });
    }
    let classes = selector.match(/\.([^.#]+)/g);
    if (classes) {
        let names = classes.map(c => c.slice(1)).join(' ');
        let at = block.value.findIndex(n => n.type === 'statement' && n.name === 'class');
        // `.a { class: b }` has both; the statement may be shared with a comma group
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
    return splitTimes(name, { type: 'block', name, value });
}

function wrapChain(block, selectors, skip) {
    let name;
    while (name = selectors.pop()) {
        block = resolveId(makeBlock(name, [block]), skip);
    }
    return block;
}

// Build the (possibly nested) block for a selector chain like `g circle`.
function readBlock(iter, selectors, skip) {
    let name = selectors.pop();
    let block = resolveId(parseBody(iter, makeBlock(name), svg), skip);
    return wrapChain(block, selectors, skip);
}

function readGroupBlocks(iter, groups, skip) {
    let first = groups[0];
    let inner = parseBody(iter, makeBlock(first.pop()), svg);
    // snapshot before resolveId adds the first group's id/class
    let body = groups.length > 1 ? inner.value.slice() : null;
    let blocks = [wrapChain(resolveId(inner, skip), first, skip)];
    for (let i = 1; i < groups.length; ++i) {
        let selectors = groups[i];
        let block = makeBlock(selectors.pop(), structuredClone(body));
        blocks.push(wrapChain(resolveId(block, skip), selectors, skip));
    }
    return blocks;
}

function readStatement(iter, token) {
    let fragment = [];
    let inlineBlock;
    let quote = 0;
    let paren = 0;
    // `name: }`: nothing to read, the '}' is the block's
    let empty = iter.curr(1) && iter.curr(1).isSymbol('}');
    while (!empty && iter.next()) {
        let curr = iter.curr();
        let next = iter.curr(1);
        if (curr.isSymbol('(') && !quote) {
            paren++;
        } else if (curr.isSymbol(')') && !quote && paren) {
            paren--;
        }
        if (curr.isSymbol("'", '"')) {
            if (curr.status === 'open') {
                quote++;
            } else if (curr.status === 'close') {
                quote--;
            }
        }
        // the ';' of `&amp;` is content, any other one ends the statement
        if (!quote && !paren && curr.isSymbol(';') && !endsEntity(fragment)) {
            break;
        }
        let isStatementBreak = !quote && !paren && (!next || next.isSymbol('}'));

        if (curr.isSymbol("'", '"') && next && next.isSymbol('}') && !quote) {
            isStatementBreak = true;
        }
        if (!paren && !quote && curr.isSymbol('{')) {
            let selectors = getSelectors(fragment);
            // no selector: `style: { fill: red }` keeps the text as the value
            if (!selectors.length) {
                token.value = textOf(readRaw(iter));
                token.raw = true;
                break;
            }
            inlineBlock = readBlock(iter, selectors, isSkip(...selectors));
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
        token.value = textOf(fragment);
    }
    if (token.origin) {
        token.origin.value = token.value;
    }
    return fragment;
}

function readStyleBlock(iter, selectors) {
    let cssSelectors = selectors.slice(selectors.indexOf('style') + 1);
    let styleContent = textOf(readRaw(iter));
    if (cssSelectors.length) {
        styleContent = cssSelectors.join(' ') + '{' + styleContent + '}';
    }
    return {
        type: 'block',
        name: 'style',
        value: styleContent
    };
}

// the head as svg selectors: `g circle, rect*3 {`, `style {`
function readSvgBlocks(iter, head, parentToken) {
    // `Style {}` is the style block too
    let groups = getSelectorGroups(head).map(group => group.map(s => /^style$/i.test(s) ? 'style' : s));
    if (!groups.length) {
        return null;
    }
    let selectors = groups[0];
    if (isSkip(parentToken.name)) {
        selectors = [textOf(head)];
        groups = [selectors];
    }
    if (selectors.includes('style')) {
        return [readStyleBlock(iter, selectors)];
    }
    let skip = isSkip(...selectors, parentToken.name);
    return readGroupBlocks(iter, groups, skip);
}

// `cx: 1`; `x, y: 1, 2` expanded; viewBox with its numbers; `--name`
// flagged as a variable; null for the ':' of `xlink:href`
function readSvgStatement(iter, head) {
    if (isSpecialProperty(iter.curr(-1), iter.curr(1))) {
        return null;
    }
    let props = getGroups(head);
    let statement = {
        type: 'statement',
        name: 'unknown',
        value: ''
    };
    if (props.length > 1) {
        statement.origin = { name: props };
    }
    let valueTokens = readStatement(iter, statement);
    let groupedValue = props.length > 1 ? parseValueGroup(statement.value) : null;
    let expand = !!groupedValue && groupedValue.length === props.length;

    let rules = [];
    for (let i = 0; i < props.length; ++i) {
        let prop = props[i];
        let item = props.length === 1 ? statement : Object.assign({}, statement);
        item.name = prop;
        if (prop.startsWith('--')) {
            item.variable = true;
        } else if (!prop.includes('--')) {
            // custom properties keep their case
            item.name = adjustName(prop);
        }
        if (expand) {
            item.value = groupedValue[i];
        }
        if (item.name === 'viewBox') {
            item.detail = parseViewBox(item.value, valueTokens);
        }
        rules.push(item);
    }
    return rules;
}

const svg = {
    readBlocks: readSvgBlocks,
    readStatement: readSvgStatement,
};

function isSpecialProperty(prev, next) {
    return !!prev && !!next && isSpecialNamespaceAttr(prev.value + ':' + next.value);
}

function getGroups(tokens) {
    return itemsOf(tokens).map(textOf);
}

// one selector chain per comma group: `g.a > circle*3, rect`
function getSelectorGroups(tokens) {
    return itemsOf(tokens).map(getSelectors).filter(group => group.length);
}

function getSelectors(tokens) {
    let result = [];
    let it = iterator(tokens);
    let hasSymbol;
    while (it.next()) {
        let curr = it.curr();
        let prev = it.curr(-1);
        let next = it.curr(1);
        if (curr.isSymbol('>')) {
            hasSymbol = false;
            continue;
        }
        let isTimeSymbol = (
            prev && next &&
            curr.value === 'x' &&
            prev.isNumber()  &&
            next.isNumber()
        );
        if (curr.isWord() && !hasSymbol && !isTimeSymbol) {
            result.push(curr.value.trim());
        } else if (result.length) {
            result[result.length - 1] = (result[result.length - 1] + curr.value).trim();
        } else {
            result.push(curr.value.trim());
        }
        if (curr.isSymbol()) {
            hasSymbol = true;
        } else if (!curr.isSpace()) {
            hasSymbol = false;
        }
    }
    return result.filter(name => name.length);
}

function parseViewBox(value, tokens) {
    const viewBox = { value: [] };
    if (!Array.isArray(tokens)) {
        return viewBox;
    }
    let field;
    for (let token of tokens) {
        if (token.isSpace() || token.isSymbol(',', ';')) {
            continue;
        }
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

// Everything beside an `svg {}` block belongs to it, in source order
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
    let iter = iterator(scan(source));
    let tokens = parseBody(iter, root || {
        type: 'block',
        name: 'svg',
        value: []
    }, svg);
    return root ? tokens : skipHeadSVG(tokens);
}

export default parse;
