// Minimal seedrandom implementation Based on ARC4 (RC4) stream cipher.
// Based on the work of David Bau: https://github.com/davidbau/seedrandom

const WIDTH = 256;
const MASK = WIDTH - 1;
const START_DENOM = WIDTH ** 6;
const SIGNIFICANCE = 2 ** 52;
const OVERFLOW = SIGNIFICANCE * 2;

// seed is a string
export default function seedrandom(seed) {
    let key = [];
    let smear = 0;
    for (let i = 0; i < seed.length; i++) {
        key[MASK & i] = MASK & ((smear ^= key[MASK & i] * 19) + seed.charCodeAt(i));
    }
    if (!key.length) key = [0];

    // Key scheduling algorithm
    let s = [], i = 0, j = 0, t;
    while (i < WIDTH) s[i] = i++;
    for (i = 0; i < WIDTH; i++) {
        t = s[i];
        j = MASK & (j + key[i % key.length] + t);
        s[i] = s[j];
        s[j] = t;
    }
    i = j = 0;

    const g = count => {
        let r = 0;
        while (count--) {
            t = s[i = MASK & (i + 1)];
            r = r * WIDTH + s[MASK & ((s[i] = s[j = MASK & (j + t)]) + (s[j] = t))];
        }
        return r;
    };
    // RC4-drop[256] for unpredictability
    g(WIDTH);

    return () => {
        let n = g(6);
        let d = START_DENOM;
        let x = 0;
        while (n < SIGNIFICANCE) {
            n = (n + x) * WIDTH;
            d *= WIDTH;
            x = g(1);
        }
        while (n >= OVERFLOW) {
            n /= 2;
            d /= 2;
            x >>>= 1;
        }
        return (n + x) / d;
    };
}
