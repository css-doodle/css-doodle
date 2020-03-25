export default {
  white_space(c) {
    return /[\s\n\t]/.test(c);
  },
  line_break(c) {
    return /\n/.test(c);
  },
  number(n) {
    return !isNaN(n);
  },
  pair(n) {
    return ['"', '(', ')', "'"].includes(n);
  },
  pair_of(c, n) {
    return ({ '"': '"', "'": "'", '(': ')' })[c] == n;
  },
  nil(s) {
    return s === undefined || s === null;
  }
}
