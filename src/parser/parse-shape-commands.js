import { scan, iterator } from './tokenizer.js';

const KEEP_NEGATIVE = ['fill-rule', 'fill'];

function joinTokens(tokens) {
    return tokens.map(n => n.value).join('');
}

function addCommand(commands, name, tokens, negative) {
    let value = joinTokens(tokens);
    commands[name] = (negative && !KEEP_NEGATIVE.includes(name))
        ? `-1 * (${value})`
        : value;
}

function parse(input) {
    let iter = iterator(scan(input));
    let commands = {};
    let tokens = [];
    let name;
    let negative = false;
    while (iter.next()) {
        let { prev, curr, next } = iter.get();
        if (curr.isSymbol(':') && !name) {
            name = joinTokens(tokens);
            tokens = [];
        } else if (curr.isSymbol(';')) {
            if (name) {
                addCommand(commands, name, tokens, negative);
                tokens = [];
                name = null;
                negative = false;
            }
        } else {
            let isLeadingMinus = !name && !tokens.length
                && curr.isSymbol('-')
                && !(prev && prev.isSymbol('-'))
                && !(next && next.isSymbol('-'));
            if (isLeadingMinus && !(next && next.isSymbol(':'))) {
                negative = true;
            } else {
                tokens.push(curr);
            }
        }
    }
    if (tokens.length && name) {
        addCommand(commands, name, tokens, negative);
    }
    return commands;
}

export default parse;
