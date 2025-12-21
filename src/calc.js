// Expression calculator using Shunting-yard algorithm

import { is_invalid_number, last } from './utils/index.js';
import { scan } from './parser/tokenizer.js';
import { cache } from './cache.js';

const defaultContext = {
  'π': Math.PI,
  gcd: (a, b) => {
    while (b) [a, b] = [b, a % b];
    return a;
  }
};

const operators = {
  '^': 7, '**': 7,
  '*': 6, '/': 6, '÷': 6, '%': 6,
  '&': 5, '|': 5,
  '+': 4, '-': 4,
  '<': 3, '<<': 3,
  '>': 3, '>>': 3,
  '=': 3, '==': 3,
  '≤': 3, '<=': 3,
  '≥': 3, '>=': 3,
  '≠': 3, '!=': 3,
  '∧': 2, '&&': 2,
  '∨': 2, '||': 2,
  '(': 1, ')': 1,
};

const compoundOps = new Set(['**', '==', '!=', '<=', '>=', '&&', '||', '<<', '>>']);
const RE_NUMBER = /^-?(\d+\.?\d*|\d*\.?\d+)(e[+-]?\d+)?$/i;
const RE_STARTS_WITH_MINUS = /^-/;
const RE_HAS_DIGIT = /\d/;
const RE_OPERATOR_CHARS = /^[<>&|]+$/;
const RE_PARENS = /[()]/;
const RE_NEGATIVE_VAR = /^-\D/;

function isOperator(value) {
  return Object.prototype.hasOwnProperty.call(operators, value);
}

