import { scan, iterator } from './tokenizer.js';

function joinToken(tokens) {
    let len = tokens.length;
    if (len && tokens[len - 1].isSymbol(';')) {
        tokens = tokens.slice(0, len - 1);
    }
    return tokens.map(n => n.value).join('');
}

function readStatement(iter, token) {
    let fragment = [];
    while (iter.next()) {
        let { curr, next } = iter.get();
        fragment.push(curr);
        if (!next || curr.isSymbol(';') || next.isSymbol('}')) {
            break;
        }
    }
    if (fragment.length) {
        token.value = joinToken(fragment);
    }
    return token;
}

function parseSelector(tokens) {
    let groups = [];
    let name = '';
    let args = [];
    let fragments = [];
    let depth = 0;

    const flushArg = () => {
        if (fragments.length) {
            args.push(fragments.join(''));
            fragments = [];
        }
    };
    const flushGroup = () => {
        if (name) {
            groups.push({ name, args });
            name = '';
            args = [];
            fragments = [];
        }
    };

    for (let curr of tokens) {
        if (!name.length && curr.isWord()) {
            name = curr.value;
        }
        else if (curr.isSymbol('(')) {
            if (depth++) {
                fragments.push(curr.value);
            }
        }
        else if (curr.isSymbol(')')) {
            if (depth > 1) {
                depth--;
                fragments.push(curr.value);
            } else {
                depth = 0;
                flushArg();
            }
        }
        else if (curr.isSymbol(',')) {
            if (depth > 1) {
                fragments.push(curr.value);
            } else if (depth === 1) {
                args.push(fragments.join(''));
                fragments = [];
            } else {
                flushArg();
                flushGroup();
            }
        }
        else {
            fragments.push(curr.value);
        }
    }
    flushGroup();

    let seen = new Set();
    return groups.filter(n => {
        let key = n.name + '(' + n.args.join('') + ')';
        return seen.has(key) ? false : !!seen.add(key);
    });
}

function walk(iter, parentToken) {
    let rules = [];
    let fragment = [];
    let tokenType = parentToken && parentToken.type || '';
    let stack = [];

    while (iter.next()) {
        let { curr, next } = iter.get();
        if (tokenType === 'block' && (!next || curr.isSymbol('}'))) {
            if (!next && rules.length && !curr.isSymbol('}')) {
                rules[rules.length - 1].value += (';' + curr.value);
            }
            break;
        }
        else if (curr.isSymbol('{') && fragment.length && !stack.length) {
            let selectors = parseSelector(fragment);
            if (!selectors.length) {
                continue;
            }
            let block = walk(iter, { type: 'block', name: 'unkown', value: [] });
            selectors.forEach(({ name, args }) => {
                rules.push(Object.assign({}, block, { name, args }));
            });
            fragment = [];
        }
        else if (curr.isSymbol(':') && fragment.length && !stack.length) {
            rules.push(readStatement(iter, {
                type: 'statement',
                name: joinToken(fragment),
                value: ''
            }));
            fragment = [];
        }
        else if (curr.isSymbol(';')) {
            if (rules.length && fragment.length) {
                rules[rules.length - 1].value += (';' + joinToken(fragment));
                fragment = [];
            }
        }
        else {
            if (curr.isSymbol('(')) {
                stack.push(curr);
            }
            if (curr.isSymbol(')')) {
                stack.pop();
            }
            fragment.push(curr);
        }
    }

    if (tokenType === 'block') {
        parentToken.value = rules;
        return parentToken;
    }
    return rules;
}

function parse(source) {
    return walk(iterator(scan(source)));
}

export default parse;
