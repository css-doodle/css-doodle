import { scan, iterator } from './tokenizer';

function walk(iter, parentToken) {
  let rules = [];
  let fragment = [];
  let tokenType = parentToken && parentToken.type || '';

  while (iter.next()) {
    let { prev, curr, next } = iter.get();

    if (tokenType == 'block' && (!next || curr.isSymbol('}'))) {
      parentToken.body = rules;
      break;
    }
    else if (tokenType == 'statement' && curr.isSymbol(';') || (next && next.isSymbol('}'))) {
      if (next.isSymbol('}')) {
        fragment.push(curr);
      }
      parentToken.value = joinToken(fragment);
      break;
    }
    else if (curr.isSymbol('{')) {
      let token = {
        type: 'block',
        name: joinToken(fragment),
        body: []
      };
      rules.push(walk(iter, token));
      fragment = [];
    }
    else if (tokenType !== 'statement' && curr.isSymbol(':') && fragment.length) {
      let props = getGroups(fragment);
      let value = walk(iter, {
        type: 'statement',
        property: 'token',
        value: []
      });
      props.forEach(prop => {
        rules.push(Object.assign({}, value, {
          property: prop
        }));
      });
      if (tokenType == 'block') {
        parentToken.body = rules;
      }
      fragment = [];
    }
    else {
      fragment.push(curr);
    }
  }
  if (rules.length && tokenType == 'block') {
    parentToken.body = rules;
  }
  if (fragment.length && tokenType == 'statement') {
    parentToken.value = joinToken(fragment);
  }
  return tokenType ? parentToken : rules;
}

function joinToken(tokens) {
  return tokens
    .filter(token => !token.isSymbol(';'))
    .map(n => n.value).join('');
}

function getGroups(tokens) {
  let group = [];
  let temp = [];
  tokens.forEach(token => {
    if (token.isSymbol(',')) {
      group.push(joinToken(temp));
      temp = [];
    } else {
      temp.push(token);
    }
  });
  if (temp.length) {
    group.push(joinToken(temp));
  }
  return group;
}

function parse(source, root) {
  let iter = iterator(scan(source));
  let tokens = walk(iter, root || {
    type: 'block',
    name: 'svg'
  });
  return tokens;
}

export default parse;
