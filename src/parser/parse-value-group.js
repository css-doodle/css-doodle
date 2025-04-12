import { is_empty } from '../utils/index.js';
import { scan, iterator } from './tokenizer.js';

function parse(input, option = {symbol: ',', noSpace: false, verbose: false }) {
  let group = [];
  let skip = false;
  let tokens = [];
  let parenStack = [];
  let quoteStack = [];
  let lastGroupName = '';
  let symbolList = option.symbol || ',';
  let symbolCounter = {};
  let symbolCounterMax = {};
  let symbolsToCompare = [];

  if (is_empty(input)) {
    return group;
  }
  if (!Array.isArray(symbolList)) {
    symbolList = [symbolList];
  }
  symbolList.forEach(item => {
    let [symbol, max = Infinity] = String(item).split(/\s+/);
    symbolCounter[symbol] = 0;
    symbolCounterMax[symbol] = max;
  });

  const allSymbols = Object.keys(symbolCounterMax);
  const iter = iterator(scan(input));
  updateSymbols();

  function updateSymbols() {
    symbolsToCompare = allSymbols.filter(s => {
      return symbolCounter[s] < symbolCounterMax[s];
    });
  }

  function isSeperator(token) {
    return option.noSpace
       ? token.isSymbol(symbolsToCompare)
       : (token.isSymbol(symbolsToCompare) || token.isSpace());
  }

  function addGroup(tokens) {
    let value = joinTokens(tokens);
    if (option.verbose) {
      if (lastGroupName.length || value.length) {
        group.push({ group: lastGroupName, value });
      }
    } else {
      group.push(value);
    }
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
      if (curr.isSpace() && !tokens.length) {
        continue;
      }
      if (isNextSpace || isPrevSpace) {
        continue;
      }
    }
    if (emptyStack && isSeperator(curr)) {
      symbolCounter[curr.value] += 1;
      let groupName = lastGroupName;
      addGroup(tokens);
      lastGroupName = curr.value;
      tokens = [];
      updateSymbols();
    } else {
      tokens.push(curr);
    }
  }
  if (tokens.length) {
    addGroup(tokens);
  }

  return group;
}

function joinTokens(tokens) {
  return tokens.map(n => n.value).join('');
}

export default parse;
