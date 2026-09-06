import { scan, iterator, textOf } from './tokenizer.js';

function parse(input) {
    let iter = iterator(scan(input));
    return walk(iter);
}

function walk(iter) {
    let rules = [];
    while (iter.next()) {
        let { curr, next } = iter.get();
        if (curr.value === 'var') {
            if (next && next.isSymbol('(')) {
                iter.next();
                let rule = parseVar(iter);
                if (isValid(rule.name)) {
                    rules.push(rule);
                }
            }
        } else if (rules.length && !curr.isSymbol(',')) {
            break;
        }
    }
    return rules;
}

function parseVar(iter) {
    let ret = {};
    let tokens = [];
    while (iter.next()) {
        let { curr, next } = iter.get();
        if (curr.isSymbol(')', ';') && !ret.name) {
            ret.name = textOf(tokens);
            break;
        }
        else if (curr.isSymbol(',')) {
            if (ret.name === undefined) {
                ret.name = textOf(tokens);
                tokens = [];
            }
            if (ret.name) {
                ret.fallback = walk(iter);
            }
        } else {
            tokens.push(curr);
        }
    }
    return ret;
}

// `--` and a name that does not start with another dash
function isValid(name) {
    return typeof name === 'string' && /^--[^-]/.test(name);
}

export default parse;