// Transform raw tokens into calc-specific tokens
function transformTokens(rawTokens) {
  const tokens = [];
  let i = 0;

  while (i < rawTokens.length) {
    const token = rawTokens[i];
    const { type, value } = token;

    if (type === 'Space') {
      i++;
      continue;
    }

    if (type === 'Number') {
      // Handle implicit multiplication: "2t" → "2*t", "2π" → "2*π"
      const next = rawTokens[i + 1];
      const nextIsOp = next && (isOperator(next.value) || RE_OPERATOR_CHARS.test(next.value) || next.value === '!');
      const nextIsStructural = next && next.type === 'Symbol' && /[,]/.test(next.value);
      const isScientific = /e[+-]?\d+$/i.test(value);
      
      // "2(3+4)" → "2*(3+4)"
      if (next && next.value === '(') {
        tokens.push({ type: 'number', value });
        tokens.push({ type: 'operator', value: '*' });
        i++;
        continue;
      }
      
      // Scientific notation: insert * instead of combining
      if (isScientific && next && next.type === 'Word') {
        tokens.push({ type: 'number', value });
        tokens.push({ type: 'operator', value: '*' });
        i++;
        continue;
      }
      
      if (next && (next.type === 'Word' || next.type === 'Symbol') && !nextIsOp && !nextIsStructural) {
        tokens.push({ type: 'number', value: value + next.value });
        i += 2;
        continue;
      }
      tokens.push({ type: 'number', value });
      i++;
      continue;
    }

    if (type === 'Word') {
      // Handle operators not recognized by tokenizer (>, <, &, |)
      if (isOperator(value) || value === '!' || RE_OPERATOR_CHARS.test(value)) {
        const next = rawTokens[i + 1];
        if (next && (next.type === 'Word' || next.type === 'Symbol')) {
          const compound = value + next.value;
          if (compoundOps.has(compound)) {
            tokens.push({ type: 'operator', value: compound });
            i += 2;
            continue;
          }
        }
        tokens.push({ type: 'operator', value });
        i++;
        continue;
      }
      
      // "k-1" → subtraction, not multiplication
      const next = rawTokens[i + 1];
      if (next && next.type === 'Number' && RE_STARTS_WITH_MINUS.test(next.value)) {
        tokens.push({ type: 'number', value });
        tokens.push({ type: 'operator', value: '-' });
        tokens.push({ type: 'number', value: next.value.slice(1) });
        i += 2;
        continue;
      }
      
      // "x1", "y2" → variable names, not implicit multiplication
      if (next && next.type === 'Number' && !RE_STARTS_WITH_MINUS.test(next.value)) {
        tokens.push({ type: 'number', value: value + next.value });
        i += 2;
        continue;
      }
      
      // Function call: don't add multiplication before "("
      if (next && next.value === '(') {
        tokens.push({ type: 'number', value });
        i++;
        continue;
      }
      
      const nextIsStructural = next && next.type === 'Symbol' && /[(),]/.test(next.value);
      const nextIsOp = next && (isOperator(next.value) || RE_OPERATOR_CHARS.test(next.value) || next.value === '!');
      if (next && next.type === 'Symbol' && !nextIsStructural && !nextIsOp) {
        // "xπ" → "x*π"
        tokens.push({ type: 'number', value });
        tokens.push({ type: 'operator', value: '*' });
        i++;
        continue;
      }
      tokens.push({ type: 'number', value });
      i++;
      continue;
    }

    if (type === 'Symbol') {
      if (value === ',') {
        tokens.push({ type: 'comma', value });
        i++;
        continue;
      }

      if (value === '!') {
        const next = rawTokens[i + 1];
        if (next && next.value === '=') {
          tokens.push({ type: 'operator', value: '!=' });
          i += 2;
          continue;
        }
        tokens.push({ type: 'operator', value });
        i++;
        continue;
      }

      // "(2+3)4" → "(2+3)*4", "(1+2)(3+4)" → "(1+2)*(3+4)"
      if (value === ')') {
        tokens.push({ type: 'operator', value });
        const next = rawTokens[i + 1];
        const nextIsOp = next && (isOperator(next.value) || RE_OPERATOR_CHARS.test(next.value) || next.value === '!');
        const shouldMultiply = next && (
          next.type === 'Number' ||
          next.type === 'Word' ||
          (next.type === 'Symbol' && next.value === '(') ||
          (next.type === 'Symbol' && !nextIsOp && next.value !== ',' && next.value !== ')')
        );
        if (shouldMultiply) {
          tokens.push({ type: 'operator', value: '*' });
        }
        i++;
        continue;
      }
      const next = rawTokens[i + 1];
      if (next && next.type === 'Symbol') {
        const compound = value + next.value;
        if (compoundOps.has(compound)) {
          tokens.push({ type: 'operator', value: compound });
          i += 2;
          continue;
        }
      }
      if (value === '+' || value === '-') {
        const lastToken = last(tokens);
        const isSign = !tokens.length ||
          (lastToken && lastToken.type === 'operator' && !RE_PARENS.test(lastToken.value));

        if (isSign) {
          let combinedSign = value === '-' ? -1 : 1;
          let j = i + 1;
          while (j < rawTokens.length) {
            while (j < rawTokens.length && rawTokens[j].type === 'Space') j++;
            const nextToken = rawTokens[j];
            if (nextToken && (nextToken.value === '+' || nextToken.value === '-')) {
              if (nextToken.value === '-') combinedSign *= -1;
              j++;
            } else {
              break;
            }
          }
          while (j < rawTokens.length && rawTokens[j].type === 'Space') j++;
          const nextToken = rawTokens[j];

          if (nextToken && (nextToken.type === 'Number' || nextToken.type === 'Word')) {
            const signedValue = (combinedSign === -1 ? '-' : '') + nextToken.value;
            tokens.push({ type: 'number', value: signedValue });
            i = j + 1;
            continue;
          } else if (!tokens.length) {
            // Handle unary minus: "-(" → "-1*("
            tokens.push({ type: 'number', value: combinedSign === -1 ? '-1' : '1' });
            tokens.push({ type: 'operator', value: '*' });
            i = j;
            continue;
          }
        }
      }
      if (isOperator(value)) {
        tokens.push({ type: 'operator', value });
        i++;
        continue;
      }

      // "πx" → "π*x", "ππ" → "π*π"
      const nextIsStructural = next && next.type === 'Symbol' && /[(),]/.test(next.value);
      const nextIsOp = next && (isOperator(next.value) || RE_OPERATOR_CHARS.test(next.value) || next.value === '!');
      if (next && (next.type === 'Number' || next.type === 'Word' || next.type === 'Symbol') && !nextIsStructural && !nextIsOp) {
        tokens.push({ type: 'number', value });
        tokens.push({ type: 'operator', value: '*' });
        i++;
        continue;
      }
      tokens.push({ type: 'number', value });
      i++;
      continue;
    }

    i++;
  }

  return tokens;
}

// Get tokens with caching
function getTokens(input) {
  if (cache.has(input)) {
    return cache.get(input);
  }
  const rawTokens = scan(String(input));
  const tokens = transformTokens(rawTokens);
  return cache.set(input, tokens);
}

// Convert infix to postfix (RPN)
function infixToPostfix(input) {
  const tokens = getTokens(input);
  const opStack = [];
  const expr = [];

  for (let i = 0; i < tokens.length; i++) {
    const { type, value } = tokens[i];
    const next = tokens[i + 1] || {};

    if (type === 'number') {
      const isNumber = RE_NUMBER.test(value) || value === '-' || value === '+';
      if (next.value === '(' && !isNumber) {
        const { args, endIndex } = parseFunctionArgs(tokens, i + 1);
        expr.push({
          type: 'function',
          name: value,
          value: args
        });
        i = endIndex;
      } else if (!isNumber) {
        expr.push({ type: 'variable', value });
      } else {
        expr.push({ type: 'number', value });
      }
    } else if (type === 'operator') {
      if (value === '(') {
        opStack.push(value);
      } else if (value === ')') {
        while (opStack.length && last(opStack) !== '(') {
          expr.push({ type: 'operator', value: opStack.pop() });
        }
        opStack.pop();
      } else {
        const isRightAssoc = value === '^' || value === '**';
        while (opStack.length) {
          const top = last(opStack);
          const topPrec = operators[top];
          const currPrec = operators[value];
          if (isRightAssoc ? topPrec > currPrec : topPrec >= currPrec) {
            const op = opStack.pop();
            if (!RE_PARENS.test(op)) {
              expr.push({ type: 'operator', value: op });
            }
          } else {
            break;
          }
        }
        opStack.push(value);
      }
    }
  }

  while (opStack.length) {
    expr.push({ type: 'operator', value: opStack.pop() });
  }

  return expr;
}

