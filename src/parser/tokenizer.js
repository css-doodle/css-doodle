// Tokenizer for css-doodle rules and expressions.

const symbols = [
    ':', ';', ',', '(', ')', '[', ']',
    '{', '}', 'π', '±', '+', '-', '*',
    '/', '%', '"', "'", '`', '@', '=',
    '^', 'ß', 'β', '_', '<', '>',
    '&', '|', '!', '?', '~',
    '≤', '≥', '≠', '∆'
];

const is = {
    escape: c => c == '\\',
    space: c => /\s/.test(c),
    digit: c => /^[0-9]$/.test(c),
    sign: c => /^[+-]$/.test(c),
    dot: c => c == '.',
    quote: c => /^["'`]$/.test(c),
  symbol: c => symbols.includes(c),
  hexNum: c => /^[0-9a-f]$/i.test(c),
  hex: (a, b, c) => a == '0' && is.letter(b, 'x') && is.hexNum(c),
  expWithSign: (a, b, c) => is.letter(a, 'e') && is.sign(b) && is.digit(c),
  exp: (a, b) => is.letter(a, 'e') && is.digit(b),
  dots: (a, b) => is.dot(a) && is.dot(b),
  letter: (a, b) => String(a).toLowerCase() == String(b).toLowerCase(),
  comment: (a, b) => a == '/' && b == '*',
  inlineComment: (a, b) => a == '/' && b === '/',
  closedTag: (a, b) => a == '<' && b == '/',
}

// Charcode classification table for the scanning hot path

const SYMBOL = 1, DIGIT = 2, SPACE = 4, HEX = 8;

const ctype = new Uint8Array(128);
for (let i = 48; i <= 57; ++i) ctype[i] = DIGIT | HEX;
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
    let value = this.value;
    if (n > 1) {
      for (let i = 0; i < n; ++i) {
        if (arguments[i] === value) return true;
      }
      return false;
    }
    if (Array.isArray(values)) {
      for (let i = 0; i < values.length; ++i) {
        if (values[i] === value) return true;
      }
      return false;
    }
    return values === value;
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
  let max = input.length;
  let col = -1, row = 0;
  return {
    curr(n = 0) {
      return input[pointer + n];
    },
    next(n = 1) {
      let next = input[pointer += n];
      if (next === '\n') row++, col = -1;
      else col += n;
      return next;
    },
    end() {
      return pointer >= max;
    },
    get() {
      return {
        prev: input[pointer - 1],
        curr: input[pointer + 0],
        next: input[pointer + 1],
        next2: input[pointer + 2],
        next3: input[pointer + 3],
        pos: [col, row],
      }
    }
  }
}

const spacingIgnoredSymbols = new Set([':', ';', ',', '{', '}', '(', ')', '[', ']']);

function ignoreSpacingSymbol(value) {
  return spacingIgnoredSymbols.has(value);
}

function ignoreSpacingAround(prev, next) {
  let ignoreLeft = ignoreSpacingSymbol(prev) && prev !== ')';
  let ignoreRight = ignoreSpacingSymbol(next) && next !== '(';
  return ignoreLeft || ignoreRight;
}

// The read* functions return the end index (exclusive) of the token
// starting at i. charCodeAt returns NaN past the end of input, and NaN
// fails every comparison, so lookaheads need no bounds checks.

function readWord(input, i, len) {
  let j = i;
  while (j < len - 1) {
    let next = input.charCodeAt(j + 1);
    if (isSymbolCode(next) || isSpaceCode(next) || isDigitCode(next) || next === 92 /* \ */) {
      // "</" inside a word stays together for closing tags
      if (!(next === 47 && input.charCodeAt(j) === 60)) break;
    }
    j++;
  }
  return j + 1;
}

function readNumber(input, i) {
  let j = i;
  let hasDot = false;
  while (true) {
    let next = input.charCodeAt(j + 1);
    if (hasDot && next === 46 /* . */) break;
    if (input.charCodeAt(j) === 46) hasDot = true;
    if (next === 46 && input.charCodeAt(j + 2) === 46) break;
    if (next === 101 || next === 69 /* e E */) {
      let next2 = input.charCodeAt(j + 2);
      if ((next2 === 43 || next2 === 45 /* + - */) && isDigitCode(input.charCodeAt(j + 3))) {
        j += 3;
        continue;
      }
      if (isDigitCode(next2)) {
        j += 2;
        continue;
      }
    }
    if (!isDigitCode(next) && next !== 46) break;
    j++;
  }
  return j + 1;
}

function readHexNumber(input, i, len) {
  let j = i + 2;
  while (j < len - 1 && isHexCode(input.charCodeAt(j + 1))) j++;
  return j + 1;
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
    // Char offset of the token's first raw char in the input.
    // Captured here because some branches advance `i` before pushing.
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
      let end = readHexNumber(input, i, len);
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
      if (start < len) {
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
      } else {
        i = start;
      }
    }
    else if (isSymbolCode(curr)) {
      let ch = input[i];
      // negative
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
      let nextChar = input[end];
      let start = i;
      i = end;
      // Reduce unnecessary spaces
      if (!quote && lastToken) {
        if (ignoreSpacingAround(lastToken.value, nextChar)) {
          continue;
        }
        let spaces = (options.preserveLineBreak && hasLineBreak) ? '\n' : ' ';
        if (lastToken.isSpace()) {
          if (spaces === '\n') {
            lastToken.value = '\n';
          }
          continue;
        }
        if (nextChar && nextChar.trim()) {
          tokens.push(new Token({
            type: 'Space', value: spaces, pos, index
          }));
        }
      }
      else if (tokens.length && nextChar && nextChar.trim()) {
        tokens.push(new Token({
          type: 'Space', value: input.slice(start, end), pos, index
        }));
      }
    }
    else {
      let end = readWord(input, i, len);
      let word = input.slice(i, end).trim();
      if (word.length) {
        tokens.push(new Token({
          type: 'Word', value: word, pos, index
        }));
      }
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
  symbols,
  is,
  iterator,
  scan,
  Token
}
