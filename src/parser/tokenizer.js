const symbols = [
    ':', ';', ',', '(', ')', '[', ']',
    '{', '}', 'π', '±', '+', '-', '*',
    '/', '%', '"', "'", '`', '@', '=',
    '^', 'ß', 'β', '_', '<', '>',
    '&', '|', '!', '?', '~',
    '≤', '≥', '≠', '∆'
];

const spacingIgnoredSymbols = new Set([
    ':', ';', ',', '{', '}', '(', ')', '[', ']'
]);

const SYMBOL = 1;
const SPACE = 2;
const HEX = 4;

const ctype = new Uint8Array(128);
for (let i = 48; i <= 57; ++i) ctype[i] = HEX;
for (let i = 97; i <= 102; ++i) ctype[i] |= HEX;
for (let i = 65; i <= 70; ++i) ctype[i] |= HEX;
for (let c of [9, 10, 11, 12, 13, 32]) ctype[c] |= SPACE;

const wideSymbols = new Set();
for (let s of symbols) {
    let c = s.charCodeAt(0);
    if (c < 128) ctype[c] |= SYMBOL;
    else wideSymbols.add(c);
}

function isSymbolCode(c) {
    return c < 128 ? (ctype[c] & SYMBOL) > 0 : wideSymbols.has(c);
}

function isSpaceCode(c) {
    if (c < 128) return (ctype[c] & SPACE) > 0;
    // Non-ASCII part of /\s/
    return c === 0xa0 || c === 0x1680 || (c >= 0x2000 && c <= 0x200a)
            || c === 0x2028 || c === 0x2029 || c === 0x202f || c === 0x205f
            || c === 0x3000 || c === 0xfeff;
}

function isDigitCode(c) {
    return c >= 48 && c <= 57;
}

function isHexCode(c) {
    return c < 128 && (ctype[c] & HEX) > 0;
}

class Token {
    constructor({ type, value, pos, index, status }) {
        this.type = type;
        this.value = value;
        this.pos = pos;
        this.index = index;
        if (status) {
            this.status = status;
        }
    }
    isSymbol(values) {
        let n = arguments.length;
        if (n == 0) {
            return this.type == 'Symbol';
        }
        if (n > 1) {
            for (let i = 0; i < n; ++i) {
                if (arguments[i] === this.value) return true;
            }
            return false;
        }
        return Array.isArray(values) ? values.includes(this.value) : values === this.value;
    }
    isSpace() {
        return this.type == 'Space';
    }
    isNumber() {
        return this.type == 'Number';
    }
    isWord() {
        return this.type == 'Word';
    }
}

function iterator(input) {
    let pointer = -1;
    return {
        curr(n = 0) {
            return input[pointer + n];
        },
        next() {
            return input[++pointer];
        },
        get() {
            return {
                prev: input[pointer - 1],
                curr: input[pointer],
                next: input[pointer + 1],
            }
        }
    }
}

function ignoreSpacingAround(prev, next) {
    let ignoreLeft = spacingIgnoredSymbols.has(prev) && prev !== ')';
    let ignoreRight = spacingIgnoredSymbols.has(next) && next !== '(';
    return ignoreLeft || ignoreRight;
}

// The read* functions return the exclusive end of the token starting at i

function readWord(input, i, len) {
    let j = i + 1;
    while (j < len) {
        let c = input.charCodeAt(j);
        if (isSymbolCode(c) || isSpaceCode(c) || isDigitCode(c) || c === 92 /* \ */) {
            // "</" inside a word stays together for closing tags
            if (!(c === 47 && input.charCodeAt(j - 1) === 60)) break;
        }
        j++;
    }
    return j;
}

function readNumber(input, i) {
    let j = i + 1;
    let hasDot = input.charCodeAt(i) === 46 /* . */;
    while (true) {
        let c = input.charCodeAt(j);
        if (c === 46) {
            // A second dot or a ".." range ends the number
            if (hasDot || input.charCodeAt(j + 1) === 46) break;
            hasDot = true;
        }
        else if (c === 101 || c === 69 /* e E */) {
            let sign = input.charCodeAt(j + 1);
            if ((sign === 43 || sign === 45 /* + - */) && isDigitCode(input.charCodeAt(j + 2))) {
                j += 3;
                continue;
            }
            if (isDigitCode(sign)) {
                j += 2;
                continue;
            }
            break;
        }
        else if (!isDigitCode(c)) break;
        j++;
    }
    return j;
}

function readHexNumber(input, i) {
    let j = i + 3;
    while (isHexCode(input.charCodeAt(j))) j++;
    return j;
}

function last(array) {
    return array[array.length - 1];
}

