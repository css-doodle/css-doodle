import { is_empty } from '../utils/index.js';
import { scan, iterator } from './tokenizer.js';

function parse(input, option = {symbol: ',', noSpace: false}) {
  let group = [];
  let skip = false;
  let tokens = [];
  let parenStack = [];
  let quoteStack = [];

  if (is_empty(input)) {
    return group;
  }

  let iter = iterator(scan(input));

  function isSeperator(token) {
    let symbol = option.symbol || ',';
    if (option.noSpace) {
      return token.isSymbol(symbol);
    }
    return token.isSymbol(symbol) || token.isSpace();
  }

  while (iter.next()) {
    let { prev, curr, next }  = iter.get();
    if (curr.isSymbol('(')) {
      parenStack.push(curr.value);
    }
    if (curr.isSymbol(')')) {
      parenStack.pop();
    }
    if (curr.status === 'open') {
      quoteStack.push(curr.value);
    }
    if (curr.status === 'close') {
      quoteStack.pop();
    }
    let emptyStack = (!parenStack.length && !quoteStack.length);
    if (emptyStack) {
      let isNextSpace = option.noSpace && curr.isSpace() && isSeperator(next);
      let isPrevSpace = option.noSpace && curr.isSpace() && isSeperator(prev);
      if (isNextSpace || isPrevSpace) continue;
    }
    if (emptyStack && isSeperator(curr)) {
      group.push(joinTokens(tokens));
      tokens = [];
    } else {
      tokens.push(curr);
    }
  }

  if (tokens.length) {
    group.push(joinTokens(tokens));
  }

  return group;
}

function joinTokens(tokens) {
  return tokens.map(n => n.value).join('');
}

export default parse;
