/**
 * Based on the Shunting-yard algorithm.
 */

import List from './list';
let { last } = List();

const default_context = {
  'π': Math.PI,
  '∏': Math.PI
}

export default function(input, context) {
  const expr = infix_to_postfix(input);
  return calc(expr, Object.assign(default_context, context));
}

const operator = {
  '*': 3, '/': 3, '%': 3,
  '+': 2, '-': 2,
  '(': 1, ')': 1
}

function calc(expr, context, repeat = []) {
  let stack = [];
  while (expr.length) {
    let { name, value, type } = expr.shift();
    if (type === 'variable') {
      let result = context[value];
      if (typeof result === 'undefined') {
        result = Math[value];
      }
      if (typeof result === 'undefined') {
        result = expand(value, context);
      }
      if (typeof result === 'undefined') {
        result = 0;
      }
      if (typeof result !== 'number') {
        repeat.push(result);
        if (is_cycle(repeat)) {
          result = 0;
          repeat = [];
        } else {
          result = calc(infix_to_postfix(result), context, repeat)
        }
      }
      stack.push(result);
    }
    else if (type === 'function') {
      let args = value.map(v => calc(v, context));
      let fn = context[name] || Math[name];
      if (typeof fn === 'function') {
        stack.push(fn(...args));
      } else {
        stack.push(0);
      }
    } else {
      if (/\d+/.test(value)) stack.push(value);
      else {
        let right = stack.pop();
        let left = stack.pop();
        stack.push(compute(
          value, Number(left), Number(right)
        ));
      }
    }
  }
  return stack[0];
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
      if (c == ',') {
        tokens.push({ type: 'number', value: num });
        num = '';
        tokens.push({ type: 'comma', value: c });
      } else {
        num += c;
      }
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
    let next = tokens[i + 1] || {};
    if (type == 'number') {
      if (next.value == '(' && /[^\d.]/.test(value)) {
        let func_body = '';
        let stack = [];
        let values = [];

        i += 1;
        while (tokens[i++] !== undefined) {
          let token = tokens[i];
          if (token === undefined) break;
          let c = token.value;
          if (c == ')') {
            if (!stack.length) break;
            stack.pop();
            func_body += c;
          }
          else {
            if (c == '(') stack.push(c);
            if (c == ',') {
              let arg = infix_to_postfix(func_body);
              if (arg.length) values.push(arg);
              func_body = '';
            } else {
              func_body += c
            }
          }
        }

        if (func_body.length) {
          values.push(infix_to_postfix(func_body));
        }

        expr.push({
          type: 'function',
          name: value,
          value: values
        });
      }
      else if (/[^\d.]/.test(value)) {
        expr.push({ type: 'variable', value });
      }
      else {
        expr.push({ type: 'number', value });
      }
    }

    else if (type == 'operator') {
      if (value == '(') {
        op_stack.push(value);
      }

      else if (value == ')') {
        while (op_stack.length && last(op_stack) != '(') {
          expr.push({ type: 'operator', value: op_stack.pop() });
        }
        op_stack.pop();
      }

      else {
        while (op_stack.length && operator[last(op_stack)] >= operator[value]) {
          let op = op_stack.pop();
          if (!/[()]/.test(op)) expr.push({ type: 'operator', value: op });
        }
        op_stack.push(value);
      }
    }
  }

  while (op_stack.length) {
    expr.push({ type: 'operator', value: op_stack.pop() });
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

function expand(value, context) {
  let [_, num, variable] = value.match(/([\d.]+)(.*)/) || [];
  let v = context[variable];
  if (v === undefined) {
    return v;
  }
  if (typeof v === 'number') {
    return Number(num) * v;
  } else {
    return num * calc(infix_to_postfix(v), context);
  }
}

function is_cycle(array) {
  return (array[0] == array[2] && array[1] == array[3]);
}
