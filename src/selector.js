const is = {
  even: (n) => !!(n % 2),
  odd:  (n) => !(n % 2)
};

export default {

  nth({ count }) {
    return n => n == count;
  },

  at({ x, y }) {
    return (x1, y1) => (x == x1 && y == y1);
  },

  row({ x, y }) {
    return n => /^(even|odd)$/.test(n) ? is[n](x - 1) : (n == x)
  },

  col({ x, y }) {
    return n => /^(even|odd)$/.test(n) ? is[n](y - 1) : (n == y);
  },

  even({ count }) {
    return _ => is.even(count - 1);
  },

  odd({ count }) {
    return _ => is.odd(count - 1);
  },

  random() {
    return (ratio = .5) => {
      if (ratio >= 1 && ratio <= 0) ratio = .5;
      return Math.random() < ratio;
    }
  }

}
