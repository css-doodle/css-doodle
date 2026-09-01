import seedrandom from '../lib/seedrandom.js';
import { lerp } from '../utils/math.js';

export default function createRandom(seed) {
    let random = (typeof seed === 'function') ? seed : seedrandom(String(seed));

    function updateRandom(seed) {
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
        rand, pick, shuffle, updateRandom,
        get random() { return random; },
    };
}
