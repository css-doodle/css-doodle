import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { launch, mount, settle, decode, colorAt, hex, near, painted, within } from './chrome.js';

let chrome;
before(async () => chrome = await launch());
after(() => chrome?.close());

async function shot(page, el) {
    let { png } = await settle(page, el);
    return { png, image: await decode(page, png) };
}

function assertColor(image, x, y, color) {
    let actual = colorAt(image, x, y);
    assert.ok(near(actual, hex(color)), `${x},${y} is rgb(${actual}), not ${color}`);
}

const next = (el, name) => el.evaluate((el, name) => {
    el.next = new Promise(resolve => el.addEventListener(name, resolve, { once: true }));
}, name);

// stands in for @css-doodle/addons@1 on unpkg
const sweep = `customElements.whenDefined('css-doodle').then(() => {
    customElements.get('css-doodle').use('sweep', {
        value: ([from, to]) => 'linear-gradient(90deg, ' + from + ', ' + to + ')',
    });
});`;

async function serveAddons(page, { down = [] } = {}) {
    let asked = [];
    await page.route(/\/@css-doodle\/addons@1\/.+\/index\.min\.js$/, route => {
        let [, host, name] = route.request().url().match(/\/\/([^/]+).*addons@1\/(.+)\/index\.min\.js$/);
        asked.push(`${host}/${name}`);
        return name == 'sweep' && !down.includes(host)
            ? route.fulfill({ body: sweep, contentType: 'text/javascript' })
            : route.fulfill({ status: 404 });
    });
    return asked;
}

const arrived = el => within(el.evaluate(el => el.next.then(() => {})), 10000, 'no event');

// two screenshots some frames apart
async function moving(page, el) {
    let a = await el.screenshot();
    await page.waitForTimeout(300);
    return !a.equals(await el.screenshot());
}