function scan(source, options = {}) {
    let input = String(source);
    let len = input.length;
    let tokens = [];
    let quote = '';
    let i = 0, row = 0, lineStart = 0;

    while (i < len) {
        let curr = input.charCodeAt(i);
        if (curr === 10 /* \n */) {
            row++;
            lineStart = i + 1;
        }
        let pos = [i - lineStart, row];
        // Offset of the token's first raw char in the input
        let index = i;
        let next = input.charCodeAt(i + 1);

        if (!quote && curr === 47 && next === 42 /* slash-star */) {
            let found = input.indexOf('*/', i + 1);
            let end = found === -1 ? len : found + 2;
            for (let n = input.indexOf('\n', i + 2); n !== -1 && n < end; n = input.indexOf('\n', n + 1)) {
                row++;
                lineStart = n + 1;
            }
            // A comment separates tokens like a space does
            let lastToken = last(tokens);
            let after = input[end];
            if (lastToken && !lastToken.isSpace() && after && !isSpaceCode(input.charCodeAt(end))
                    && !ignoreSpacingAround(lastToken.value, after)) {
                tokens.push(new Token({
                    type: 'Space', value: ' ', pos, index
                }));
            }
            i = end;
        }
        else if (options.ignoreInlineComment && !quote && curr === 47 && next === 47) {
            // Stop before the line break so it gets tokenized as space
            let found = input.indexOf('\n', i + 1);
            i = found === -1 ? len : found;
        }
        else if (curr === 48 && (next === 120 || next === 88 /* x X */) && isHexCode(input.charCodeAt(i + 2))) {
            let end = readHexNumber(input, i);
            tokens.push(new Token({
                type: 'Number', value: '0x' + input.slice(i + 2, end), pos, index
            }));
            i = end;
        }
        else if (isDigitCode(curr) || (
            curr === 46 && isDigitCode(next) && input.charCodeAt(i - 1) !== 46)) {
            let end = readNumber(input, i);
            tokens.push(new Token({
                type: 'Number', value: input.slice(i, end), pos, index
            }));
            i = end;
        }
        else if (quote && curr === 92 /* \ */) {
            let start = i + 1;
            let end = readWord(input, start, len);
            // The escaped char may be a line break
            for (let n = start; n < end; n++) {
                if (input.charCodeAt(n) === 10) {
                    row++;
                    lineStart = n + 1;
                }
            }
            let word = input.slice(start, end).trim();
            if (word.length) {
                tokens.push(new Token({
                    type: 'Word', value: word, pos, index
                }));
            }
            i = end;
        }
        else if (isSymbolCode(curr)) {
            let ch = input[i];
            // A minus before a digit is a sign unless it follows a value
            let isNextDigit = isDigitCode(next) || (next === 46 && isDigitCode(input.charCodeAt(i + 2)));
            if (curr === 45 /* - */ && isNextDigit) {
                let lastToken = last(tokens);
                let isAfterValue = lastToken && (lastToken.isNumber() || lastToken.isWord() || lastToken.isSymbol(')', ']'));
                if (!isAfterValue) {
                    let end = readNumber(input, i);
                    tokens.push(new Token({
                        type: 'Number', value: input.slice(i, end), pos, index
                    }));
                    i = end;
                    continue;
                }
            }

            let token = {
                type: 'Symbol', value: ch, pos, index
            }
            if (curr === 34 || curr === 39 || curr === 96 /* " ' ` */) {
                if (quote === ch) {
                    quote = '';
                    token.status = 'close';
                } else if (!quote) {
                    quote = ch;
                    token.status = 'open';
                }
            }
            tokens.push(new Token(token));
            i++;
        }
        else if (isSpaceCode(curr)) {
            let end = i + 1;
            let hasLineBreak = curr === 10;
            while (end < len) {
                let c = input.charCodeAt(end);
                if (!isSpaceCode(c)) break;
                if (c === 10) {
                    hasLineBreak = true;
                    row++;
                    lineStart = end + 1;
                }
                end++;
            }
            let lastToken = last(tokens);
            // Leading and trailing spaces are dropped
            if (lastToken && end < len) {
                if (quote) {
                    tokens.push(new Token({
                        type: 'Space', value: input.slice(i, end), pos, index
                    }));
                }
                else if (!ignoreSpacingAround(lastToken.value, input[end])) {
                    let value = (options.preserveLineBreak && hasLineBreak) ? '\n' : ' ';
                    if (lastToken.isSpace()) {
                        if (value === '\n') lastToken.value = '\n';
                    } else {
                        tokens.push(new Token({
                            type: 'Space', value, pos, index
                        }));
                    }
                }
            }
            i = end;
        }
        else {
            let end = readWord(input, i, len);
            tokens.push(new Token({
                type: 'Word', value: input.slice(i, end), pos, index
            }));
            i = end;
        }
    }

    // Remove last space token
    let lastToken = last(tokens);
    if (lastToken && lastToken.isSpace()) {
        tokens.length = tokens.length - 1;
    }
    return tokens;
}

export {
    iterator,
    scan,
    Token
}
