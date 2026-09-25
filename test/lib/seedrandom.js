import test from 'node:test';
import assert from 'node:assert/strict';

import seedrandom from '../../src/lib/seedrandom.js';

// seeds are a contract: the same seed must keep drawing the same artwork
test('a seed keeps its stream', () => {
    const golden = {
        '': [0.23144008215179881, 0.27404636548159655, 0.7901279251811976, 0.5946400321469282],
        '1': [0.2694488477791326, 0.43440878183925163, 0.8740779300873869, 0.6823685949292666],
        'css-doodle': [0.4466314005959183, 0.9378403406545842, 0.2031431317161889, 0.08805624588493041],
        'ünï 🎨': [0.5937626606492415, 0.009618134929662582, 0.9216761888801587, 0.46403871950405745],
    };
    for (const [seed, values] of Object.entries(golden)) {
        const random = seedrandom(seed);
        const first = [random(), random(), random()];
        let x;
        for (let i = 0; i < 997; i++) x = random();
        assert.deepEqual([...first, x], values, seed);
    }
});
