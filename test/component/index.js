import test from 'node:test';
import assert from 'node:assert/strict';

import parseCss from '../../src/parser/parse-css.js';
import parseGrid from '../../src/parser/parse-grid.js';
import generateCss from '../../src/generator/css.js';
import createRandom from '../../src/core/random.js';
import { doodleToImage } from '../../src/component/embedded.js';

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
    assert.ok(host._styleReady instanceof Promise);
    host._generation++;
    resolve('stale');
    await pending;
    await new Promise(r => setTimeout(r));
    assert.equal(el.textContent, 'old');

    host.setStyle(Promise.resolve('fresh'));
    await host._styleReady;
    assert.equal(el.textContent, 'fresh');
});

test('export waits for styles and disables transitions without restamping animations', async t => {
    let serializer = globalThis.XMLSerializer;
    globalThis.XMLSerializer = class {
        serializeToString(node) { return `<style>${node.textContent}</style>`; }
    };
    t.after(() => {
        if (serializer === undefined) delete globalThis.XMLSerializer;
        else globalThis.XMLSerializer = serializer;
    });
    let el = { textContent: 'old' };
    let host = {
        _generation: 1,
        shadowRoot: {
            querySelector: () => el,
            querySelectorAll: () => [],
            childNodes: [el],
        },
        setStyle: CSSDoodle.prototype.setStyle,
        getBoundingClientRect: () => ({ width: 100, height: 100 }),
    };
    let resolve;
    host.setStyle(new Promise(r => { resolve = r; }));
    let exported = CSSDoodle.prototype.export.call(host);
    await Promise.resolve();
    assert.equal(el.textContent, 'old');
    let sheet = 'cell{transition:all 1s;animation:spin 4s -2500ms}';
    resolve(sheet);
    let { svg } = await exported;
    assert.ok(svg.includes(`<style>${sheet}</style>`));
    assert.equal(svg.split('transition:none!important').length - 1, 1);
    assert.ok(!svg.includes('animation-play-state:paused'));
});

test('nested doodle images keep animating and hold when the host pauses', async () => {
    const host = (ms, paused = false) => ({
        extra: {},
        compiled: { seed: 42 },
        getMaxGrid: () => 64,
        report: () => {},
        hasAttribute: () => paused,
        _clock: { base: ms, since: 0 },
        clockNow: () => ms,
    });
    const decode = source => {
        assert.ok(source.startsWith('data:image/svg+xml;base64,'));
        return atob(source.split(',')[1]);
    };
    let code = 'transition:all 1s;animation:spin 4s;';
    // a running host: animations run, transitions do not
    let svg = decode(await doodleToImage(host(0), code, {}));
    assert.equal(svg.split('transition:none!important').length - 1, 1);
    assert.match(svg, /animation:\s*spin 4s;/);
    assert.ok(!svg.includes('animation-play-state:paused'));
    // resumed at 2.5s: in phase with the host, still running
    svg = decode(await doodleToImage(host(2500), code, {}));
    assert.match(svg, /animation:\s*spin 4s -2500ms;/);
    assert.ok(!svg.includes('animation-play-state:paused'));
    // paused at 2.5s: that frame, held
    svg = decode(await doodleToImage(host(2500, true), code, {}));
    assert.match(svg, /animation:\s*spin 4s -2500ms;/);
    assert.equal(svg.split('animation-play-state:paused!important').length - 1, 1);
    // inline svg content: SMIL runs, and holds its frame when paused
    let smil = '@grid:1;@content:@svg(circle{r:1;animate r: 1;3 / 2s infinite})';
    assert.doesNotMatch(decode(await doodleToImage(host(0), smil, {})), /<animate[^>]*begin=/);
    assert.match(decode(await doodleToImage(host(1500), smil, {})), /<animate[^>]*begin="-1500ms"(?! end)/);
    assert.match(decode(await doodleToImage(host(1500, true), smil, {})), /<animate[^>]*begin="-1500ms" end="1ms" fill="freeze"/);
});

test('an animated nested doodle image carries one SMIL element for chrome', async () => {
    let host = {
        extra: {},
        compiled: { seed: 42 },
        getMaxGrid: () => 64,
        report: () => {},
        hasAttribute: () => false,
        _clock: { base: 0 },
        clockNow: () => 0,
    };
    const svg = async code => atob((await doodleToImage(host, code, {})).split(',')[1]);
    let animated = await svg("::before { content: ''; animation: k 1s infinite; }");
    assert.equal(animated.split('<set ').length - 1, 1);
    assert.ok(!(await svg('background: red;')).includes('<set '));
});

test('restamp redraws nested doodles and svg image clocks on pause and resume', () => {
    let applied = 0;
    let attrs = new Set();
    const host = compiled => ({
        compiled,
        hasAttribute: name => attrs.has(name),
        applyStyles: () => applied++,
        restamp: CSSDoodle.prototype.restamp,
    });
    let nested = host({ doodles: { d1: {} }, styles: { top: '', all: '' } });
    let clocks = host({ doodles: {}, styles: { top: '', all: 'a{background:url("data:image/svg+xml;utf8,%3Csvg%3E%3Canimate%2F%3E%3C%2Fsvg%3E")}' } });
    let plain = host({ doodles: {}, styles: { top: '', all: 'a{animation:x 1s}' } });
    host(undefined).restamp();
    assert.equal(applied, 0, 'nothing compiled yet');
    for (let paused of [false, true]) {
        if (paused) attrs.add('cssd-paused');
        applied = 0;
        nested.restamp();
        clocks.restamp();
        plain.restamp();
        assert.equal(applied, 2, paused ? 'paused' : 'resumed');
    }
});

test('a nested doodle is drawn from the render that asked for it', async () => {
    // a render still resolving when the next one lands used to read
    // host.compiled at that later moment: it drew from a stream that was not
    // its own, so the same source and seed could paint a different picture
    const owner = (seed) => ({ seed, random: createRandom(String(seed)).random });
    const host = (compiled) => ({
        extra: {},
        compiled,
        getMaxGrid: () => 64,
        report: () => {},
        hasAttribute: () => false,
        _clock: { base: 0 },
        clockNow: () => 0,
    });
    const code = 'background: @p(red, blue, green); transform: scale(@r(.5, 1));';

    // the asking render is the one named in the options, whatever the host
    // has compiled since; both sides get a fresh stream of the same seed
    const asked = await doodleToImage(host(owner('99999')), code, { compiled: owner('12345') });
    const settled = await doodleToImage(host(owner('12345')), code, {});
    const other = await doodleToImage(host(owner('99999')), code, {});

    assert.equal(asked, settled, 'the asking render decides, not the host');
    assert.notEqual(other, settled, 'a different seed is a different picture');
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
