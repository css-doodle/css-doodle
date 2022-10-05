import { scan, iterator } from './tokenizer.js';
import parseValueGroup from './parse-value-group.js';

function readStatement(iter, token) {
  let fragment = [];
  let inlineBlock;
  let stackQuote = [];
  let stackParen = [];
  while (iter.next()) {
    let { curr, next } = iter.get();
    if (curr.isSymbol('(') && !stackQuote.length) {
      stackParen.push(curr);
    } else if (curr.isSymbol(')') && !stackQuote.length) {
      stackParen.pop();
    }
    let isStatementBreak = !stackQuote.length && !stackParen.length && (!next || curr.isSymbol(';') || next.isSymbol('}'));
    if (curr.isSymbol("'", '"')) {
      if (curr.status === 'open') {
        stackQuote.push(curr);
      } else {
        stackQuote.pop();
      }
      if (next.isSymbol('}') && !stackQuote.length) {
        isStatementBreak = true;
      }
    }
    if (!stackParen.length && !stackQuote.length && curr.isSymbol('{')) {
      let selectors = getSelectors(fragment);
      if (!selectors.length) {
        continue;
      }
      let tokenName = selectors.pop();
      let skip = isSkip(...selectors, tokenName);
      inlineBlock = resolveId(walk(iter, splitTimes(tokenName, {
        type: 'block',
        inline: true,
        name: tokenName,
        value: [],
      })), skip);

      while (tokenName = selectors.pop()) {
        inlineBlock = resolveId(splitTimes(tokenName, {
          type: 'block',
          name: tokenName,
          value: [inlineBlock]
        }), skip);
      }
      break;
    }
    fragment.push(curr);
    if (isStatementBreak) {
      break;
    }
  }
  if (fragment.length && !inlineBlock) {
    token.value = joinToken(fragment);
  } else if (inlineBlock) {
    token.value = inlineBlock;
  }
  if (token.origin) {
    token.origin.value = token.value;
  }
  return token
}

function walk(iter, parentToken) {
  let rules = [];
  let fragment = [];
  let tokenType = parentToken && parentToken.type || '';
  let stack = [];

  while (iter.next()) {
    let { prev, curr, next } = iter.get();
    if (curr.isSymbol('(')) {
      stack.push(curr.value);
    }
    if (curr.isSymbol(')')) {
      stack.pop();
    }
    let isBlockBreak = !next || curr.isSymbol('}');
    if (isBlock(tokenType) && isBlockBreak) {
      if (!next && rules.length && !curr.isSymbol('}')) {
        let last = rules[rules.length - 1].value;
        if (typeof last === 'string') {
          rules[rules.length - 1].value += (';' + curr.value);
        }
      }
      parentToken.value = rules;
      break;
    }
    else if (curr.isSymbol('{')) {
      let selectors = getSelectors(fragment);
      if (!selectors.length) {
        continue;
      }
      if (isSkip(parentToken.name)) {
        selectors = [joinToken(fragment)];
      }
      let tokenName = selectors.pop();
      let skip = isSkip(...selectors, parentToken.name, tokenName);
      let block = resolveId(walk(iter, splitTimes(tokenName, {
        type: 'block',
        name: tokenName,
        value: []
      })), skip);
      while (tokenName = selectors.pop()) {
        block = resolveId(splitTimes(tokenName, {
          type: 'block',
          name: tokenName,
          value: [block]
        }), skip);
      }
      rules.push(block);
      fragment = [];
    }
    else if (
      curr.isSymbol(':')
      && !stack.length
      && !isSpecialProperty(prev, next)
      && fragment.length
    ) {
      let props = getGroups(fragment, token => token.isSymbol(','));
      let intial = {
        type: 'statement',
        name: 'unkown',
        value: ''
      }
      if (props.length > 1) {
        intial.origin = {
          name: props
        };
      }
      let statement = readStatement(iter, intial);

      let groupdValue = parseValueGroup(statement.value);
      let expand = (props.length > 1 && groupdValue.length === props.length);

      props.forEach((prop, i) => {
        let item = Object.assign({}, statement, { name: prop });
        if (expand) {
          item.value = groupdValue[i];
        }
        rules.push(item);
      });
      if (isBlock(tokenType)) {
        parentToken.value = rules;
      }
      fragment = [];
    }
    else if (curr.isSymbol(';')) {
      if (rules.length && fragment.length) {
        rules[rules.length - 1].value += (';' + joinToken(fragment));
        fragment = [];
      }
    }
    else {
      fragment.push(curr);
    }
  }

  if (rules.length && isBlock(tokenType)) {
    parentToken.value = rules;
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

function resolveId(block, skip) {
  let name = block.name || '';
  let [tokenName, ...ids] = name.split(/#/);
  let id = ids[ids.length - 1];
  if (tokenName && id && !skip) {
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

function getSelectors(tokens) {
  let result = [];
  let it = iterator(tokens);
  let temp = [];
  let hasSymbol;
  while (it.next()) {
    let { prev, curr, next } = it.get();
    let isTimeSymbol = (
      prev && next &&
      curr.value === 'x' &&
      prev.isNumber()  &&
      next.isNumber()
    );
    if (curr.isWord() && !hasSymbol && !isTimeSymbol) {
      result.push(curr.value.trim());
    } else {
      result[result.length - 1] =
        (result[result.length - 1] + curr.value).trim();
    }
    if (curr.isSymbol()) {
      hasSymbol = true;
    } else if (!curr.isSpace()) {
      hasSymbol = false;
    }
  }
  return result;
}

function splitTimes(name, object) {
  let target = Object.assign({}, object);
  if (/\*\s*[0-9]/.test(name)) {
    let [tokenName, times] = name.split('*');
    if (times) {
      target.times = times.trim();
      target.pureName = tokenName.trim();
    }
  }
  return target;
}

function isSkip(...names) {
  return names.some(n => n === 'style');
}

function isBlock(type) {
  return type === 'block';
}

function skipHeadSVG(block) {
  let head = block && block.value && block.value[0];
  if (head && head.name === 'svg' && isBlock(head.type)) {
    return skipHeadSVG(head);
  } else {
    return block;
  }
}

function parse(source, root) {
  let iter = iterator(scan(source));
  let tokens = walk(iter, root || {
    type: 'block',
    name: 'svg',
    value: []
  });
  return skipHeadSVG(tokens);
}

export default parse;
