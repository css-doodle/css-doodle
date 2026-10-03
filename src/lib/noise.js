// Improved noise by Ken Perlin, the 2D slice of the reference cube
// Translated from: https://mrl.nyu.edu/~perlin/noise/

import { lerp } from './math.js';
import { shuffle } from './list.js';

// Perlin's permutation of 0…255 (151, 160, 137, 91, 90, 15, …), base64 encoded
const map = Uint8Array.from(atob(
    'l6CJW1oPgw3JX2A1wukH4YwkZx5FjghjJfAVChe+BpT3eOpLABrFPl7828t1IwsgObEhWO2VOFeuFH2Iq6hEr0qlR4aLMBumTZKe51Nv5Xo804Xm3GlcKTcu9Sj0Zo82QRk/'
    + 'oQHYUEnRTIS70FkSqcjEh4J0vJ9WpGRtxq26A0A02eL6fHsFyiaTdn7/UlXUz8474y8QOhG2vRwq37eq1Xf4mAIsmqNG3Zllm6crrAmBFif9E2Jsbk9x4OiyuXBo2vZh5Psi'
    + '8sHu0pAMv7Oi8VEzkev5Du9rMcDWH7XHap24VMywc3kyLX8Elv6K7M1d3nJDHRhI842Aw05C1z2ctA=='
), c => c.charCodeAt(0));

function fade(t) {
    return t * t * t * (t * (t * 6 - 15) + 10);
}

// Convert LO 4 bits of hash code into 12 gradient directions, at z = 0.
function grad(hash, x, y) {
    let h = hash & 15;
    let u = h < 8 ? x : y;
    let v = h < 4 ? y : (h == 12 || h == 14) ? x : 0;
    return ((h & 1) == 0 ? u : -u) + ((h & 2) == 0 ? v : -v);
}

export default class Perlin {
    constructor(random = Math.random) {
        let shuffled = shuffle(map, random);
        this.p = [].concat(shuffled, shuffled);
    }

    noise(x, y) {
        let { p } = this;
        let fx = Math.floor(x), fy = Math.floor(y);
        // Find unit square that contains point.
        let X = fx & 255, Y = fy & 255;
        // Find relative x, y of point in square.
        x -= fx; y -= fy;
        // Compute fade curves for each of x, y.
        let u = fade(x), v = fade(y);
        // Hash coordinates of the 4 square corners.
        let A = p[X] + Y, B = p[X + 1] + Y;
        // And add blended results from 4 corners of square.
        return lerp(v,
            lerp(u, grad(p[p[A]],     x,     y),
                    grad(p[p[B]],     x - 1, y)),
            lerp(u, grad(p[p[A + 1]], x,     y - 1),
                    grad(p[p[B + 1]], x - 1, y - 1)));
    }
}
