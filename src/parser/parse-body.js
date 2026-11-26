import { scan, textOf, itemsOf } from './tokenizer.js';

// The body grammar @svg, @paint and @shape share:
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
        if (textOf(head).trim()) rules.push(...readTail(head, rules.at(-1)));
        head = [];
    };

    for (let curr; (curr = iter.next());) {
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

// A block body kept as text (`style { … }`, a texture section): from the
// '{' the iterator stands on to the matching '}', skipping quoted ones.
function readRaw(iter) {
    let tokens = [];
    let depth = 0;
    let quote = false;
    for (let curr; (curr = iter.next());) {
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

const reads = (code, name) => new RegExp(`(?<![a-zA-Z_]\\w*|\\.)${name}\\b(?!\\s*:)|\\bpick\\([^:;{}]*?(?<![\\w.])${name}\\s*:`).test(code);

// a name is used when the language made it, as a user function's `f_1_k`
// or a match block's `match_1_`, or when code reads it but as its own target
const used = (code, name) => /^\w+_\d+_/.test(name) || reads(code, name);

// `a, b: 1, 2`: the names of a declaration take a part of its value
// each when split gives as many parts as names, the whole value otherwise
const namesOf = head => itemsOf(head).map(t => textOf(t).trim());

function rowsOf(names, value, split) {
    let parts = names.length > 1 && split(value);
    return names.map((name, i) => ({ name, value: parts.length === names.length ? parts[i] : value }));
}

// `repeat(4 as k)` → { name, inner }: one word, then the tokens inside its
// parens, or null inner without them; anything else but stray closing
// parens after them makes it no call
function callOf(head) {
    let open = head.findIndex(t => t.isSymbol('('));
    let [word, ...rest] = (open < 0 ? head : head.slice(0, open)).filter(t => !t.isSpace());
    if (!word?.isWord() || rest.length) return null;
    if (open < 0) return { name: word.value, inner: null };
    let close = open + 1;
    for (let depth = 1; close < head.length && depth; ++close) {
        depth += head[close].isSymbol('(') - head[close].isSymbol(')');
    }
    if (head.slice(close).some(t => !t.isSpace() && !t.isSymbol(')'))) return null;
    return { name: word.value, inner: head.slice(open + 1, head[close - 1].isSymbol(')') ? close - 1 : close) };
}

// `match(test) { … }`, or `match { test { … } … else { … } }` when arms
// are allowed: one block of arms either way, read by the language's reader
function readMatch(iter, head, reader, arms = true) {
    let call = callOf(head);
    if (call?.name !== 'match' || !call.inner && !arms) return null;
    let arm = (iter, test) => parseBody(iter, { type: 'arm', test }, reader);
    return { type: 'block', name: 'match', arms: call.inner
        ? [arm(iter, textOf(call.inner).trim().replace(/^else$/, ''))]
        : parseBody(iter, {}, { ...reader, readBlocks: (iter, head) => [arm(iter, textOf(head).trim())] }).value };
}

// the arms that can run, each with one test and else last
function armsOf(arms, warn) {
    return arms.filter(({ type, test }, k) => {
        if (type !== 'arm' || !test) warn('arm needs test');
        else if (test === 'else' && k < arms.length - 1) warn('else goes last');
        else if (test.includes(',') && itemsOf(scan(test)).length > 1) warn('match() needs expr');
        else return true;
    });
}

// the number of the arm that runs, else's when no test holds, 0 without one
const armIndex = arms => `match(${arms.map(({ test }, k) => test === 'else' ? '' : `(${test}), ${k + 1}, `).join('')}${arms.findIndex(a => a.test === 'else') + 1})`;

export { parseBody, readRaw, readValue, reads, used, namesOf, rowsOf, callOf, readMatch, armsOf, armIndex };
