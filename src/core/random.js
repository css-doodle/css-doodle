import seedrandom from '../lib/seedrandom.js';
import { lerp } from '../lib/math.js';

export default function createRandom(seed) {
    let random = (typeof seed === 'function') ? seed : seedrandom(String(seed));

    function updateRandom(seed) {
        random = seedrandom(String(seed));
    }

    // rand() → [0, 1), rand(n) → [0, n), rand(a, b) → [a, b)
    function rand(start, end) {
        if (end === undefined) {
            [start, end] = [0, start ?? 1];
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
        rand, pick, shuffle, updateRandom,
        get random() { return random; },
    };
}
