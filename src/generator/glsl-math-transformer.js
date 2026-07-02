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

const TWO_CHAR_OPS = new Set(['<<', '>>', '==', '!=', '<=', '>=', '&&', '||' ]);
const RELATIONAL_OPS = new Set(['<', '>', '<=', '>=', '≤', '≥']);
const WORD_OPS = new Map([['and', '&&'], ['or', '||']]);
const WORD_NOT = 'not';

function preprocessTokens(rawTokens) {
  const tokens = [];
  for (let i = 0; i < rawTokens.length; i++) {
    const t = rawTokens[i];
    if (t.type === 'Space') continue;

    const next = rawTokens[i + 1];

    if (next && t.isWord() && next.isNumber()) {
      const w = t.value.toLowerCase();
      if (!WORD_OPS.has(w) && w !== WORD_NOT) {
        t.value += next.value;
        i++;
        tokens.push(t);
        continue;
      }
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
      if (t.value.toLowerCase() === WORD_NOT) {
        n = { type: 'Pre', val: '!', right: parse(PREC['&&'] + 1) };
      } else {
        const next = peek();
        n = (next && next.isSymbol('(')) ? call(t.value) : { type: 'Var', val: t.value };
      }
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
      let val = null;
      if (op.isSymbol() && op.value !== ')' && op.value !== ',') {
        val = op.value;
      } else if (op.isWord()) {
        val = WORD_OPS.get(op.value.toLowerCase()) || null;
      }
      if (!val) break;
      const p = PREC[val];
      if (!p || p < min) break;
      consume();
      const right = parse(p + 1);
      if (!right) break;
      n = { type: 'Bin', val, left: n, right };
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
    if (n.type === 'Var') {
      if (exp === 'bool') return `bool(${n.val})`;
      if (exp === 'int') return `int(${n.val})`;
      return n.val;
    }
    if (n.type === 'Pre') {
      if (!n.right) return gen({ type: 'Lit', val: '0' }, exp);
      if (n.val === '!') {
        const out = `!${gen(n.right, 'bool')}`;
        return (exp === 'int' || exp === 'float') ? `${exp}(${out})` : out;
      }
      if (n.val === '~') {
        const out = `~${gen(n.right, 'int')}`;
        return exp === 'bool' ? `bool(${out})` : out;
      }
      if (exp === 'bool') return `bool(-${gen(n.right, 'float')})`;
      return `-${gen(n.right, exp)}`;
    }
    if (n.type === 'Call') {
      let args = n.args.map(a => gen(a, 'float')).join(', ');
      if (n.val === 'int') {
        if (exp === 'float') return `float(int(${args}))`;
        if (exp === 'bool') return `bool(int(${args}))`;
        return `int(${args})`;
      }
      if (n.val === 'float') {
        if (exp === 'bool') return `bool(${args})`;
        if (exp === 'int') return `int(${args})`;
        return args;
      }
      const out = `${n.val}(${args})`;
      if (exp === 'bool') return `bool(${out})`;
      if (exp === 'int') return `int(${out})`;
      return out;
    }

    const op = n.val;

    if (RELATIONAL_OPS.has(op)
        && n.left.type === 'Bin'
        && RELATIONAL_OPS.has(n.left.val)) {
      const leftChain = gen(n.left, 'bool');
      const mid = gen(n.left.right, 'float');
      const right = gen(n.right, 'float');
      const glslOp = OP_ALIAS[op] || op;
      const out = `(${leftChain} && (${mid} ${glslOp} ${right}))`;
      if (exp && exp !== 'bool') return `${exp}(${out})`;
      return out;
    }

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
