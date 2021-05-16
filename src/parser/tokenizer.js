/**
 * This is totally rewrite for the old parser module
 * I'll improve and replace them little by little.
 */

const symbols = {
  ':': 'colon',
  ';': 'semicolon',
  ',': 'comma',
  '(': 'left-paren',
  ')': 'right-paren',
  '[': 'left-square-bracket',
  ']': 'right-square-bracket',
  '{': 'left-curly-brace',
  '}': 'right-curly-brace',
  'π': 'pi',
  '±': 'plus-or-minus',
  '+': 'plus',
  '-': 'minus',
  '*': 'product',
  '/': 'division',
  '%': 'mod',
  '"': 'double-quote',
  "'": 'single-quote',
  '`': 'backquote',
  '@': 'at',
}

const is = {
  escape: c => c == '\\',
  space:  c => /[\r\n\t\s]/.test(c),
  digit:  c => /^[0-9]$/.test(c),
  sign:   c => /^[+-]$/.test(c),
  dot:    c => c == '.',
  quote:  c => /^["'`]$/.test(c),
  symbol: c => symbols[c],
  hexNum: c => /^[0-9a-f]$/i.test(c),
  hex:           (a, b, c) => a == '0' && is.letter(b, 'x') && is.hexNum(c),
  expWithSign:   (a, b, c) => is.letter(a, 'e') && is.sign(b) && is.digit(c),
  exp:           (a, b) => is.letter(a, 'e') && is.digit(b),
  dots:          (a, b) => is.dot(a) && is.dot(b),
  letter:        (a, b) => String(a).toLowerCase() == String(b).toLowerCase(),
  comment:       (a, b) => a == '/' && b == '*',
  selfClosedTag: (a, b) => a == '/' && b == '>',
  closedTag:     (a, b) => a == '<' && b == '/',
}

class Token {
  constructor({ type, value, pos, status }) {
    this.type = type;
    this.value = value;
    this.pos = pos;
    if (status) {
      this.status = status;
    }
  }
  isSymbol(...values) {
    let isSymbol = this.type == 'Symbol';
    if (!values.length) return isSymbol;
    return values.some(c => c === this.value);
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
      if (next == '\n') row++, col = 0;
      else col += n;
      return next;
    },
    end() {
      return pointer >= max;
    },
    get() {
      return {
        prev:  input[pointer - 1],
        curr:  input[pointer + 0],
        next:  input[pointer + 1],
        next2: input[pointer + 2],
        next3: input[pointer + 3],
        pos:   [col, row],
      }
    }
  }
}

function skipComments(iter) {
  while (iter.next()) {
    let { curr, prev } = iter.get();
    if (is.comment(curr, prev)) break;
  }
}

function ignoreSpacingSymbol(value) {
   return [':', ';', ',', '{', '}', '(', ')', '[', ']'].includes(value);
}

function readWord(iter) {
  let temp = '';
  while (!iter.end()) {
    let { curr, next } = iter.get();
    temp += curr;
    let isBreak = is.symbol(next) || is.space(next) || is.digit(next);
    if (temp.length && isBreak) {
      if (!is.closedTag(curr, next)) break;
    }
    iter.next();
  }
  return temp.trim();
}

function readSpaces(iter) {
  let temp = '';
  while (!iter.end()) {
    let { curr, next } = iter.get();
    temp += curr;
    if (!is.space(next)) break;
    iter.next();
  }
  return temp;
}

function readNumber(iter) {
  let temp = '';
  let hasDot = false;
  while (!iter.end()) {
    let { curr, next, next2, next3 } = iter.get();
    temp += curr;
    if (hasDot && is.dot(next)) break;
    if (is.dot(curr)) hasDot = true;
    if (is.dots(next, next2)) break;
    if (is.expWithSign(next, next2, next3)) {
      temp += iter.next() + iter.next();
    }
    else if (is.exp(next, next2)) {
      temp += iter.next();
    }
    else if (!is.digit(next) && !is.dot(next)) {
      break;
    }
    iter.next();
  }
  return temp;
}

function readHexNumber(iter) {
  let temp = '0x';
  iter.next(2);
  while (!iter.end()) {
    let { curr, next } = iter.get();
    temp += curr;
    if (!is.hexNum(next)) break;
    iter.next();
  }
  return temp;
}

function last(array) {
  return array[array.length - 1];
}

function scan(source) {
  let iter = iterator(String(source).trim());
  let tokens = [];
  let quoteStack = [];

  while (iter.next()) {
    let { prev, curr, next, next2, pos } = iter.get();
    if (is.comment(curr, next)) {
      skipComments(iter);
    }
    else if (is.hex(curr, next, next2)) {
      let num = readHexNumber(iter);
      tokens.push(new Token({
        type: 'Number', value: num, pos
      }));
    }
    else if (is.digit(curr) || (
        is.digit(next) && is.dot(curr) && !is.dots(prev, curr))) {
      let num = readNumber(iter);
      tokens.push(new Token({
        type: 'Number', value: num, pos
      }));
    }
    else if (is.symbol(curr) && !is.selfClosedTag(curr, next)) {
      let token = {
        type: 'Symbol', value: curr, pos
      }
      let lastToken = last(tokens);

      // Escaped symbols
      if (quoteStack.length && is.escape(lastToken.value)) {
        tokens.pop();
        let word = readWord(iter);
        if (word.length) {
          tokens.push(new Token({
            type: 'Word', value: word, pos
          }));
        }
      }
      else {
        if (is.quote(curr)) {
          let lastQuote = last(quoteStack);
          if (lastQuote == curr) {
            quoteStack.pop();
            token.status = 'close';
          } else {
            quoteStack.push(curr);
            token.status = 'open';
          }
        }

        tokens.push(new Token(token));
      }
    }
    else if (is.space(curr)) {
      let spaces = readSpaces(iter);
      let lastToken = last(tokens);
      let { next } = iter.get();

      // Reduce unnecessary spaces
      if (!quoteStack.length && lastToken) {
        if (ignoreSpacingSymbol(lastToken.value) || ignoreSpacingSymbol(next)) {
          continue;
        } else {
          spaces = ' ';
        }
      }
      if (tokens.length && (next && next.trim())) {
        tokens.push(new Token({
          type: 'Space', value: spaces, pos
        }));
      }
    }
    else {
      let word = readWord(iter);
      if (word.length) {
        tokens.push(new Token({
          type: 'Word', value: word, pos
        }));
      }
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
}
