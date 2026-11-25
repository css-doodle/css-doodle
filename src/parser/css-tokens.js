// The tokens parse-css.js and expand-functions.js read alike: `$` splits a word, names glue on
import { scan, Token, NAME_CHAR } from './tokenizer.js';

export const RE_NAME_TOKEN = /^[0-9a-zA-Z_\-.%]+$/;
const RE_NAME = new RegExp(`^${NAME_CHAR}*`);

export function tokenEnd(token) {
    return token.index + token.value.length;
}

export function adjacent(a, b) {
    return tokenEnd(a) === b.index;
}

export function nameLength(word) {
    return word.match(RE_NAME)[0].length;
}

export function isNamePart(t) {
    return t.isNumber() || t.isSymbol('-', '_') || t.isWord() && nameLength(t.value) === t.value.length;
}

export function isNameStart(t) {
    return !!t && (t.isWord() || t.isSymbol('_'));
}

function splitDollars(tokens) {
    let result = [];
    let naming = false;
    for (let tok of tokens) {
        naming &&= adjacent(result.at(-1), tok) && (tok.isWord() || tok.isNumber() || tok.isSymbol('-', '_'));
        let { value, pos, index } = tok;
        if (!tok.isWord() || !naming && !value.includes('$')) {
            result.push(tok);
            continue;
        }
        while (value) {
            let k = 1, type = 'Symbol';
            if (value[0] === '$') {
                naming = true;
            } else {
                type = 'Word';
                k = naming ? nameLength(value) : 0;
                naming = k > 0;
                if (!k) k = value.includes('$') ? value.indexOf('$') : value.length;
            }
            result.push(new Token(type, value.slice(0, k), pos, index));
            value = value.slice(k);
            index += k;
        }
    }
    return result;
}

// `paint` for text inside a @pattern or @scene body, where // starts a comment
export function tokensOf(text, paint) {
    let tokens = scan(text, { lineCommentsIn: /^(pattern|scene|shape|plot|tile|svg)/i, ignoreInlineComment: paint });
    return text.includes('$') ? splitDollars(tokens) : tokens;
}
