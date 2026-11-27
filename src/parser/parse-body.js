import { scan, textOf, itemsOf } from './tokenizer.js';


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

const reads = (code, name) => new RegExp(`(?<![a-zA-Z_]\\w*|\\.)${name}\\b(?!\\s*:)|\\bpick\\([^:;{}]*?(?<![a-zA-Z_]\\w*|\\.)${name}\\s*:`).test(code);

const used = (code, name) => /^\w+_\d+_/.test(name) || reads(code, name);

const namesOf = head => itemsOf(head).map(t => textOf(t).trim());

function rowsOf(names, value, split) {
    let parts = names.length > 1 && split(value);
    return names.map((name, i) => ({ name, value: parts.length === names.length ? parts[i] : value }));
}

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

function readMatch(iter, head, reader, arms = true) {
    let call = callOf(head);
    if (call?.name !== 'match' || !call.inner && !arms) return null;
    let arm = (iter, test) => parseBody(iter, { type: 'arm', test }, reader);
    return { type: 'block', name: 'match', arms: call.inner
        ? [arm(iter, textOf(call.inner).trim().replace(/^else$/, ''))]
        : parseBody(iter, {}, { ...reader, readBlocks: (iter, head) => [arm(iter, textOf(head).trim())] }).value };
}

function armsOf(arms, warn) {
    return arms.filter(({ type, test }, k) => {
        if (type !== 'arm' || !test) warn('arm needs test');
        else if (test === 'else' && k < arms.length - 1) warn('else goes last');
        else if (test.includes(',') && itemsOf(scan(test)).length > 1) warn('match() needs expr');
        else return true;
    });
}

const armIndex = arms => `match(${arms.map(({ test }, k) => test === 'else' ? '' : `(${test}), ${k + 1}, `).join('')}${arms.findIndex(a => a.test === 'else') + 1})`;

export { parseBody, readRaw, readValue, reads, used, namesOf, rowsOf, callOf, readMatch, armsOf, armIndex };
