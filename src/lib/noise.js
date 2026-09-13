// Improved noise by Ken Perlin
// Translated from: https://mrl.nyu.edu/~perlin/noise/

import { lerp } from './math.js';

// Perlin's permutation of 0…255 (151, 160, 137, 91, 90, 15, …), base64 encoded
const map = Uint8Array.from(atob(
    'l6CJW1oPgw3JX2A1wukH4YwkZx5FjghjJfAVChe+BpT3eOpLABrFPl7828t1IwsgObEhWO2VOFeuFH2Iq6hEr0qlR4aLMBumTZKe51Nv5Xo804Xm3GlcKTcu9Sj0Zo82QRk/'
    + 'oQHYUEnRTIS70FkSqcjEh4J0vJ9WpGRtxq26A0A02eL6fHsFyiaTdn7/UlXUz8474y8QOhG2vRwq37eq1Xf4mAIsmqNG3Zllm6crrAmBFif9E2Jsbk9x4OiyuXBo2vZh5Psi'
    + '8sHu0pAMv7Oi8VEzkev5Du9rMcDWH7XHap24VMywc3kyLX8Elv6K7M1d3nJDHRhI842Aw05C1z2ctA=='
), c => c.charCodeAt(0));

function fade(t) {
    return t * t * t * (t * (t * 6 - 15) + 10);
}

function shuffle(arr, random) {
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

// Convert LO 4 bits of hash code into 12 gradient directions.
function grad(hash, x, y, z) {
    let h = hash & 15;
    let u = h < 8 ? x : y;
    let v = h < 4 ? y : (h == 12 || h == 14) ? x : z;
    return ((h & 1) == 0 ? u : -u) + ((h & 2) == 0 ? v : -v);
}

export default class Perlin {
    constructor(random = Math.random) {
        let shuffled = shuffle(map, random);
        this.p = [].concat(shuffled, shuffled);
    }

    noise(x, y, z = 0) {
        let { p } = this;
        let fx = Math.floor(x), fy = Math.floor(y), fz = Math.floor(z);
        // Find unit cube that contains point.
        let X = fx & 255, Y = fy & 255, Z = fz & 255;
        // Find relative x, y, z of point in cube.
        x -= fx; y -= fy; z -= fz;
        // Compute fade curves for each of x, y, z.
        let u = fade(x), v = fade(y), w = fade(z);
        // Hash coordinates of the 8 cube corners.
        let A = p[X] + Y, AA = p[A] + Z, AB = p[A + 1] + Z;
        let B = p[X + 1] + Y, BA = p[B] + Z, BB = p[B + 1] + Z;
        // And add blended results from 8 corners of cube.
        return lerp(w,
            lerp(v,
                lerp(u, grad(p[AA],     x,     y,     z),
                        grad(p[BA],     x - 1, y,     z)),
                lerp(u, grad(p[AB],     x,     y - 1, z),
                        grad(p[BB],     x - 1, y - 1, z))),
            lerp(v,
                lerp(u, grad(p[AA + 1], x,     y,     z - 1),
                        grad(p[BA + 1], x - 1, y,     z - 1)),
                lerp(u, grad(p[AB + 1], x,     y - 1, z - 1),
                        grad(p[BB + 1], x - 1, y - 1, z - 1))));
    }
}
