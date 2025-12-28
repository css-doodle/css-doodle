/**
 * Minimal seedrandom implementation Based on ARC4 (RC4) stream cipher.
 * Based on the work of David Bau: https://github.com/davidbau/seedrandom
 */

const WIDTH = 256;
const MASK = WIDTH - 1;
const CHUNKS = 6;
const DIGITS = 52;
const START_DENOM = WIDTH ** CHUNKS;
const SIGNIFICANCE = 2 ** DIGITS;
const OVERFLOW = SIGNIFICANCE * 2;

function ARC4(key) {
  let i = 0, j = 0, t;
  const s = this.S = [];

  if (!key.length) key = [0];

  // Key scheduling algorithm
  while (i < WIDTH) s[i] = i++;
  for (i = 0; i < WIDTH; i++) {
    t = s[i];
    j = MASK & (j + key[i % key.length] + t);
    s[i] = s[j];
    s[j] = t;
  }

  this.i = this.j = 0;
  // RC4-drop[256] for unpredictability
  this.g(WIDTH);
}

ARC4.prototype.g = function(count) {
  let { i, j, S: s } = this;
  let r = 0, t;
  while (count--) {
    t = s[i = MASK & (i + 1)];
    r = r * WIDTH + s[MASK & ((s[i] = s[j = MASK & (j + t)]) + (s[j] = t))];
  }
  this.i = i;
  this.j = j;
  return r;
};

function mixkey(seed) {
  const key = [];
  let smear = 0;
  for (let i = 0; i < seed.length; i++) {
    key[MASK & i] = MASK & ((smear ^= key[MASK & i] * 19) + seed.charCodeAt(i));
  }
  return key;
}

function autoseed() {
  try {
    const arr = new Uint8Array(WIDTH);
    crypto.getRandomValues(arr);
    return String.fromCharCode(...arr);
  } catch {
    return Date.now() + '' + Math.random();
  }
}

function flatten(obj, depth = 3) {
  if (depth && typeof obj === 'object') {
    return Object.values(obj).map(v => flatten(v, depth - 1)).join('');
  }
  return typeof obj === 'string' ? obj : obj + '\0';
}

export default function seedrandom(seed) {
  const key = mixkey(seed == null ? autoseed() : flatten(seed));
  const arc4 = new ARC4(key);

  const prng = () => {
    let n = arc4.g(CHUNKS);
    let d = START_DENOM;
    let x = 0;
    while (n < SIGNIFICANCE) {
      n = (n + x) * WIDTH;
      d *= WIDTH;
      x = arc4.g(1);
    }
    while (n >= OVERFLOW) {
      n /= 2;
      d /= 2;
      x >>>= 1;
    }
    return (n + x) / d;
  };

  prng.int32 = () => arc4.g(4) | 0;
  prng.quick = () => arc4.g(4) / 0x100000000;

  return prng;
}
