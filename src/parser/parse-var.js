import { scan, iterator, textOf } from './tokenizer.js';

function parse(input) {
    return readList(iterator(scan(input)), false);
}

function readList(iter, nested) {
    let rules = [];
    let depth = 0;
    while (iter.next()) {
        let curr = iter.curr();
        let next = iter.curr(1);
        if (curr.value === 'var' && next && next.isSymbol('(')) {
            iter.next();
            let rule = readVar(iter);
            // `--` and a name that does not start with another dash
            if (/^--[^-]/.test(rule.name)) {
                rules.push(rule);
            }
        } else if (nested) {
            if (curr.isSymbol('(')) depth++;
            else if (curr.isSymbol(')') && !depth) break;
            else if (curr.isSymbol(')')) depth--;
        } else if (rules.length && !curr.isSymbol(',')) {
            break;
        }
    }
    return rules;
}

function readVar(iter) {
    let rule = {};
    let tokens = [];
    while (iter.next()) {
        let curr = iter.curr();
        // a `;` closes a var( that was never closed
        if (curr.isSymbol(')', ';', ',')) {
            rule.name = textOf(tokens);
            if (curr.isSymbol(',')) {
                rule.fallback = readList(iter, true);
            }
            break;
        }
        tokens.push(curr);
    }
    return rule;
}

export default parse;
