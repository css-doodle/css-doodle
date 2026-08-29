import seedrandom from '../lib/seedrandom.js';
import { lerp } from '../utils/math.js';

/**
 * A seeded random source plus the helpers built on top of it.
 * `rand`/`pick`/`shuffle` always read the current generator, so
 * `update_random` affects them mid-run; `random` exposes the
 * generator active at read time.
 */
export default function create_random(seed) {
  let random = (typeof seed === 'function') ? seed : seedrandom(String(seed));

  function update_random(seed) {
    random = seedrandom(String(seed));
  }

  function rand(start = 0, end = 1) {
    if (arguments.length == 1) {
      [start, end] = [0, start];
    }
    return lerp(random(), start, end);
  }

  function pick(...items) {
    let args = items.reduce((acc, n) => acc.concat(n), []);
    return args[~~(random() * args.length)];
  }

  function shuffle(arr) {
    let ret = [...arr];
    let m = arr.length;
    while (m) {
      let i = ~~(random() * m--);
      let t = ret[m];
      ret[m] = ret[i];
      ret[i] = t;
    }
    return ret;
  }

  return {
    rand, pick, shuffle, update_random,
    get random() { return random; },
  };
}
