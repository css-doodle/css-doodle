import { scan, iterator, textOf, Token } from './tokenizer.js';
import { readRaw } from './parse-body.js';
import { isEmpty } from '../utils/type.js';

// shaders-body = { section } | fragment-source
// section      = ( 'fragment' | 'vertex' | 'texture' /\w*/ ) '{' raw '}'
//
// Text outside the sections is the fragment source when there is no
// fragment section.
function parse(input) {
    let scanOptions = {
        preserveLineBreak: true,
        ignoreInlineComment: true,
    };
    // a body or a section value from a custom property comes wrapped in parens
    let iter = iterator(removeParens(scan(input, scanOptions)));
    let tokens = [];
    let result = {
        textures: [],
    };
    while (iter.next()) {
        let curr = iter.curr();
        let name = curr.isSymbol('{') ? textOf(tokens) : '';
        if (isIdentifier(name)) {
            let body = readRaw(iter);
            let texture = name.startsWith('texture');
            let value = textOf(removeParens(texture ? body : withLineBreaks(body)));
            if (value.length) {
                if (texture) {
                    result.textures.push({ name, value });
                } else {
                    result[name] = value;
                }
            }
            tokens = [];
        } else {
            tokens.push(curr);
        }
    }

    if (isEmpty(result.fragment)) {
        result.fragment = textOf(removeParens(withLineBreaks(tokens)));
    }
    return result;
}

function isIdentifier(name) {
    return /^texture\w*$|^(fragment|vertex)$/.test(name);
}

function lineBreak() {
    return new Token({ type: 'LineBreak', value: '\n' });
}

// The tokenizer drops line breaks next to ';' and braces; a `#define`
// needs its own line, so put one back before it and where it ends.
function withLineBreaks(tokens) {
    let result = [];
    let line = null;
    for (let i = 0; i < tokens.length; ++i) {
        let curr = tokens[i];
        let next = tokens[i + 1];
        if (line !== null && line != curr.pos[1]) {
            result.push(lineBreak());
            line = null;
        }
        if (curr.isWord() && curr.value.startsWith('#')) {
            result.push(lineBreak());
            line = (next || curr).pos[1];
        }
        result.push(curr);
    }
    return result;
}

function removeParens(tokens) {
    let head = tokens[0];
    let last = tokens[tokens.length - 1];
    while (head && head.isSymbol('(') && last && last.isSymbol(')')) {
        tokens = tokens.slice(1, tokens.length - 1);
        head = tokens[0];
        last = tokens[tokens.length - 1];
    }
    return tokens;
}

export default parse;
