import { is_empty } from '../utils/index.js';
import { scan, iterator } from './tokenizer';

function parse(input, noSpace) {
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
    if (noSpace) {
      return token.isSymbol(',');
    }
    return token.isSymbol(',') || token.isSpace();
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
    if (isSeperator(curr) && !parenStack.length && !quoteStack.length) {
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
