import { scan, iterator, textOf, itemsOf } from './tokenizer.js';
import { parseBody, readRaw, readValue } from './parse-body.js';

// `match(x > y)` → { name, args }: one word, then its parens; anything
// else but stray closing parens makes it no selector
function parseSelector(tokens) {
    let open = tokens.findIndex(t => t.isSymbol('('));
    let [word, ...rest] = (open < 0 ? tokens : tokens.slice(0, open)).filter(t => !t.isSpace());
    if (!word?.isWord() || rest.length) return null;
    let args = [];
    if (open >= 0) {
        let close = open + 1;
        for (let depth = 1; close < tokens.length && depth; ++close) {
            if (tokens[close].isSymbol('(')) depth++;
            else if (tokens[close].isSymbol(')')) depth--;
        }
        if (tokens.slice(close).some(t => !t.isSpace() && !t.isSymbol(')'))) return null;
        let inner = tokens.slice(open + 1, tokens[close - 1].isSymbol(')') ? close - 1 : close);
        args = itemsOf(inner).map(textOf);
    }
    return { name: word.value, args };
}

function readArm(iter, head) {
    return [parseBody(iter, { type: 'arm', test: textOf(head), value: [] }, pattern)];
}

function readMatchBlocks(iter, head) {
    let name = textOf(head);
    if (/^texture\w*$/.test(name)) {
        return [{ type: 'texture', name, value: textOf(readRaw(iter)) }];
    }
    if (head.length === 1 && head[0].value === 'match') {
        let { value } = parseBody(iter, {}, { readBlocks: readArm, readStatement: readPatternStatement, readTail });
        return [{ type: 'block', name: 'match', arms: value }];
    }
    let selector = parseSelector(head);
    if (!selector) {
        readRaw(iter);
        return readTail([...head, { value: ' {}' }]);
    }
    return [parseBody(iter, { type: 'block', ...selector, value: [] }, pattern)];
}

function readPatternStatement(iter, head) {
    return [{ type: 'statement', name: textOf(head), value: textOf(readValue(iter)) }];
}

function readTail(head) {
    return [{ type: 'text', value: textOf(head).trim() }];
}

const pattern = {
    readBlocks: readMatchBlocks,
    readStatement: readPatternStatement,
    readTail,
};

function parse(source) {
    return parseBody(iterator(scan(source, { ignoreInlineComment: true })), null, pattern);
}

export default parse;