function parseFunctionArgs(tokens, startIndex) {
  const args = [];
  let depth = 0;
  const currentArgParts = [];
  let i = startIndex;
  if (tokens[i] && tokens[i].value === '(') {
    depth = 1;
    i++;
  }

  while (i < tokens.length) {
    const token = tokens[i];
    const { value } = token;

    if (value === '(') {
      depth++;
      currentArgParts.push(value);
    } else if (value === ')') {
      depth--;
      if (depth === 0) {
        if (currentArgParts.length) {
          args.push(infixToPostfix(currentArgParts.join('')));
        }
        break;
      }
      currentArgParts.push(value);
    } else if (value === ',' && depth === 1) {
      if (currentArgParts.length) {
        args.push(infixToPostfix(currentArgParts.join('')));
      }
      currentArgParts.length = 0;
    } else {
      currentArgParts.push(value);
    }
    i++;
  }

  return { args, endIndex: i };
}

function calc(expr, context = {}, history = []) {
  const stack = [];
  let idx = 0;

  while (idx < expr.length) {
    let { name, value, type } = expr[idx++];

    if (type === 'variable') {
      let result = context[value];

      if (is_invalid_number(result)) {
        result = Math[value];
      }
      if (is_invalid_number(result)) {
        result = expand(value, context, history);
      }
      if (is_invalid_number(result)) {
        if (RE_NEGATIVE_VAR.test(value)) {
          result = expand('-1' + value.slice(1), context, history);
        }
      }
      if (result === undefined) {
        result = 0;
      }
      if (typeof result !== 'number') {
        history.push(result);
        if (isCycle(history)) {
          result = 0;
          history.length = 0;
        } else {
          result = calc(infixToPostfix(result), context, history);
        }
      }
      stack.push(result);
    } else if (type === 'function') {
      let negative = false;
      if (RE_STARTS_WITH_MINUS.test(name)) {
        negative = true;
        name = name.slice(1);
      }

      let output = value.map(v => calc(v, context, history));
      const fns = name.split('.');
      let fname;

      while (fname = fns.pop()) {
        if (!fname) continue;
        const fn = context[fname] || Math[fname];
        output = (typeof fn === 'function')
          ? (Array.isArray(output) ? fn(...output) : fn(output))
          : 0;
      }

      if (negative) {
        output = -1 * output;
      }
      stack.push(output);
    } else {
      if (RE_HAS_DIGIT.test(value)) {
        stack.push(value);
      } else {
        const right = stack.pop();
        const left = stack.pop();

        if (idx >= expr.length && left === undefined) {
          stack.push(right);
        } else {
          stack.push(compute(value, Number(left), Number(right)));
        }
      }
    }
  }

  return Number(stack[0]) || 0;
}

function compute(op, a, b) {
  switch (op) {
    case '+': return a + b;
    case '-': return a - b;
    case '*': return a * b;
    case '%': return a % b;
    case '|': return a | b;
    case '&': return a & b;
    case '<': return a < b;
    case '>': return a > b;
    case '^': case '**': return a ** b;
    case '÷': case '/': return a / b;
    case '=': case '==': return a === b ? 1 : 0;
    case '≤': case '<=': return a <= b;
    case '≥': case '>=': return a >= b;
    case '≠': case '!=': return a !== b ? 1 : 0;
    case '∧': case '&&': return a && b;
    case '∨': case '||': return a || b;
    case '<<': return a << b;
    case '>>': return a >> b;
    default: return 0;
  }
}

function expand(value, context, history) {
  const match = value.match(/([\d.\-]+)(.*)/);
  if (!match) return undefined;

  const [, num, variable] = match;
  const v = context[variable];

  if (v === undefined) {
    return v;
  }

  if (typeof v === 'number') {
    return Number(num) * v;
  } else {
    history.push(v);
    if (isCycle(history)) {
      history.length = 0;
      return 0;
    }
    return num * calc(infixToPostfix(v), context, history);
  }
}

function isCycle(history) {
  if (history.length > 50) return true;
  if (history.length < 4) return false;
  const tail = history[history.length - 1];
  for (let i = 2; i <= 4; i++) {
    if (history[history.length - i] !== tail) return false;
  }
  return true;
}

export default function(input, context) {
  const expr = infixToPostfix(input);
  const mergedContext = context
    ? Object.assign({}, defaultContext, context)
    : defaultContext;
  return calc(expr, mergedContext);
}
