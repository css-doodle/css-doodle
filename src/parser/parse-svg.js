import { scan, iterator } from './tokenizer';

function readStatement(iter, token) {
  let fragment = [];
  while (iter.next()) {
    let { curr, next } = iter.get();
    let isStatementBreak = !next || curr.isSymbol(';') || next.isSymbol('}');
    fragment.push(curr);
    if (isStatementBreak) {
      break;
    }
  }
  if (fragment.length) {
    token.value = joinToken(fragment);
  }
  return token;
}

function walk(iter, parentToken) {
  let rules = [];
  let fragment = [];
  let tokenType = parentToken && parentToken.type || '';

  while (iter.next()) {
    let { prev, curr, next } = iter.get();
    let isBlockBreak = !next || curr.isSymbol('}');

    if (tokenType === 'block' && isBlockBreak) {
      if (!next && rules.length && !curr.isSymbol('}')) {
        rules[rules.length - 1].value += (';' + curr.value);
      }
      parentToken.value = rules;
    }
    else if (curr.isSymbol('{')) {
      let selectors = getGroups(fragment, token => token.isSpace());
      if (!selectors.length) {
        continue;
      }
      let tokenName;
      let block = resolveId(walk(iter, {
        type: 'block',
        name:  selectors.pop(),
        value: []
      }));
      while (tokenName = selectors.pop()) {
        block = resolveId({
          type: 'block',
          name: tokenName,
          value: [block]
        });
      }
      rules.push(block);
      fragment = [];
    }
    else if (
      curr.isSymbol(':')
      && !isSpecialProperty(prev, next)
      && fragment.length
    ) {
      let props = getGroups(fragment, token => token.isSymbol(','));
      let value = readStatement(iter, {
        type: 'statement',
        name: 'unkown',
        value: ''
      });
      props.forEach(prop => {
        rules.push(Object.assign({}, value, { name: prop }));
      });
      if (tokenType == 'block') {
        parentToken.value = rules;
      }
      fragment = [];
    }
    else if (curr.isSymbol(';')) {
      if (rules.length && fragment.length) {
        rules[rules.length - 1].value += (';' + joinToken(fragment));
        fragment = [];
      }
    } else {
      fragment.push(curr);
    }
  }

  if (rules.length && tokenType == 'block') {
    parentToken.value = rules;
  }
  if (fragment.length && tokenType == 'statement') {
    parentToken.value = joinToken(fragment);
  }
  return tokenType ? parentToken : rules;
}

function isSpecialProperty(prev, next) {
  const names = [
    'xlink:actuate', 'xlink:arcrole', 'xlink:href', 'xlink:role',
    'xlink:show',    'xlink:title',   'xlink:type',
    'xml:base',      'xml:lang',      'xml:space',
  ];
  let prevValue = prev && prev.value;
  let nextValue = next && next.value;
  return names.includes(prevValue + ':' + nextValue);
}

function joinToken(tokens) {
  return tokens
    .filter((token, i) => {
      if (token.isSymbol(';', '}') && i === tokens.length - 1) return false;
      return true;
    })
    .map(n => n.value).join('');
}

function resolveId(block) {
  let name = block.name || '';
  let [tokenName, ...ids] = name.split(/#/);
  let id = ids[ids.length - 1];
  if (id) {
    block.name = tokenName;
    block.value.push({
      type: 'statement',
      name: 'id',
      value: id,
    });
  }
  return block;
}

function getGroups(tokens, fn) {
  let group = [];
  let temp = [];
  tokens.forEach(token => {
    if (fn(token)) {
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
    name: 'svg',
    value: []
  });
  return tokens;
}

export default parse;
