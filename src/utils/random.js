export default function Random(random) {

  function lerp(t, a, b) {
    return a + t * (b - a);
  }

  function rand(start = 0, end) {
    if (arguments.length == 1) {
      [start, end] = [0, start];
    }
    return lerp(random(), start, end);
  }

  function pick(...items) {
    let args = items.reduce((acc, n) => acc.concat(n), []);
    return args[~~(random() * args.length)];
  }

  function unique_id(prefix = '') {
    return prefix + Math.random().toString(32).substr(2);
  }

  return {
    lerp,
    rand,
    pick,
    unique_id
  };

}
