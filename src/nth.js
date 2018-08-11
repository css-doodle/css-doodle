import calculator from './calculator';

function build_expr(expr) {
  return n => String(expr)
    .replace(/(\d+)(n)/g, '$1*' + n)
    .replace(/n/g, n);
}

export default function nth(input, curr, max) {
  let expr = build_expr(input);
  for (let i = 0; i <= max; ++i) {
    if (calculator(expr(i)) == curr) return true;
  }
}
