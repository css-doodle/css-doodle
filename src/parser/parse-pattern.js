import { scan, iterator, textOf, itemsOf } from './tokenizer.js';
import { parseBody } from './parse-body.js';

// `match(x > y), match(mod(x, 2) == 0, y > 3)` → { name, args } per
// selector, duplicates dropped
function parseSelector(tokens) {
    let selectors = [];
    let seen = new Set();
    for (let group of itemsOf(tokens)) {
        let open = group.findIndex(t => t.isSymbol('('));
        let head = open < 0 ? group : group.slice(0, open);
        let word = head.find(t => t.isWord());
        if (!word) {
            continue;
        }
        let args = [];
        if (open >= 0) {
            let close = open + 1;
            for (let depth = 1; close < group.length && depth; ++close) {
                if (group[close].isSymbol('(')) depth++;
                else if (group[close].isSymbol(')')) depth--;
            }
            let inner = group.slice(open + 1, group[close - 1].isSymbol(')') ? close - 1 : close);
            args = itemsOf(inner).map(textOf);
        }
        let key = word.value + '(' + args.join('') + ')';
        if (!seen.has(key)) {
            seen.add(key);
            selectors.push({ name: word.value, args });
        }
    }
    return selectors;
}

// one block per selector, all over the same body
function readMatchBlocks(iter, head) {
    let selectors = parseSelector(head);
    if (!selectors.length) {
        return null;
    }
    let block = parseBody(iter, { type: 'block', name: '', value: [] }, pattern);
    return selectors.map(({ name, args }) => Object.assign({}, block, { name, args }));
}

// a value runs to the ';' or the end of the block
function readPatternStatement(iter, head) {
    let value = [];
    while (iter.next()) {
        let { curr, next } = iter.get();
        if (curr.isSymbol(';')) {
            break;
        }
        value.push(curr);
        if (!next || next.isSymbol('}')) {
            break;
        }
    }
    return [{ type: 'statement', name: textOf(head), value: textOf(value) }];
}

const pattern = {
    readBlocks: readMatchBlocks,
    readStatement: readPatternStatement,
};

function parse(source) {
    return parseBody(iterator(scan(source)), null, pattern);
}

export default parse;