describe('component', { concurrency: 4 }, () => {
    test('a new seed redraws, and the old one draws the same picture again', () => chrome.withPage(async page => {
        let el = await mount(page, '@grid: 6 / 120px; background: @p(red, gold, teal, #333);', { seed: 1 });
        let first = await shot(page, el);
        await next(el, 'update');
        await el.evaluate(el => el.seed = 2);
        await arrived(el);
        let second = await shot(page, el);
        assert.ok(!first.png.equals(second.png), 'seed 2 drew the seed 1 picture');
        await next(el, 'update');
        await el.evaluate(el => el.seed = 1);
        await arrived(el);
        assert.ok(first.png.equals((await shot(page, el)).png), 'seed 1 drew a different picture');
    }));

    test('the grid attribute rebuilds the grid', () => chrome.withPage(async page => {
        let el = await mount(page, '@size: 10px; background: #09f;', { grid: 5 });
        assert.equal(await el.evaluate(el => el.shadowRoot.querySelectorAll('cell').length), 25);
        await next(el, 'update');
        await el.evaluate(el => el.grid = '3x2');
        await arrived(el);
        assert.equal(await el.evaluate(el => el.shadowRoot.querySelectorAll('cell').length), 6);
    }));

    test('update() swaps a @pattern without leaving the old image behind', () => chrome.withPage(async page => {
        let el = await mount(page, '@grid: 2 / 120px; background: @pattern(fill: #f00);');
        assertColor((await shot(page, el)).image, 30, 30, '#f00');
        await next(el, 'update');
        await el.evaluate(el => el.update('@grid: 2 / 120px; background: @pattern(fill: #00f);'));
        await arrived(el);
        assertColor((await shot(page, el)).image, 30, 30, '#00f');
        await next(el, 'update');
        await el.evaluate(el => el.update('@grid: 2 / 120px; background: #0c0;'));
        await arrived(el);
        assertColor((await shot(page, el)).image, 30, 30, '#0c0');
        let left = await el.evaluate(el => [...el.style].filter(name => name.startsWith('--')));
        assert.deepEqual(left, []);
    }));

    test('an addon that loads late redraws the doodles that call it, with the same seed', () => chrome.withPage(async page => {
        let el = await mount(page, '@grid: 1 / 120px; background: @addon-split(1, 0, 0);', {});
        let other = await mount(page, '@grid: 1 / 120px; background: #0c0;');
        let seed = await el.evaluate(el => el.seed);
        await other.evaluate(el => el.before = el.compiled);
        assert.deepEqual(await el.evaluate(el => el.warnings), ['unknown function @addon-split()']);
        await page.evaluate(() => customElements.get('css-doodle').use('addon-split', {
            shader: code => `void main() { FragColor = gl_FragCoord.x < u_resolution.x / 2.0 ? vec4(${code}, 1) : vec4(0, 0, 1, 1); }`,
        }));
        let { image } = await shot(page, el);
        assertColor(image, 30, 60, '#f00');
        assertColor(image, 90, 60, '#00f');
        assert.equal(await el.evaluate(el => el.seed), seed);
        assert.ok(await other.evaluate(el => el.before === el.compiled), 'an unrelated doodle redrew');
    }));

    test('a value addon registered first draws without a warning', () => chrome.withPage(async page => {
        await page.evaluate(() => customElements.get('css-doodle').use('addon-fill', {
            value: ([color], { i }) => i == 1 ? color : '#00f',
        }));
        let el = await mount(page, '@grid: 2x1 / 120px; background: @addon-fill(#0c0);');
        assert.deepEqual(await el.evaluate(el => el.warnings), []);
        let { image } = await shot(page, el);
        assertColor(image, 30, 60, '#0c0');
        assertColor(image, 90, 60, '#00f');
    }));

    test('a value addon that waits draws again, with the same seed, when the promise settles', () => chrome.withPage(async page => {
        await page.evaluate(() => {
            let color, ready = new Promise(resolve => window.finish = resolve);
            ready.then(value => color = value);
            customElements.get('css-doodle').use('addon-wait', {
                value: (args, { wait }) => color ?? (wait(ready), '#00f'),
            });
        });
        let el = await mount(page, '@grid: 1 / 120px; background: @addon-wait(); --r: @r(1);');
        assertColor((await shot(page, el)).image, 60, 60, '#00f');
        let before = await el.evaluate(el => [el.seed, el.compiled.styles.cells.match(/--r:[^;]+/)[0]]);
        await page.evaluate(() => window.finish('#0c0'));
        await page.waitForFunction(el => el.compiled.styles.cells.includes('#0c0'), el);
        assertColor((await shot(page, el)).image, 60, 60, '#0c0');
        assert.deepEqual(await el.evaluate(el => [el.seed, el.compiled.styles.cells.match(/--r:[^;]+/)[0]]), before);
    }));

    test('@use: name loads an addon once, before the first render', () => chrome.withPage(async page => {
        let asked = await serveAddons(page);
        let code = '@grid: 1 / 120px; @use: sweep; background: @sweep(#f00, #00f);';
        let first = await mount(page, code);
        let second = await mount(page, code);
        for (let el of [first, second]) {
            assert.deepEqual(await el.evaluate(el => el.warnings), []);
            let { image } = await shot(page, el);
            assertColor(image, 4, 60, '#f00');
            assertColor(image, 115, 60, '#00f');
        }
        assert.deepEqual(asked, ['unpkg.com/sweep']);
    }));

    test('update() to code with an addon still draws with a new seed', () => chrome.withPage(async page => {
        await serveAddons(page);
        let el = await mount(page, '@grid: 1 / 120px; background: #0c0;', {});
        let seed = await el.evaluate(el => el.seed);
        await next(el, 'update');
        await el.evaluate(el => el.update('@grid: 1 / 120px; @use: sweep; background: @sweep(#f00, #00f);'));
        await arrived(el);
        assertColor((await shot(page, el)).image, 4, 60, '#f00');
        assert.notEqual(await el.evaluate(el => el.seed), seed);
    }));

    test('@use loads addons by name only, and warns about one it cannot load', () => chrome.withPage(async page => {
        let asked = await serveAddons(page);
        let el = await mount(page, '@grid: 1 / 120px; @use: gradient2d, ../x; background: #0c0;');
        assert.deepEqual(await el.evaluate(el => el.warnings), ['unknown addon gradient2d']);
        assertColor((await shot(page, el)).image, 60, 60, '#0c0');
        assert.deepEqual(asked, ['unpkg.com/gradient2d', 'cdn.jsdelivr.net/gradient2d']);
        assert.deepEqual(page.errors.splice(0), ['Failed to load resource: the server responded with a status of 404 (Not Found)', 'Failed to load resource: the server responded with a status of 404 (Not Found)']);
    }));

    test('@use falls back to the next host when one is down', () => chrome.withPage(async page => {
        let asked = await serveAddons(page, { down: ['unpkg.com'] });
        let el = await mount(page, '@grid: 1 / 120px; @use: sweep; background: @sweep(#f00, #00f);');
        assert.deepEqual(await el.evaluate(el => el.warnings), []);
        assertColor((await shot(page, el)).image, 4, 60, '#f00');
        assert.deepEqual(asked, ['unpkg.com/sweep', 'cdn.jsdelivr.net/sweep']);
        assert.deepEqual(page.errors.splice(0), ['Failed to load resource: the server responded with a status of 404 (Not Found)']);
    }));

    test('CSSDoodle.addonBase is tried first, and a script tag already on the page is not fetched again', () => chrome.withPage(async page => {
        let asked = await serveAddons(page);
        await page.route('https://mirror.test/sweep/index.min.js', route => {
            asked.push('mirror.test/sweep');
            return route.fulfill({ body: sweep, contentType: 'text/javascript' });
        });
        await page.evaluate(() => { customElements.get('css-doodle').addonBase = 'https://mirror.test/'; });
        let el = await mount(page, '@grid: 1 / 120px; @use: sweep; background: @sweep(#f00, #00f);');
        assertColor((await shot(page, el)).image, 4, 60, '#f00');
        assert.deepEqual(asked, ['mirror.test/sweep']);

        await page.evaluate(() => {
            let tag = document.createElement('script');
            tag.src = 'https://mirror.test/other/index.min.js';
            document.head.append(tag);
        });
        asked.length = 0;
        await mount(page, '@grid: 1 / 120px; @use: other; background: #0c0;');
        assert.deepEqual(asked, []);
    }));

    test('click:update draws a new picture on each click', () => chrome.withPage(async page => {
        let el = await mount(page, '@grid: 6 / 120px; background: @p(red, gold, teal, #333);', { 'click:update': '' });
        let first = await shot(page, el);
        await next(el, 'update');
        await el.click();
        await arrived(el);
        assert.ok(!first.png.equals((await shot(page, el)).png));
    }));

    test('a doodle moved in the document draws the same picture again', () => chrome.withPage(async page => {
        let code = '@grid: 2 / 120px; background: @pn(#f00, #fc0); :after { content: ""; position: absolute; inset: 20px; background: @pattern(fill: #00f); }';
        let el = await mount(page, code);
        let before = await shot(page, el);
        assertColor(before.image, 30, 30, '#00f');
        await next(el, 'render');
        await el.evaluate(el => {
            el.remove();
            document.body.append(el);
        });
        await arrived(el);
        let after = await shot(page, el);
        assert.ok(before.png.equals(after.png), 'the picture changed');
    }));

    describe('pause() and resume()', () => {
        let code = `@grid: 2 / 160px;
            @nth(1) { animation: spin 1s linear infinite; background: #09f; }
            @keyframes spin { to { transform: rotate(1turn) } }
            @nth(2) { background: @pattern(fill: vec3(fract(t))); }
            @nth(3) { @content: @svg(viewBox: 0 0 10 10; circle { cx: 5; cy: 5; r: 3; animate { attributeName: r; from: 1; to: 4; dur: 1s; repeatCount: indefinite; } }); }
            @nth(4) { @content: @doodle(@grid: 1; animation: spin 1s linear infinite; background: red;); }`;

        // CSS animations, SMIL, nested doodles and the shader loop
        const state = el => el.evaluate(el => ({
            attribute: el.hasAttribute('cssd-paused'),
            css: [...new Set(el.shadowRoot.getAnimations().map(a => a.playState))],
            smil: [...el.shadowRoot.querySelectorAll('svg')].map(svg => svg.animationsPaused()),
            nested: [...el.shadowRoot.querySelectorAll('css-doodle')].map(d => d.hasAttribute('cssd-paused')),
        }));

        test('stop and restart every kind of motion', () => chrome.withPage(async page => {
            let el = await mount(page, code);
            assert.deepEqual(await state(el), { attribute: false, css: ['running'], smil: [false], nested: [false] });
            assert.ok(await moving(page, el), 'nothing moves before pausing');

            await el.evaluate(el => el.pause());
            assert.deepEqual(await state(el), { attribute: true, css: ['paused'], smil: [true], nested: [true] });
            assert.ok(!(await moving(page, el)), 'still moving after pause()');

            await el.evaluate(el => el.resume());
            assert.deepEqual(await state(el), { attribute: false, css: ['running'], smil: [false], nested: [false] });
            assert.ok(await moving(page, el), 'nothing moves after resume()');
        }));

        test('pause() before the first render holds what the render draws, nested doodles too', () => chrome.withPage(async page => {
            let el = await page.evaluateHandle(code => {
                let el = document.createElement('css-doodle');
                el.textContent = code;
                el.rendered = new Promise(resolve => el.addEventListener('render', resolve, { once: true }));
                el.pause();
                document.body.append(el);
                return el;
            }, code);
            await within(el.evaluate(el => el.rendered), 10000, 'no render event');
            await shot(page, el);
            assert.deepEqual(await state(el), { attribute: true, css: ['paused'], smil: [true], nested: [true] });
            assert.ok(!(await moving(page, el)), 'moves although paused');
        }));

        test('reduced motion pauses unless ignore-reduced-motion is set', () => chrome.withPage(async page => {
            await page.emulateMedia({ reducedMotion: 'reduce' });
            let el = await mount(page, code);
            let kept = await mount(page, code, { seed: 1, 'ignore-reduced-motion': '' });
            assert.equal((await state(el)).attribute, true);
            assert.ok(!(await moving(page, el)), 'moves under reduced motion');
            assert.equal((await state(kept)).attribute, false);

            await page.emulateMedia({ reducedMotion: 'no-preference' });
            await page.waitForFunction(el => !el.hasAttribute('cssd-paused'), el);
            assert.ok(await moving(page, el), 'nothing moves once motion is allowed');
        }));

        let timed = code + ':doodle { --t: @t; }';
        const clocks = el => el.evaluate(el => [
            el.currentTime,
            ...[...el.getAnimations(), ...el.shadowRoot.getAnimations()]
                .filter(a => a.animationName !== 'cssd-U-ani').map(a => a.currentTime),
            ...[...el.shadowRoot.querySelectorAll('svg')].map(svg => svg.getCurrentTime() * 1000),
            ...[...el.shadowRoot.querySelectorAll('css-doodle')].map(d => d.currentTime),
        ].map(Math.round));

        test('currentTime seeks every kind of motion to one time', () => chrome.withPage(async page => {
            let seeked = await mount(page, timed);
            await seeked.evaluate(el => { el.pause(); el.currentTime = 1250; });
            let ran = await mount(page, timed);
            await page.waitForTimeout(700);
            await ran.evaluate(el => { el.pause(); el.currentTime = 1250; });
            assert.deepEqual(await clocks(seeked), Array(6).fill(1250));
            assert.deepEqual(await clocks(ran), Array(6).fill(1250));
            let a = await shot(page, seeked), b = await shot(page, ran);
            assert.ok(a.png.equals(b.png), 'the same time draws a different picture');
            assertColor(a.image, 120, 40, '#404040');
        }));

        test('currentTime set before the doodle draws applies when it does', () => chrome.withPage(async page => {
            let els = [];
            for (let before of [true, false]) {
                let el = await page.evaluateHandle(({ code, before }) => {
                    let el = document.createElement('css-doodle');
                    el.setAttribute('seed', 1);
                    el.textContent = code;
                    el.rendered = new Promise(resolve => el.addEventListener('render', resolve, { once: true }));
                    el.pause();
                    if (before) el.currentTime = 1250;
                    document.body.append(el);
                    if (!before) el.currentTime = 1250;
                    return el;
                }, { code: timed, before });
                assert.equal(await el.evaluate(el => el.currentTime), 1250);
                await within(el.evaluate(el => el.rendered), 10000, 'no render event');
                els.push(el);
            }
            let a = await shot(page, els[0]), b = await shot(page, els[1]);
            for (let el of els) {
                assert.deepEqual(await clocks(el), Array(6).fill(1250));
            }
            assert.ok(a.png.equals(b.png), 'the same time draws a different picture');
            assertColor(a.image, 120, 40, '#404040');
        }));

        test('currentTime set while running runs on from there', () => chrome.withPage(async page => {
            let el = await mount(page, timed);
            await el.evaluate(el => el.currentTime = 5000);
            await page.waitForTimeout(300);
            let times = await clocks(el);
            assert.ok(times.every(t => t > 5200 && t < 6000), `clocks at ${times}`);
            let spread = group => Math.max(...group) - Math.min(...group);
            assert.ok(spread([times[0], times.at(-1)]) < 100, `clocks at ${times}`);
            assert.ok(spread(times.slice(1, -1)) < 100, `clocks at ${times}`);
        }));
    });

    test('a shader redraws at the new size when the host resizes', () => chrome.withPage(async page => {
        // 10px stripes in device pixels: stretching the old image would widen them
        let code = '@grid: 1 / 60px; background: @shaders(void main() { gl_FragColor = vec4(vec3(step(.5, fract(gl_FragCoord.x / 20.))), 1.); });';
        let el = await mount(page, code);
        let { image } = await shot(page, el);
        assertColor(image, 5, 30, '#000');
        assertColor(image, 15, 30, '#fff');
        await el.evaluate(el => el.style.width = el.style.height = '120px');
        await page.waitForFunction(el => el.getBoundingClientRect().width === 120, el);
        await page.waitForTimeout(300);
        ({ image } = await shot(page, el));
        assert.equal(image.width, 120);
        assertColor(image, 15, 60, '#fff');
        assertColor(image, 25, 60, '#000');
        assertColor(image, 115, 60, '#fff');
    }));

    describe('export()', () => {
        async function exported(page, el, options) {
            let result = await el.evaluate(async (el, options) => {
                let { width, height, svg, blob } = await el.export(options);
                let png = '';
                if (blob) {
                    let bytes = new Uint8Array(await blob.arrayBuffer());
                    for (let i = 0; i < bytes.length; i += 0x8000) {
                        png += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
                    }
                }
                return { width, height, svg, png: btoa(png) };
            }, options);
            return { ...result, image: result.png && await decode(page, Buffer.from(result.png, 'base64')) };
        }

        test('gives an SVG, and a PNG at the asked scale', () => chrome.withPage(async page => {
            let el = await mount(page, '@grid: 2 / 100px; background: @pn(#f00, #00f, #00f, #f00);');
            let { width, height, svg } = await exported(page, el);
            assert.deepEqual([width, height], [100, 100]);
            assert.match(svg, /^\s*<svg[\s\S]*<foreignObject/);

            let { image } = await exported(page, el, { detail: true, scale: 2 });
            assert.deepEqual([image.width, image.height], [200, 200]);
            assertColor(image, 50, 50, '#f00');
            assertColor(image, 150, 50, '#00f');
            assertColor(image, 150, 150, '#f00');
        }));

        test('keeps @pattern and @scene images', () => chrome.withPage(async page => {
            let el = await mount(page, '@grid: 2 / 120px; @nth(1) { background: @pattern(fill: #0c0); } @nth(2) { background: @scene(sphere { r: .5; fill: #09f }); }');
            let live = (await shot(page, el)).image;
            let { image } = await exported(page, el, { detail: true });
            assertColor(image, 30, 30, '#0c0');
            assert.deepEqual(colorAt(image, 90, 25), colorAt(live, 90, 25));
            assert.ok(painted(image) >= painted(live) * .99);
        }));
    });
});
