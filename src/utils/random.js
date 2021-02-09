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
  
  function nrand(min = -1, max = -1, skew = 1) {
    let u = 0, v = 0;
    while(u === 0) u = Math.random(); //Converting [0,1) to (0,1)
    while(v === 0) v = Math.random();
    let num = Math.sqrt( -2.0 * Math.log( u ) ) * Math.cos( 2.0 * Math.PI * v );

    num = num / 10.0 + 0.5; // Translate to 0 -> 1
    if (num > 1 || num < 0) num = randn_bm(min, max, skew); // resample between 0 and 1 if out of range
    num = Math.pow(num, skew); // Skew
    num *= max - min; // Stretch to fill range
    num += min; // offset to min
    return num;
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
