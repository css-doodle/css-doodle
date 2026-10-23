import { textOf } from './tokenizer.js';

// The body grammar @svg, @pattern, @shape and @shaders sections share:
//
//   body        = { declaration | block | ';' }
//   declaration = head ':' value [ ';' ]
//   block       = head '{' ( body | raw ) '}'
//
// The language supplies three readers. Two get the iterator on the
// ':' or '{' and the head tokens before it; null means the symbol is
// no separator here: readBlocks keeps the head and skips the '{',
// readStatement leaves the ':' in the head (xlink:href). readTail gets
// a head that ends with neither, and the rule before it.

function parseBody(iter, parent, { readBlocks, readStatement, readTail }) {
    let rules = [];
    let head = [];
    let depth = 0;

    const appendTail = () => {
        if (textOf(head).trim()) rules.push(...readTail(head, rules[rules.length - 1]));
        head = [];
    };

    while (iter.next()) {
        let curr = iter.curr();
        let next = iter.curr(1);
        if (curr.isSymbol('(')) {
            depth++;
        } else if (curr.isSymbol(')') && depth) {
            depth--;
        }
        if (parent && (!next || curr.isSymbol('}') && !depth)) {
            if (!curr.isSymbol('}', ';')) {
                head.push(curr);
            }
            appendTail();
            break;
        }
        else if (curr.isSymbol('{') && !depth) {
            let blocks = readBlocks(iter, head);
            if (blocks) {
                rules.push(...blocks);
                head = [];
            }
        }
        else if (curr.isSymbol(':') && !depth && head.length) {
            let statements = readStatement(iter, head);
            if (statements) {
                rules.push(...statements);
                head = [];
            } else {
                head.push(curr);
            }
        }
        else if (curr.isSymbol(';') && !depth) {
            appendTail();
        }
        else {
            head.push(curr);
        }
    }

    appendTail();
    if (parent) {
        parent.value = rules;
        return parent;
    }
    return rules;
}

// A block body kept as text (`style { … }`, a shader section): from the
// '{' the iterator stands on to the matching '}', skipping quoted ones.
function readRaw(iter) {
    let tokens = [];
    let depth = 0;
    let quote = false;
    while (iter.next()) {
        let curr = iter.curr();
        if (curr.status) {
            quote = curr.status === 'open';
        } else if (quote) {
        } else if (curr.isSymbol('{')) {
            depth++;
        } else if (curr.isSymbol('}')) {
            if (!depth) break;
            depth--;
        }
        tokens.push(curr);
    }
    return tokens;
}

// A declaration value: to the ';' or the end of the block; a `;` inside
// parentheses or quotes stays: `seq(1; 2)`, `text: 'a;b'`
function readValue(iter) {
    let value = [], depth = 0, quote = false;
    while (iter.curr(1) && (quote || !iter.curr(1).isSymbol('}')) && iter.next()) {
        let curr = iter.curr();
        if (curr.status) quote = curr.status === 'open';
        else if (!quote) {
            if (curr.isSymbol('(')) depth++;
            else if (curr.isSymbol(')') && depth) depth--;
            else if (curr.isSymbol(';') && !depth) break;
        }
        value.push(curr);
    }
    return value;
}

export { parseBody, readRaw, readValue };
