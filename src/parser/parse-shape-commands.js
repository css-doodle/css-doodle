import { scan, iterator } from './tokenizer';

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
    } else if (curr.isSymbol(';') && name) {
      commands[name] = transformNegative(name, joinTokens(tokens), negative);
      tokens = [];
      name = null;
      negative = false;
    } else if (!curr.isSymbol(';')) {
      let prevMinus = prev && prev.isSymbol('-');
      let nextMinus = next && next.isSymbol('-');
      let currMinus = curr.isSymbol('-');
      if (!name && !tokens.length && currMinus && !prevMinus && !nextMinus) {
        if (next && next.isSymbol(':')) {
          tokens.push(curr);
        } else {
          negative = true;
        }
      } else {
        tokens.push(curr);
      }
    }
  }

  if (tokens.length && name) {
    commands[name] = transformNegative(name, joinTokens(tokens), negative);
  }

  return commands;
}

function transformNegative(name, value, negative) {
  if (name === 'fill-rule') {
    return value;
  }
  return negative ? `-1 * (${ value })` : value;
}

function joinTokens(tokens) {
  return tokens.map(n => n.value).join('');
}

export default parse;
