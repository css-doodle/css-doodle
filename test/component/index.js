import test from 'node:test';
import assert from 'node:assert/strict';

import parseCss from '../../src/parser/parse-css.js';
import parseGrid from '../../src/parser/parse-grid.js';
import generateCss from '../../src/generator/css.js';
import createRandom from '../../src/core/random.js';
import { doodleToImage } from '../../src/component/doodle-image.js';
import { stampSheet } from '../../src/component/clock.js';

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
        assert.ok(source.startsWith('data:image/svg+xml,'));
        return decodeURIComponent(source.slice(source.indexOf(',') + 1));
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
    const svg = async code => {
        let url = await doodleToImage(host, code, {});
        return decodeURIComponent(url.slice(url.indexOf(',') + 1));
    };
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

test('a warning is dispatched each time, and printed once', () => {
    let printed = [];
    let events = [];
    let warn = console.warn;
    console.warn = message => printed.push(message);
    try {
        let host = { _warned: new Set(), triggerEvent: (name, detail) => (events.push(detail.message), true) };
        CSSDoodle.prototype.report.call(host, [{ message: '@shaders: syntax error' }]);
        CSSDoodle.prototype.report.call(host, [{ message: '@shaders: syntax error' }]);
    } finally {
        console.warn = warn;
    }
    assert.deepEqual(events, ['@shaders: syntax error', '@shaders: syntax error']);
    assert.deepEqual(printed, ['@shaders: syntax error']);
});

test('a generator warning reports the line and column of its offset', () => {
    let printed = [];
    let warn = console.warn;
    console.warn = message => printed.push(message);
    try {
        let host = { _warned: new Set(), triggerEvent: () => true };
        let source = 'background: red;\n  width: @nope(1);';
        let { warnings } = generateCss(parseCss(source), parseGrid('1'), 42, 64);
        CSSDoodle.prototype.report.call(host, warnings, source);
        CSSDoodle.prototype.report.call(host, [{ message: 'parser', pos: [4, 2] }, { message: 'plain' }], source);
    } finally {
        console.warn = warn;
    }
    assert.deepEqual(printed, [
        'unknown function @nope() (at line 2, column 10)',
        'parser (at line 3, column 5)',
        'plain',
    ]);
});

