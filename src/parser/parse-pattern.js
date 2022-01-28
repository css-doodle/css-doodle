import { scan, iterator } from './tokenizer.js';

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
  let stack = [];

  while (iter.next()) {
    let { prev, curr, next } = iter.get();
    let isBlockBreak = !next || curr.isSymbol('}');
    if (tokenType === 'block' && isBlockBreak) {
      if (!next && rules.length && !curr.isSymbol('}')) {
        rules[rules.length - 1].value += (';' + curr.value);
      }
      parentToken.value = rules;
      break;
    }
    else if (curr.isSymbol('{') && fragment.length && !stack.length) {
      let selectors = parseSelector(fragment);
      if (!selectors.length) {
        continue;
      }
      let block = walk(iter, {
        type: 'block',
        name: 'unkown',
        value: []
      });

      selectors.forEach(selector => {
        let newBlock = Object.assign({}, block, {
          name: selector.name,
          args: selector.args
        });
        rules.push(newBlock);
      });
      fragment = [];
    }
    else if (curr.isSymbol(':') && fragment.length && !stack.length) {
      let prop = joinToken(fragment);
      rules.push(readStatement(iter, {
        type: 'statement',
        name: prop,
        value: ''
      }));
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
      if (curr.isSymbol('(')) {
        stack.push(curr);
      }
      if (curr.isSymbol(')')) {
        stack.pop();
      }
      fragment.push(curr);
    }
  }

  if (rules.length && tokenType == 'block') {
    parentToken.value = rules;
  }
  return tokenType ? parentToken : rules;
}

function joinToken(tokens) {
  return tokens
    .filter((token, i) => {
      if (token.isSymbol(';') && i === tokens.length - 1) return false;
      return true;
    })
    .map(n => n.value).join('');
}

function parseSelector(tokens) {
  let iter = iterator(tokens);
  let groups = [];
  let selectorName = '';
  let args = [];
  let fragments = [];
  let stack = [];
  while (iter.next()) {
    let { curr, next } = iter.get();
    if (!selectorName.length && curr.isWord()) {
      selectorName = curr.value;
    }
    else if (curr.isSymbol('(')) {
      if (stack.length) {
        fragments.push(curr.value);
      }
      stack.push(curr);
    }
    else if (curr.isSymbol(')')) {
      stack.pop();
      if (stack.length) {
        fragments.push(curr.value);
      } else if (fragments.length) {
        args.push(fragments.join(''));
        fragments = [];
      }
    }
    else if (curr.isSymbol(',')) {
      if (stack.length) {
        args.push(fragments.join(''));
        fragments = [];
      } else {
        if (fragments.length) {
          args.push(fragments.join(''));
          fragments = [];
        }
        if (selectorName) {
          groups.push({
            name: selectorName,
            args
          });
          selectorName = '';
          args = [];
          fragments = [];
        }
      }
    }
    else {
      fragments.push(curr.value);
    }
  }

  if (selectorName) {
    groups.push({
      name: selectorName,
      args
    });
  }

  return groups.filter((v, i, self) => {
    let idx = self.findIndex(n => {
      return (n.name === v.name && v.args.join('') == n.args.join(''));
    });
    return idx === i;
  });
}

function parse(source) {
  let iter = iterator(scan(source));
  let tokens = walk(iter);
  return tokens;
}

export default parse;
