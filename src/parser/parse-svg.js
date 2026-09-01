import { scan, iterator } from './tokenizer.js';
import parseValueGroup from './parse-value-group.js';

const SPECIAL_NAMESPACE_PREFIXES = [
    'xlink:actuate', 'xlink:arcrole', 'xlink:href', 'xlink:role',
    'xlink:show',    'xlink:title',   'xlink:type',
    'xml:base',      'xml:lang',      'xml:space',
];

function isSkip(...names) {
    return names.includes('style');
}

function isBlock(type) {
    return type === 'block';
}

function joinToken(tokens) {
    let len = tokens.length;
    if (len && tokens[len - 1].isSymbol(';', '}')) {
        tokens = tokens.slice(0, len - 1);
    }
    return tokens.map(n => n.value).join('');
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
    let name = block.name || '';
    let baseName = name.split(/[#.]/)[0];
    if (skip || !baseName) {
        return block;
    }
    // pureName has the `*times` suffix stripped so it can't leak into id/class
    let selector = block.pureName || name;
    let id = selector.match(/#([^.#]+)/);
    if (id) {
        block.value.push({ type: 'statement', name: 'id', value: id[1] });
    }
    let classes = selector.match(/\.([^.#]+)/g);
    if (classes) {
        block.value.push({
            type: 'statement',
            name: 'class',
            value: classes.map(c => c.slice(1)).join(' ')
        });
    }
    block.name = baseName;
    return block;
}

// Build the (possibly nested) block for a selector chain like `g circle`.
function readBlock(iter, selectors, skip) {
    let name = selectors.pop();
    let block = resolveId(walk(iter, splitTimes(name, {
        type: 'block',
        name,
        value: []
    })), skip);
    while (name = selectors.pop()) {
        block = resolveId(splitTimes(name, {
            type: 'block',
            name,
            value: [block]
        }), skip);
    }
    return block;
}

function readStatement(iter, token) {
    let fragment = [];
    let inlineBlock;
    let stackQuote = [];
    let stackParen = [];
    while (iter.next()) {
        let { curr, next } = iter.get();
        if (curr.isSymbol('(') && !stackQuote.length) {
            stackParen.push(curr);
        } else if (curr.isSymbol(')') && !stackQuote.length) {
            stackParen.pop();
        }
        if (curr.isSymbol("'", '"')) {
            if (curr.status === 'open') {
                stackQuote.push(curr);
            } else if (curr.status === 'close') {
                stackQuote.pop();
            }
        }
        let isStatementBreak = !stackQuote.length
            && !stackParen.length
            && (!next || curr.isSymbol(';') || next.isSymbol('}'));

        if (curr.isSymbol("'", '"') && next && next.isSymbol('}') && !stackQuote.length) {
            isStatementBreak = true;
        }
        if (!stackParen.length && !stackQuote.length && curr.isSymbol('{')) {
            let selectors = getSelectors(fragment);
            if (!selectors.length) {
                continue;
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
        token._valueTokens = fragment;
        token.value = joinToken(fragment);
    }
    if (token.origin) {
        token.origin.value = token.value;
    }
    return token;
}

function readStyle(iter) {
    let stack = [];
    let style = [];
    while (iter.next()) {
        let { curr } = iter.get();
        if (curr.isSymbol('{')) {
            stack.push(curr.value);
        } else if (curr.isSymbol('}')) {
            if (!stack.length) {
                break;
            }
            stack.pop();
        }
        style.push(curr.value);
    }
    return style.join('');
}

function readStyleBlock(iter, selectors) {
    let cssSelectors = selectors.slice(selectors.indexOf('style') + 1);
    let styleContent = readStyle(iter);
    if (cssSelectors.length) {
        styleContent = cssSelectors.join(' ') + '{' + styleContent + '}';
    }
    return {
        type: 'block',
        name: 'style',
        value: styleContent
    };
}

function walk(iter, parentToken) {
    let rules = [];
    let fragment = [];
    let tokenType = parentToken && parentToken.type || '';
    let stack = [];

    while (iter.next()) {
        let { prev, curr, next } = iter.get();
        if (curr.isSymbol('(')) {
            stack.push(curr.value);
        }
        if (curr.isSymbol(')') && stack.length) {
            stack.pop();
        }
        let isBlockBreak = !next || curr.isSymbol('}');
        if (isBlock(tokenType) && isBlockBreak) {
            if (!next && rules.length && !curr.isSymbol('}')) {
                let last = rules[rules.length - 1];
                if (typeof last.value === 'string') {
                    last.value += (';' + curr.value);
                }
            }
            parentToken.value = rules;
            break;
        }
        else if (curr.isSymbol('{')) {
            let selectors = getSelectors(fragment);
            if (!selectors.length) {
                continue;
            }
            if (isSkip(parentToken.name)) {
                selectors = [joinToken(fragment)];
            }
            if (selectors.includes('style')) {
                rules.push(readStyleBlock(iter, selectors));
            } else {
                let skip = isSkip(...selectors, parentToken.name);
                rules.push(readBlock(iter, selectors, skip));
            }
            fragment = [];
        }
        else if (
            curr.isSymbol(':')
            && !stack.length
            && !isSpecialProperty(prev, next)
            && fragment.length
        ) {
            let props = getGroups(fragment, token => token.isSymbol(','));
            let initial = {
                type: 'statement',
                name: 'unknown',
                value: ''
            };
            if (props.length > 1) {
                initial.origin = { name: props };
            }
            let statement = readStatement(iter, initial);
            let groupedValue = parseValueGroup(statement.value);
            let expand = (props.length > 1 && groupedValue.length === props.length);

            props.forEach((prop, i) => {
                let item = Object.assign({}, statement, { name: prop });
                if (/^\-\-/.test(prop)) {
                    item.variable = true;
                }
                if (expand) {
                    item.value = groupedValue[i];
                }
                if (/viewBox/i.test(prop)) {
                    item.detail = parseViewBox(item.value, item._valueTokens);
                }
                delete item._valueTokens;
                rules.push(item);
            });
            if (isBlock(tokenType)) {
                parentToken.value = rules;
            }
            fragment = [];
        }
        else if (curr.isSymbol(';')) {
            if (rules.length && fragment.length) {
                let last = rules[rules.length - 1];
                if (typeof last.value === 'string') {
                    last.value += (';' + joinToken(fragment));
                }
                fragment = [];
            }
        }
        else {
            fragment.push(curr);
        }
    }

    if (rules.length && isBlock(tokenType)) {
        parentToken.value = rules;
    }
    return tokenType ? parentToken : rules;
}

function isSpecialProperty(prev, next) {
    let prevValue = prev && prev.value;
    let nextValue = next && next.value;
    return SPECIAL_NAMESPACE_PREFIXES.includes(prevValue + ':' + nextValue);
}

function getGroups(tokens, fn) {
    let group = [];
    let temp = [];
    tokens.forEach(token => {
        if (fn(token)) {
            group.push(joinToken(temp));
            temp = [];
        } else {
            temp.push(token);
        }
    });
    if (temp.length) {
        group.push(joinToken(temp));
    }
    return group;
}

function getSelectors(tokens) {
    let result = [];
    let it = iterator(tokens);
    let hasSymbol;
    while (it.next()) {
        let { prev, curr, next } = it.get();
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
            if (viewBox.value.length < 4) {
                viewBox.value.push(Number(token.value));
            } else if (field) {
                viewBox[field] = Number(token.value);
                field = null;
            }
        } else if (token.isWord()) {
            field = token.value;
        }
    }
    return viewBox;
}

function skipHeadSVG(block) {
    let headSVG, headVariables = [];
    for (let item of block.value) {
        if (item.name === 'svg') {
            headSVG = item;
        }
        if (item.variable) {
            headVariables.push(item);
        }
    }
    if (headSVG && Array.isArray(headSVG.value)) {
        for (let variable of headVariables) {
            if (!headSVG.value.find(n => n.name == variable.name)) {
                headSVG.value.unshift(variable);
            }
        }
        return headSVG;
    }
    return block;
}

function parse(source, root) {
    let iter = iterator(scan(source));
    let tokens = walk(iter, root || {
        type: 'block',
        name: 'svg',
        value: []
    });
    // walk assigns value only when the input has rules
    if (!Array.isArray(tokens.value)) {
        tokens.value = [];
    }
    return skipHeadSVG(tokens);
}

export default parse;
