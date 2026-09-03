import { textOf } from './tokenizer.js';

// The body grammar @svg, @pattern and @shaders sections share:
//
//   body        = { declaration | block | ';' }
//   declaration = head ':' value [ ';' ]
//   block       = head '{' ( body | raw ) '}'
//
// The language supplies the two readers. Both get the iterator on the
// ':' or '{' and the head tokens before it; null means the symbol is
// no separator here: readBlocks keeps the head and skips the '{',
// readStatement leaves the ':' in the head (xlink:href).

function parseBody(iter, parent, { readBlocks, readStatement }) {
    let rules = [];
    let head = [];
    let depth = 0;

    // leftovers before a ';' or the end of the block belong to the last
    // statement: `animate { values: 1; 2; 3 }`
    const appendTail = () => {
        let last = rules[rules.length - 1];
        if (last && head.length && typeof last.value === 'string') {
            last.value += ';' + textOf(head);
        }
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
        if (parent && (!next || curr.isSymbol('}'))) {
            if (!curr.isSymbol('}', ';')) {
                head.push(curr);
            }
            appendTail();
            break;
        }
        else if (curr.isSymbol('{')) {
            let blocks = readBlocks(iter, head, parent);
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
        else if (curr.isSymbol(';')) {
            appendTail();
        }
        else {
            head.push(curr);
        }
    }

    if (parent) {
        parent.value = rules;
        return parent;
    }
    return rules;
}

// A block body kept as text (`style { … }`, a shader section): from the
// '{' the iterator stands on to the matching '}'.
function readRaw(iter) {
    let tokens = [];
    let depth = 0;
    while (iter.next()) {
        let curr = iter.curr();
        if (curr.isSymbol('{')) {
            depth++;
        } else if (curr.isSymbol('}')) {
            if (!depth) break;
            depth--;
        }
        tokens.push(curr);
    }
    return tokens;
}

export { parseBody, readRaw };
