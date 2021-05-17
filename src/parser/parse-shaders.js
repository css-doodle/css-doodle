import { scan, iterator, Token } from './tokenizer';
import { is_empty } from '../utils/index';

function parse(input) {
  let iter = iterator(removeParens(scan(input)));
  let stack = [];
  let tokens = [];
  let identifier;
  let line;
  let result = {
    textures: [],
  };
  while (iter.next()) {
    let { curr, next } = iter.get();
    if (curr.isSymbol('{')) {
      if (!stack.length) {
        let name = joinToken(tokens);
        if (isIdentifier(name)) {
          identifier = name;
          tokens = [];
        } else {
          tokens.push(curr);
        }
      } else {
        tokens.push(curr);
      }
      stack.push('{');
    }
    else if (curr.isSymbol('}')) {
      stack.pop();
      if (!stack.length && identifier) {
        let value = joinToken(tokens);
        if (identifier && value.length) {
          if (identifier.startsWith('texture')) {
            result.textures.push({
              name: identifier,
              value
            });
          } else {
            result[identifier] = value;
          }
          tokens = [];
        }
        identifier = null;
      } else {
        tokens.push(curr);
      }
    }
    else {
      if (!is_empty(line) && line != curr.pos[1]) {
        tokens.push(lineBreak());
        line = null;
      }
      if (curr.isWord() && curr.value.startsWith('#')) {
        tokens.push(lineBreak());
        line = next.pos[1];
      }
      tokens.push(curr);
    }
  }

  if (is_empty(result.fragment)) {
    return {
      fragment: joinToken(tokens),
      textures: []
    }
  }
  return result;
}

function isIdentifier(name) {
  return /^texture\w*$|^(fragment|vertex)$/.test(name);
}

function lineBreak() {
  return new Token({ type: 'LineBreak', value: '\n' });
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

function joinToken(tokens) {
  return removeParens(tokens).map(n => n.value).join('');
}

export default parse;
