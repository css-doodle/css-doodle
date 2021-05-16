import { scan, iterator } from './tokenizer';

export default function parse(input) {
  let iter = iterator(scan(input));
  return walk(iter);
}

function walk(iter) {
  let rules = [];
  while (iter.next()) {
    let { prev, curr, next } = iter.get();
    if (curr.value === 'var') {
      if (next && next.isSymbol('(')) {
        iter.next();
        let rule = parseVar(iter);
        if (isValid(rule.name)) {
          rules.push(rule);
        }
      }
    } else if (rules.length && !curr.isSymbol(',')) {
      break;
    }
  }
  return rules;
}

function parseVar(iter) {
  let ret = {};
  let tokens = [];
  while (iter.next()) {
    let { prev, curr, next } = iter.get();
    if (curr.isSymbol(')', ';') && !ret.name) {
      ret.name = joinTokens(tokens);
      break;
    }
    else if (curr.isSymbol(',')) {
      if (ret.name === undefined) {
        ret.name = joinTokens(tokens);
        tokens = [];
      }
      if (ret.name) {
        ret.fallback = walk(iter);
      }
    } else {
      tokens.push(curr);
    }
  }
  return ret;
}

function joinTokens(tokens) {
  return tokens.map(n => n.value).join('');
}

function isValid(name) {
  if (name === undefined) return false;
  if (name.length <= 2) return false;
  if (name.substr(2).startsWith('-')) return false;
  if (!name.startsWith('--')) return false;
  return true;
}
