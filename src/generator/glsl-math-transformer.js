import { scan } from '../parser/tokenizer.js';

const PREC = {
  '(': 20, ')': 20,
  '.': 19, '[': 19,
  '!': 16, '~': 16,
  '*': 14, '/': 14, '%': 14,
  '+': 13, '-': 13,
  '<<': 12, '>>': 12,
  '<': 11, '<=': 11, '>': 11, '>=': 11, '≤': 11, '≥': 11,
  '==': 10, '!=': 10, '=': 10, '≠': 10,
  '&': 9,
  '^': 8,
  '|': 7,
  '&&': 6,
  '||': 5
};

const OP_ALIAS = {
  '=': '==',
  '≤': '<=',
  '≥': '>=',
  '≠': '!='
};

const TWO_CHAR_OPS = new Set([
  '<<', '>>', '==', '!=', '<=', '>=', '&&', '||'
]);

function preprocessTokens(rawTokens) {
  const tokens = [];
  for (let i = 0; i < rawTokens.length; i++) {
    const t = rawTokens[i];
    if (t.type === 'Space') continue;

    const next = rawTokens[i + 1];

    if (next && t.isWord() && next.isNumber()) {
      t.value += next.value;
      i++;
      tokens.push(t);
      continue;
    }

    if (next) {
      const combined = t.value + next.value;
      if (TWO_CHAR_OPS.has(combined)) {
        t.value = combined;
        i++;
        tokens.push(t);
        continue;
      }
    }
    tokens.push(t);
  }
  return tokens;
}

export default function transform(code, { expect = null } = {}) {
  const tokens = preprocessTokens(scan(code));

  let pos = 0;
  const peek = () => tokens[pos];
  const consume = () => tokens[pos++];

  function parse(min = 0) {
    const t = consume();
    if (!t) return null;

    let n;
    if (t.isNumber()) {
      n = { type: 'Lit', val: t.value };
    } else if (t.isWord()) {
      const next = peek();
      n = (next && next.isSymbol('(')) ? call(t.value) : { type: 'Var', val: t.value };
    } else if (t.value === '(') {
      n = parse();
      consume();
    } else if (t.value === '!') {
      n = { type: 'Pre', val: '!', right: parse(16) };
    } else if (t.value === '~') {
      n = { type: 'Pre', val: '~', right: parse(16) };
    } else if (t.value === '-') {
      n = { type: 'Pre', val: '-', right: parse(16) };
    } else {
      n = { type: 'Lit', val: '0' };
    }
    while (pos < tokens.length) {
      const op = peek();
      if (!op.isSymbol() || op.value === ')' || op.value === ',') break;
      const p = PREC[op.value];
      if (!p || p < min) break;
      consume();
      n = { type: 'Bin', val: op.value, left: n, right: parse(p + 1) };
    }
    return n;
  }

  function call(val) {
    consume();
    let args = [];

    let next = peek();
    if (next && next.value !== ')') {
      do {
        args.push(parse());
        next = peek();
      } while (next && next.value === ',' && consume() && (next = peek()));
    }
    consume();
    return { type: 'Call', val, args };
  }

  function gen(n, exp) {
    if (!n) return '';
    if (n.type === 'Lit') {
      if (exp === 'bool') return `bool(${n.val.includes('.') ? n.val : n.val + '.0'})`;
      if (exp === 'int') return String(Math.floor(n.val));
      return n.val.includes('.') ? n.val : n.val + '.0';
    }
    if (n.type === 'Var') return exp === 'int' ? `int(${n.val})` : n.val;
    if (n.type === 'Pre') {
      if (n.val === '!') return `!${gen(n.right, 'bool')}`;
      if (n.val === '~') return `~${gen(n.right, 'int')}`;
      return `-${gen(n.right, exp)}`;
    }
    if (n.type === 'Call') {
      let args = n.args.map(a => gen(a, 'float')).join(', ');
      if (n.val === 'int') return exp === 'float' ? `float(int(${args}))` : `int(${args})`;
      if (n.val === 'float') return args;
      return `${n.val}(${args})`;
    }

    const op = n.val;
    let res = 'float', argExp = 'float';
    switch (op) {
      case '%':
        res = 'float';
        break;
      case '&':
      case '^':
      case '|':
      case '<<':
      case '>>':
        res = argExp = 'int';
        break;
      case '&&':
      case '||':
        res = argExp = 'bool';
        break;
      case '==':
      case '!=':
      case '=':
      case '≠':
        res = 'bool';
        argExp = 'float';
        break;
      case '<':
      case '>':
      case '<=':
      case '>=':
      case '≤':
      case '≥':
        res = 'bool';
        argExp = 'float';
        break;
    }

    const l = gen(n.left, argExp);
    const r = gen(n.right, argExp);
    const glslOp = OP_ALIAS[op] || op;
    const out = (op === '%') ? `mod(${l}, ${r})` : `(${l} ${glslOp} ${r})`;

    if (res === 'bool' && exp) return `${exp}(${out})`;
    if (res !== exp && exp) {
      if (exp === 'bool') return `bool(${out})`;
      if (exp === 'int') return `int(${out})`;
      if (exp === 'float') return `float(${out})`;
    }
    return out;
  }

  try { return gen(parse(), expect); }
  catch (e) { console.error(e); return code; }
}
