import test from 'node:test';
import assert from 'node:assert/strict';

import parseCss from '../../src/parser/parse-css.js';
import parseGrid from '../../src/parser/parse-grid.js';
import generateCss from '../../src/generator/css.js';

// the component only defines its class when HTMLElement exists
globalThis.HTMLElement ??= class {};
const { CSSDoodle } = await import('../../src/component/index.js');

test('reflow reads the host when no grid is rendered', () => {
    let touched = [];
    let noGrid = {
        shadowRoot: { querySelector: () => null },
        get offsetWidth() { touched.push('host'); return 0; },
    };
    assert.doesNotThrow(() => CSSDoodle.prototype.reflow.call(noGrid));
    assert.deepEqual(touched, ['host']);

    let grid = { get offsetWidth() { touched.push('grid'); return 0; } };
    CSSDoodle.prototype.reflow.call({ shadowRoot: { querySelector: () => grid } });
    assert.deepEqual(touched, ['host', 'grid']);
});

test('host-only rules ask for a reflow without rendering a grid', () => {
    // buildGrid and patch reflow on hasTransition/hasAnimation, but only
    // render <grid> when there are cell styles, container styles or
    // content; these doodles have neither
    for (let code of [
        ':doodle { animation: foo 1s; }',
        ':doodle { background: red; transition: background .4s; }',
    ]) {
        let { props, styles, content } = generateCss(parseCss(code), parseGrid('1'), 42, 64);
        assert.ok(props.hasAnimation || props.hasTransition, code);
        assert.equal(styles.cells, '', code);
        assert.equal(styles.container, '', code);
        assert.equal(Object.keys(content).length, 0, code);
    }
});

test('setStyle drops a promised style from a superseded render', async () => {
    let el = { textContent: 'old' };
    let host = {
        _generation: 1,
        shadowRoot: { querySelector: () => el },
        setStyle: CSSDoodle.prototype.setStyle,
    };
    let resolve;
    let pending = new Promise(r => { resolve = r; });
    host.setStyle(pending);
    host._generation++;
    resolve('stale');
    await pending;
    await new Promise(r => setTimeout(r));
    assert.equal(el.textContent, 'old');

    host.setStyle(Promise.resolve('fresh'));
    await new Promise(r => setTimeout(r));
    assert.equal(el.textContent, 'fresh');
});

test('the host clock freezes while paused', async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    let attrs = new Set();
    let restamped = 0;
    let host = {
        _clock: { base: 0, since: 0 },
        animations: [],
        shadowRoot: { querySelectorAll: () => [] },
        hasAttribute: name => attrs.has(name),
        setAttribute: name => attrs.add(name),
        removeAttribute: name => attrs.delete(name),
        restamp: () => restamped++,
        syncSvgAnimations: () => {},
        clockNow: CSSDoodle.prototype.clockNow,
        pause: CSSDoodle.prototype.pause,
        resume: CSSDoodle.prototype.resume,
    };
    assert.equal(host.clockNow(), 0, 'not started until a sheet lands');
    host._clock.since = performance.now();
    await sleep(30);
    assert.ok(host.clockNow() >= 20);

    host.pause();
    let frozen = host.clockNow();
    await sleep(30);
    assert.equal(host.clockNow(), frozen);
    host.pause();
    assert.equal(restamped, 1, 'a second pause is a no-op');

    host.resume();
    await sleep(30);
    assert.ok(host.clockNow() >= frozen + 20);
    host.resume();
    assert.equal(restamped, 2, 'a second resume is a no-op');
});
