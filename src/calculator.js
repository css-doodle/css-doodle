/**
 * Base on the Shunting-yard algorithm.
 */

function infix_to_postfix(input) {
  const op_stack = [], expr = [];
  let tc = '';

  const operator = {
    '*': 3, '/': 3, '%': 3,
    '+': 2, '-': 2,
    '(': 1, ')': 1
  };

  const peek = s => s[s.length - 1];

  for (let c of String(input)) {
    if (/[\d.]/.test(c)) {
      tc += c; continue;
    }

    if (tc.length) {
      expr.push(tc); tc = '';
    }

    if (operator[c]) {
      if (c == '(') {
        op_stack.push(c);
      }

      else if (c == ')') {
        while (op_stack.length && peek(op_stack) != '(') {
          expr.push(op_stack.pop());
        }
        op_stack.pop();
      }

      else {
        while (op_stack.length && operator[peek(op_stack)] >= operator[c]) {
          let op = op_stack.pop();
          if (!/[()]/.test(op)) expr.push(op);
        }
        op_stack.push(c);
      }
    }
  }

  if (tc.length) {
    expr.push(tc);
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

export default function calculate(input) {
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
