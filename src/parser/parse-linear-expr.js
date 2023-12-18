import { scan, iterator } from './tokenizer.js';

/* an +/- b */
export default function parse(input) {
  let iter = iterator(scan(input));
  let a = [], b = [], op, error;
  while (iter.next()) {
    let { prev, curr, next } = iter.get();
    let v = curr.value;
    if (curr.isSymbol()) {
      if (v === '+' || v === '-') {
        op = v;
      } else {
        error = 'Unexpected ' + curr.value;
        break;
      }
    }
    else if (curr.isNumber()) {
      if ((a.length || b.length) && !op) {
        error = 'Syntax error';
        break;
      }
      v = withOp(Number(v), op);
      op = null;
      if (next && next.value === 'n') {
        a.push(v);
        iter.next();
        continue;
      } else {
        b.push(v);
      }
    }
    else if (v === 'n') {
      if ((a.length || b.length) && !op) {
        error = 'Syntax error';
        break;
      }
      a.push(withOp(1, op));
      op = null;
    }
    else if (!curr.isSpace()) {
      error = 'Unexpected ' + v;
      break;
    }
  }
  if (error) {
    return { a: 0, b: 0, error }
  }
  return { a: sum(a), b: sum(b) };
}

function withOp(num, op) {
  if (op === '+') return num;
  if (op === '-') return -1 * num;
  return num;
}

function sum(list) {
  return list.reduce((a, b) => a + b, 0);
}
