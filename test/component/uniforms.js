import test from 'node:test';
import assert from 'node:assert/strict';

import { syncUTime } from '../../src/component/uniforms.js';

test('@T runs from midnight, whenever its animation started', () => {
    let animation = name => {
        let a = { animationName: name, currentTime: 5, effect: { updateTiming: timing => a.timing = timing } };
        return a;
    };
    let U = animation('cssd-U-ani'), u = animation('cssd-u-ani');
    let host = { compiled: { uniforms: { time: true } }, getAnimations: () => [u, U] };
    let before = Date.now() - new Date().setHours(0, 0, 0, 0);
    syncUTime(host);
    assert.deepEqual(U.timing, { delay: 0 });
    assert.ok(U.currentTime >= before && U.currentTime - before < 1000, String(U.currentTime));
    // @t keeps its own clock
    assert.equal(u.currentTime, 5);
    // nothing to do without the time uniform, or without the API
    U.currentTime = 5;
    syncUTime({ compiled: { uniforms: {} }, getAnimations: () => [U] });
    syncUTime({ compiled: { uniforms: { time: true } } });
    assert.equal(U.currentTime, 5);
});
