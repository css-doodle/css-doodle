/**
 * Based on the Shunting-yard algorithm.
 */

import { last } from './list';

export default function(input) {
  const expr = infix_to_postfix(input), stack = [];
  while (expr.length) {
    let top = expr.shift();
    if (/\d+/.test(top)) stack.push(top);
    else {
      let right = stack.pop();
      let left = stack.pop();
      stack.push(compute(
        top, Number(left), Number(right)
      ));
    }
  }
  return stack[0];
}

const operator = {
  '*': 3, '/': 3, '%': 3,
  '+': 2, '-': 2,
  '(': 1, ')': 1
}

function get_tokens(input) {
  let expr = String(input);
  let tokens = [], num = '';

  for (let i = 0; i < expr.length; ++i) {
    let c = expr[i];

    if (operator[c]) {
      if (c == '-' && expr[i - 1] == 'e') {
        num += c;
      }
      else if (!tokens.length && !num.length && /[+-]/.test(c)) {
        num += c;
      } else {
        let { type, value } = last(tokens) || {};
        if (type == 'operator'
            && !num.length
            && /[^()]/.test(c)
            && /[^()]/.test(value)) {
          num += c;
        } else {
          if (num.length) {
            tokens.push({ type: 'number', value: num });
            num = '';
          }
          tokens.push({ type: 'operator', value: c });
        }
      }
    }

    else if (/\S/.test(c)) {
      num += c;
    }
  }

  if (num.length) {
    tokens.push({ type: 'number', value: num });
  }

  return tokens;
}

function infix_to_postfix(input) {
  let tokens = get_tokens(input);
  const op_stack = [], expr = [];

  for (let i = 0; i < tokens.length; ++i) {
    let { type, value } = tokens[i];
    if (type == 'number') {
      expr.push(value);
    }

    else if (type == 'operator') {
      if (value == '(') {
        op_stack.push(value);
      }

      else if (value == ')') {
        while (op_stack.length && last(op_stack) != '(') {
          expr.push(op_stack.pop());
        }
        op_stack.pop();
      }

      else {
        while (op_stack.length && operator[last(op_stack)] >= operator[value]) {
          let op = op_stack.pop();
          if (!/[()]/.test(op)) expr.push(op);
        }
        op_stack.push(value);
      }
    }
  }

  while (op_stack.length) {
    expr.push(op_stack.pop());
  }

  return expr;
}

function compute(op, a, b) {
  switch (op) {
    case '+': return a + b;
    case '-': return a - b;
    case '*': return a * b;
    case '/': return a / b;
    case '%': return a % b;
  }
}
