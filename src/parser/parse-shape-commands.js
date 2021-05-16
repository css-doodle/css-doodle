import { scan, iterator } from './tokenizer';

function parse(input) {
  let iter = iterator(scan(input));
  let commands = {};
  let tokens = [];
  let name;
  while (iter.next()) {
    let { curr, next } = iter.get();
    if (curr.isSymbol(':') && !name) {
      name = joinTokens(tokens);
      tokens = [];
    } else if (curr.isSymbol(';') && name) {
      commands[name] = joinTokens(tokens);
      tokens = [];
      name = null;
    } else if (!curr.isSymbol(';')) {
      tokens.push(curr);
    }
  }

  if (tokens.length && name) {
    commands[name] = joinTokens(tokens);
  }

  return commands;
}

function joinTokens(tokens) {
  return tokens.map(n => n.value).join('');
}

export default parse;
