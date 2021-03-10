export default function(random) {

  function lerp(start, end, t) {
    return start * (1 - t) + end * t;
  }

  function rand(start = 0, end = start) {
    if (arguments.length == 1) {
      if (start == 1) start = 0;
      else if (start < 1) start /= 10;
      else start = 1;
    }
    return lerp(start, end, random());
  }

  function nrand(mean = 0, scale = 1) {
    let u1 = 0, u2 = 0;
    //Convert [0,1) to (0,1)
    while (u1 === 0) u1 = random();
    while (u2 === 0) u2 = random();
    const R = Math.sqrt(-2.0 * Math.log(u1));
    const t = 2.0 * Math.PI * u2;
    const u0 = R * Math.cos(t);
    return mean + scale * u0;
  }

  function pick( ...items) {
    let args = items.reduce((acc, n) => acc.concat(n), []);
    return args[~~(random() * args.length)];
  }

  function unique_id(prefix = '') {
    return prefix + random().toString(32).substr(2);
  }

  return {
    lerp,
    rand,
    nrand,
    pick,
    unique_id
  };

}