test('a nested doodle url is escaped text, not base64, and hidden from the clock', async () => {
    const host = (ms = 0) => ({
        extra: {},
        compiled: { seed: 42 },
        getMaxGrid: () => 64,
        report: () => {},
        hasAttribute: () => false,
        _clock: { base: ms, since: 0 },
        clockNow: () => ms,
    });
    // a doodle in a doodle: the inner url sits in the CDATA of the outer sheet
    let code = 'animation: spin 4s; :after { content: "中 #1 50%"; } background: @doodle(color: red;);';
    let url = await doodleToImage(host(), code, {});
    assert.ok(url.startsWith('data:image/svg+xml,'));
    let text = url.slice(url.indexOf(',') + 1);
    // no character that ends the css string, the url, or the CDATA around it
    assert.doesNotMatch(text, /["#\n\r\\]|]]>/);
    let svg = decodeURIComponent(text);
    assert.ok(svg.includes('content:"中 #1 50%"'), svg);
    assert.ok(svg.includes('url("data:image/svg+xml,'), svg);
    // the host clock shifts its own animations, not the ones inside the image
    let sheet = `cell{animation:spin 4s;background:url("${url}")}`;
    let stamped = stampSheet(host(2500), sheet);
    assert.ok(stamped.startsWith('cell{animation:spin 4s -2500ms;'), stamped);
    assert.ok(stamped.includes(url));
});

test(']]> in a nested doodle sheet does not end its CDATA section', async () => {
    let host = {
        extra: {},
        compiled: { seed: 42 },
        getMaxGrid: () => 64,
        report: () => {},
        hasAttribute: () => false,
        _clock: { base: 0 },
        clockNow: () => 0,
    };
    let url = await doodleToImage(host, ':after { content: "]]>"; } color: red;', {});
    let svg = decodeURIComponent(url.slice(url.indexOf(',') + 1));
    let style = svg.slice(svg.indexOf('<style>') + 7, svg.indexOf('</style>'));
    // the sections, read back as XML would, give the sheet with its ]]>
    let text = style.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
    assert.ok(text.includes('content:"]]>"'), style);
    assert.ok(text.includes('color:red'), style);
});

test('a restamp redraws a nested doodle without drawing from the random stream again', async () => {
    let draws = 0;
    let compiled = { seed: 42, random: () => (draws++ % 7) / 7 };
    let host = ms => ({
        extra: {},
        compiled,
        getMaxGrid: () => 64,
        report: () => {},
        hasAttribute: () => false,
        _clock: { base: ms, since: 0 },
        clockNow: () => ms,
    });
    let code = 'background: @p(red, blue, green, gold); animation: spin 4s;';
    let options = { instance: 'doodle-1', compiled };
    let first = decodeURIComponent(await doodleToImage(host(0), code, options));
    let used = draws;
    assert.ok(used > 0);
    // the clock moved on: the image is stamped again, the colours stay
    let again = decodeURIComponent(await doodleToImage(host(1000), code, options));
    assert.equal(draws, used);
    assert.match(again, /animation:\s*spin 4s -1000ms/);
    assert.equal(again.replace(/ -1000ms/g, ''), first);
    // another render composes afresh
    await doodleToImage(host(0), code, { ...options, compiled: { ...compiled } });
    assert.ok(draws > used);
});

test('a host parsed with a declarative shadow root renders at once, even with no source', () => {
    for (let [declared, expected] of [[true, 'load'], [false, 'wait']]) {
        let calls = [];
        let host = Object.assign(Object.create(CSSDoodle.prototype), {
            _declared: declared,
            innerHTML: '',
            hasAttribute: name => name === 'role',
            load: () => calls.push('load'),
            waitForSource: () => calls.push('wait'),
        });
        host.connectedCallback();
        assert.deepEqual(calls, [expected]);
    }
});

test('load leaves a prerendered template and filter holder out of the source', () => {
    let source = 'color: red;';
    let rendered;
    let host = Object.assign(Object.create(CSSDoodle.prototype), {
        innerHTML: source + '<template shadowrootmode="open"></template><ft slot="ft"></ft>',
        querySelectorAll(selector) {
            assert.equal(selector, ':scope>template[shadowrootmode],:scope>ft');
            return [{ remove: () => { this.innerHTML = source; } }];
        },
        render(code) { rendered = code; this._styleReady = Promise.resolve(); },
        hasAttribute: () => false,
        triggerEvent: () => {},
    });
    globalThis.document = { createElement: () => ({ set innerHTML(v) { this.value = v; } }) };
    try {
        host.load();
    } finally {
        delete globalThis.document;
    }
    assert.equal(rendered, source);
});

test('load keeps a plain template wrapper around the source', () => {
    // <css-doodle><template>code</template></css-doodle> is how the CLI and
    // other embedders pass source, only prerendered templates are dropped
    let source = '<template>color: red;</template>';
    let rendered;
    let host = Object.assign(Object.create(CSSDoodle.prototype), {
        innerHTML: source,
        querySelectorAll(selector) {
            assert.equal(selector, ':scope>template[shadowrootmode],:scope>ft');
            return [];
        },
        render(code) { rendered = code; this._styleReady = Promise.resolve(); },
        hasAttribute: () => false,
        triggerEvent: () => {},
    });
    globalThis.document = { createElement: () => ({ set innerHTML(v) { this.value = v; } }) };
    try {
        host.load();
    } finally {
        delete globalThis.document;
    }
    assert.equal(rendered, source);
});

test('waitForSource waits for the end tag while the document parses', () => {
    let fire;
    let Observer = globalThis.MutationObserver;
    globalThis.MutationObserver = class { constructor(fn) { fire = fn; } observe() {} disconnect() {} };
    try {
        let loads = 0;
        let host = {
            ownerDocument: { readyState: 'loading', addEventListener() {}, removeEventListener() {} },
            parentNode: { nextSibling: null },
            nextSibling: null,
            isConnected: true,
            getRootNode: () => ({}),
            load() { loads++; this.compiled = {}; },
            waitForSource: CSSDoodle.prototype.waitForSource,
        };
        host.waitForSource();
        fire();
        assert.equal(loads, 0, 'a text node alone may be a chunk of the source');
        host.nextSibling = {};
        fire();
        assert.equal(loads, 1, 'the parser has passed the end tag');
        // the last child of its parent: the parser passes the parent's end tag instead
        host = { ...host, parentNode: { nextSibling: null }, nextSibling: null, compiled: undefined };
        host.waitForSource();
        fire();
        assert.equal(loads, 1);
        host.parentNode.nextSibling = {};
        fire();
        assert.equal(loads, 2, 'the parser has passed an ancestor');
        // a parsed document loads on the first mutation
        host = { ...host, ownerDocument: { ...host.ownerDocument, readyState: 'complete' }, nextSibling: null, compiled: undefined };
        host.waitForSource();
        fire();
        assert.equal(loads, 3);
    } finally {
        globalThis.MutationObserver = Observer;
    }
});

test('buildGrid writes the whole sheet without placeholders and reflows only for a transition', () => {
    let written, reflows = 0;
    let host = {
        shadowRoot: { set innerHTML(html) { written = html; } },
        reflow: () => reflows++,
        mount() {},
        buildGrid: CSSDoodle.prototype.buildGrid,
    };
    let build = code => {
        let grid = parseGrid('2');
        let compiled = generateCss(parseCss(code), grid, 42, 64);
        host.buildGrid(compiled, grid);
        return compiled;
    };
    let compiled = build('@size: 10px; background: @doodle(background: red;); animation: a 1s;');
    assert.ok(compiled.props.hasAnimation);
    assert.ok(compiled.styles.all.includes('${'), 'the sheet holds an image placeholder');
    assert.ok(written.includes('10px') && written.includes('<grid'), 'cells are sized before images are measured');
    assert.ok(!written.includes('${'), 'placeholders are stripped, their } would close a block');
    assert.equal(reflows, 0, 'animations start without a forced layout');
    build('background: red; transition: background 1s;');
    assert.ok(!written.includes('transition'), 'a transition runs in from the host rules alone');
    assert.equal(reflows, 1);
    build('background: red;');
    assert.ok(!written.includes('background'), 'with no images to wait for, the whole sheet follows at once');
    assert.equal(reflows, 1);
});

test('shouldRebuild reads the first child instead of serializing the shadow root', () => {
    let host = {
        shadowRoot: { firstChild: null, get innerHTML() { throw new Error('serialized'); } },
        shouldRebuild: CSSDoodle.prototype.shouldRebuild,
    };
    assert.equal(host.shouldRebuild({}, {}, {}), true);
});

test('render and update events follow the sheet', async () => {
    let events = [];
    let resolve;
    let host = {
        _code: 'x',
        hasAttribute: () => false,
        triggerEvent: name => events.push(name),
        render() { this._styleReady = new Promise(r => { resolve = r; }); },
        load: CSSDoodle.prototype.load,
        update: CSSDoodle.prototype.update,
    };
    const tick = () => new Promise(r => setTimeout(r));
    host.load();
    await tick();
    assert.deepEqual(events, [], 'the sheet is still pending');
    resolve();
    await tick();
    assert.deepEqual(events, ['render']);
    events = [];
    host.update();
    await tick();
    assert.deepEqual(events, ['beforeUpdate']);
    resolve();
    await tick();
    assert.deepEqual(events, ['beforeUpdate', 'render', 'update']);
});

test('a redraw keeps the host variables of the images it draws again', () => {
    let removed = [];
    let next = { shaders: { 's-1': {} }, patterns: {} };
    let host = {
        compiled: { shaders: { 's-1': {}, 's-2': {} }, patterns: { 'p-1': {} } },
        style: { removeProperty: name => removed.push(name) },
        cleanup() {},
        generate() { return this.compiled = next; },
        getGrid() {},
        shouldRebuild: () => false,
        patch() {},
        render: CSSDoodle.prototype.render,
        disconnectedCallback: CSSDoodle.prototype.disconnectedCallback,
    };
    host.render('code');
    assert.deepEqual(removed.sort(), ['--p-1', '--s-2']);
    removed = [];
    host.disconnectedCallback();
    assert.deepEqual(removed, ['--s-1']);
});
