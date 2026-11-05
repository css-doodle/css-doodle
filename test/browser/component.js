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

async function serveAddons(page, { down = [], hung = [] } = {}) {
    let asked = [];
    await page.route(/\/@css-doodle\/addons@1\/[^/]+\.js$/, route => {
        let [, host, name] = route.request().url().match(/\/\/([^/]+).*addons@1\/([^/]+)\.js$/);
        asked.push(`${host}/${name}`);
        if (hung.includes(host)) return;
        return ['sweep', 'sweeps'].includes(name) && !down.includes(host)
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

    test('@doodle.wrap brings back what crosses the edge of its tile, over its own fill', () => chrome.withPage(async page => {
        let el = await mount(page, '@grid: 1 / 240px 120px; background: @doodle120.wrap(@grid: 1 / 100% / #fff; @place: 100% 50%; @size: 60px; background: #000; border-radius: 50%);');
        let { image } = await shot(page, el);
        // the dot sits on the right edge of each 120px tile, so half of it shows at the left
        for (let x of [4, 116, 124, 236]) assertColor(image, x, 60, '#000');
        assertColor(image, 60, 60, '#fff');
        assertColor(image, 180, 60, '#fff');
    }));

    test('a doodle addon that loads late redraws the doodles that call it with a size', () => chrome.withPage(async page => {
        let el = await mount(page, '@grid: 1 / 120px; background: @doodle60.addon-tile(@grid: 1 / 100%; background: #f00;);');
        await page.evaluate(() => customElements.get('css-doodle').use('doodle.addon-tile', {
            doodle: (code, { size }) => ({ code: code + ':doodle { background: #00f; } @size: 50%;', size: size + 'x' + size }),
        }));
        let { image } = await shot(page, el);
        // the 60px tile it gave, repeated: a red cell in the corner of each, on blue
        for (let [x, y] of [[15, 15], [75, 15], [75, 75]]) assertColor(image, x, y, '#f00');
        for (let [x, y] of [[45, 45], [105, 45], [105, 105]]) assertColor(image, x, y, '#00f');
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

    test('a value addon reads a var() the page sets, and warns about one it cannot see', () => chrome.withPage(async page => {
        await page.addStyleTag({ content: 'css-doodle { --brand: #0c0 }' });
        await page.evaluate(() => customElements.get('css-doodle').use('addon-rgb', {
            value: ([name], { color, warn }) => color(name)?.slice(0, 3).join(' ') ?? (warn(`invalid color ${name}`), ''),
        }));
        let el = await mount(page, '@grid: 1 / 120px; --a: #0c0; --b: @addon-rgb(var(--brand)); --c: @addon-rgb(var(--a));');
        assert.deepEqual(await el.evaluate(el => el.warnings), ['invalid color var(--a)']);
        let b = await el.evaluate(el => getComputedStyle(el.shadowRoot.querySelector('cell')).getPropertyValue('--b').trim());
        assert.equal(b, '0 0.8 0');
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

    test('a shader variant draws with its own shader', () => chrome.withPage(async page => {
        await page.evaluate(() => {
            let CSSDoodle = customElements.get('css-doodle');
            CSSDoodle.use('addon-tint', { shader: () => 'void main() { FragColor = vec4(1, 0, 0, 1); }' });
            CSSDoodle.use('addon-tint.blue', { shader: () => 'void main() { FragColor = vec4(0, 0, 1, 1); }' });
        });
        let el = await mount(page, '@grid: 1 / 120px; background: @addon-tint.blue(1);');
        assertColor((await shot(page, el)).image, 60, 60, '#00f');
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

    test('@use: name loads a file whose functions have other names, once and without a warning', () => chrome.withPage(async page => {
        let asked = await serveAddons(page);
        let code = '@grid: 1 / 120px; @use: sweeps; background: @sweep(#f00, #00f);';
        for (let el of [await mount(page, code), await mount(page, code)]) {
            assert.deepEqual(await el.evaluate(el => el.warnings), []);
            assertColor((await shot(page, el)).image, 4, 60, '#f00');
        }
        assert.deepEqual(asked, ['unpkg.com/sweeps']);
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

    test('code that overflows the stack warns instead of throwing, and update() keeps the old picture', () => chrome.withPage(async page => {
        let deep = await mount(page, `@grid: 1 / 120px; width: ${'@r('.repeat(50000)}1${')'.repeat(50000)};`);
        assert.equal((await deep.evaluate(el => el.warnings)).length, 1);
        let el = await mount(page, '@grid: 1 / 120px; background: #00f;');
        await el.evaluate(el => el.update(`@grid: 1 / 120px; background: #0c0; width: $(${Array(200000).fill(1).join('+')})px;`));
        assert.equal((await el.evaluate(el => el.warnings)).length, 1);
        assertColor((await shot(page, el)).image, 60, 60, '#00f');
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

    test('@use passes over a host that hangs', () => chrome.withPage(async page => {
        let asked = await serveAddons(page, { hung: ['unpkg.com'] });
        let el = await mount(page, '@grid: 1 / 120px; @use: sweep; background: @sweep(#f00, #00f);');
        assert.deepEqual(await el.evaluate(el => el.warnings), []);
        assertColor((await shot(page, el)).image, 4, 60, '#f00');
        assert.deepEqual(asked, ['unpkg.com/sweep', 'cdn.jsdelivr.net/sweep']);
    }));

    test('CSSDoodle.addonBase is tried first', () => chrome.withPage(async page => {
        let asked = await serveAddons(page);
        await page.route('https://mirror.test/sweep.js', route => {
            asked.push('mirror.test/sweep');
            return route.fulfill({ body: sweep, contentType: 'text/javascript' });
        });
        await page.evaluate(() => { customElements.get('css-doodle').addonBase = 'https://mirror.test/'; });
        let el = await mount(page, '@grid: 1 / 120px; @use: sweep; background: @sweep(#f00, #00f);');
        assertColor((await shot(page, el)).image, 4, 60, '#f00');
        assert.deepEqual(asked, ['mirror.test/sweep']);
    }));

    test('@use does not fetch an addon that registers right after the first draw, as one imported after css-doodle does', () => chrome.withPage(async page => {
        let asked = await serveAddons(page);
        let el = await page.evaluateHandle(() => {
            let el = document.createElement('css-doodle');
            el.warnings = [];
            el.addEventListener('warn', e => el.warnings.push(e.detail.message));
            el.rendered = new Promise(resolve => el.addEventListener('render', resolve, { once: true }));
            el.textContent = '@grid: 1 / 120px; @use: bundled; background: @bundled(#f00);';
            document.body.append(el);
            customElements.whenDefined('css-doodle').then(() => {
                customElements.get('css-doodle').use('bundled', { value: ([color]) => color });
            });
            return el;
        });
        await within(el.evaluate(el => el.rendered), 10000, 'no render event');
        assertColor((await shot(page, el)).image, 60, 60, '#f00');
        assert.deepEqual(await el.evaluate(el => el.warnings), []);
        assert.deepEqual(asked, []);
    }));

    test('@use still loads an addon when a page script only shares its file name', () => chrome.withPage(async page => {
        let asked = await serveAddons(page);
        await page.route('https://site.test/js/sweep.js', route => route.fulfill({ body: '', contentType: 'text/javascript' }));
        await page.evaluate(() => new Promise(resolve => {
            let tag = document.createElement('script');
            tag.src = 'https://site.test/js/sweep.js';
            tag.onload = resolve;
            document.head.append(tag);
        }));
        let el = await mount(page, '@grid: 1 / 120px; @use: sweep; background: @sweep(#f00, #00f);');
        assertColor((await shot(page, el)).image, 4, 60, '#f00');
        assert.deepEqual(asked, ['unpkg.com/sweep']);
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

    test('a nested doodle keeps its render event to itself', () => chrome.withPage(async page => {
        let events = await page.evaluate(code => new Promise(resolve => {
            let el = document.createElement('css-doodle');
            let events = [];
            el.addEventListener('render', e => {
                let own = e.composedPath()[0] === el;
                events.push(own ? 'host' : 'nested');
                if (own) resolve(events);
            });
            el.textContent = code;
            document.body.append(el);
        }), '@grid: 2 / 120px; @content: @doodle(@grid: 1; background: red;);');
        assert.deepEqual(events, ['host']);
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

    test('animated shaders of more sizes than the browser has contexts share surfaces, and none is lost', () => chrome.withPage(async page => {
        // u_time keeps each one animated, so it holds on to its surface
        let shader = 'void main() { gl_FragColor = vec4(vec3(step(.5, fract(gl_FragCoord.x / 20.))), min(1., u_time + 2.)); }';
        let els = [];
        for (let k = 0; k < 20; k++) {
            els.push(await mount(page, `@grid: 1 / ${40 + k}px; background: @shaders(${shader});`));
        }
        await page.waitForTimeout(500);
        for (let el of els) {
            assert.deepEqual(await el.evaluate(el => el.warnings || []), []);
        }
        for (let el of [els[0], els.at(-1)]) {
            let { image } = await shot(page, el);
            assertColor(image, 5, 20, '#000');
            assertColor(image, 15, 20, '#fff');
        }
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
    test('cells: the elements it selects are its cells, and follow the list', () => chrome.withPage(async page => {
        await page.evaluate(() => document.body.innerHTML = '<ul>' + '<li>x</li>'.repeat(4) + '</ul>');
        let el = await mount(page, `
            @grid: 5;
            :doodle { --c: @p(#f00) }
            rotate: @r(-9deg, 9deg);
            @nth(2) { color: var(--c) }
            ::after { content: "@i/@I" }
        `, { seed: 1, cells: 'li' });
        let read = () => page.evaluate(() => [...document.querySelectorAll('li')].map(li => [
            getComputedStyle(li).rotate, getComputedStyle(li).color, getComputedStyle(li, '::after').content,
        ]));
        let first = await read();
        assert.equal(new Set(first.map(([rotate]) => rotate)).size, 4);
        assert.equal(first[1][1], 'rgb(255, 0, 0)');
        assert.deepEqual(first.map(([, , after]) => after), ['"1/4"', '"2/4"', '"3/4"', '"4/4"']);
        assert.equal(await el.evaluate(el => el.getAttribute('role')), null);
        assert.equal(await page.evaluate(() => getComputedStyle(document.body).boxSizing), 'content-box');

        // a longer list draws again with the same seed
        await page.evaluate(() => document.querySelector('ul').append(document.createElement('li')));
        await page.waitForFunction(() => getComputedStyle(document.querySelector('li:last-child'), '::after').content == '"5/5"');
        let second = await read();
        assert.deepEqual(second.slice(0, 4).map(([rotate]) => rotate), first.map(([rotate]) => rotate));

        // without the attribute it is a doodle of its own again
        await next(el, 'update');
        await el.evaluate(el => el.removeAttribute('cells'));
        await arrived(el);
        assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll('li')].map(li => getComputedStyle(li).rotate)), Array(5).fill('none'));
        assert.equal(await el.evaluate(el => [el.shadowRoot.querySelectorAll('cell').length, el.children.length].join()), '25,0');
    }));

    test('cells: its rules weigh one id against the page\'s own styles', () => chrome.withPage(async page => {
        await page.evaluate(() => document.body.innerHTML =
            '<style>ul li.k.k { color: blue } #u li { background-color: blue }</style><ul id="u"><li class="k">x</li><li class="k">x</li></ul>');
        await mount(page, 'color: red; background-color: red; @nth(2) { color: lime; background-color: lime }', { seed: 1, cells: 'li' });
        assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll('li')].map(li =>
            [getComputedStyle(li).color, getComputedStyle(li).backgroundColor])), [
            ['rgb(255, 0, 0)', 'rgb(0, 0, 255)'],
            ['rgb(0, 255, 0)', 'rgb(0, 0, 255)'],
        ]);
    }));

    test('cells: @grid gives the columns, :doodle is their parent, and images, clicks and pause reach them', () => chrome.withPage(async page => {
        await page.evaluate(() => document.body.innerHTML =
            '<div id="p" style="display:grid;grid-template-columns:repeat(3,40px)">' + '<i style="height:40px"></i>'.repeat(6) + '</div>');
        let el = await mount(page, `
            @grid: 3;
            :doodle { --c: #0c0; outline: 2px solid }
            @row(1) { background: var(--c) }
            @row(2) { background: @pattern(fill: #00f) }
            animation: k 1s infinite; @keyframes k { to { opacity: .5 } }
        `, { seed: 1, cells: 'i' });
        await page.waitForFunction(() => getComputedStyle(document.querySelectorAll('i')[4]).backgroundImage.startsWith('url("data:image/png'));
        assert.equal(await page.evaluate(() => getComputedStyle(document.getElementById('p')).outlineStyle), 'solid');
        assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll('i')].map(i => getComputedStyle(i).backgroundColor).slice(0, 3)), Array(3).fill('rgb(0, 204, 0)'));
        assert.match(await page.evaluate(() => getComputedStyle(document.querySelector('i')).animationName), /^k-\w+$/);

        await el.evaluate(el => el.pause());
        assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('i')).animationPlayState), 'paused');
        await el.evaluate(el => el.resume());
        assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('i')).animationPlayState), 'running');

        await el.evaluate(el => el.addEventListener('click:cell', e => el.clicked = [e.detail.x, e.detail.y]));
        await page.click('i:nth-child(5)');
        assert.deepEqual(await el.evaluate(el => el.clicked), [2, 2]);
    }));

    test('cells: ::letters and ::words split the text once, keep its markup, and read whole to screen readers', () => chrome.withPage(async page => {
        await page.evaluate(() => document.body.innerHTML = '<h1>Hi, <em>new</em> café 👩‍👩‍👧</h1><p>我们喜欢生成艺术，也喜欢写代码。</p>');
        await mount(page, 'display: inline-block; --i: @i', { seed: 1, cells: 'h1::letters' });
        await mount(page, '--n: @I', { seed: 1, cells: 'h1::words, p::words' });
        let got = await page.evaluate(() => {
            let words = el => [...el.querySelectorAll('[cssd-split=word]')].map(w => w.textContent);
            let letters = [...document.querySelectorAll('h1 [cssd-split=letter]')];
            return {
                h1: words(document.querySelector('h1')),
                p: words(document.querySelector('p')),
                letters: letters.length,
                last: getComputedStyle(letters.at(-1)).getPropertyValue('--i'),
                n: getComputedStyle(document.querySelector('[cssd-split=word]')).getPropertyValue('--n'),
                em: document.querySelector('em [cssd-split=word]').textContent,
                read: [...document.querySelectorAll('h1 [cssd-split=text]')].map(t => t.textContent).join(''),
                hidden: document.querySelector('[cssd-split=run]').getAttribute('aria-hidden'),
            };
        });
        assert.deepEqual(got.h1, ['Hi,', 'new', 'café', '👩‍👩‍👧']);
        assert.ok(got.p.includes('艺术，') && got.p.includes('也'), got.p.join('|'));
        assert.equal(got.letters, 11);
        assert.equal(got.last, '11');
        assert.equal(got.n, String(got.h1.length + got.p.length));
        assert.equal(got.em, 'new');
        assert.equal(got.read, 'Hi, new café 👩‍👩‍👧');
        assert.equal(got.hidden, 'true');
    }));

    test('cells: with ::letters and ::words, :doodle is the element they split', () => chrome.withPage(async page => {
        await page.evaluate(() => document.body.innerHTML = '<h1>Hi <em>new</em> café</h1><p>One two</p>');
        let el = await mount(page, ':doodle { outline: 2px solid; animation: k 1s infinite } @keyframes k { to { opacity: .5 } }', { seed: 1, cells: 'h1::letters' });
        await mount(page, ':doodle { outline: 2px dotted }', { seed: 1, cells: 'p::words' });
        let outlines = () => page.evaluate(() => [...document.querySelectorAll('h1, h1 *, p, p *')]
            .filter(el => getComputedStyle(el).outlineStyle !== 'none').map(el => el.localName));
        assert.deepEqual(await outlines(), ['h1', 'p']);
        await el.evaluate(el => el.pause());
        assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('h1')).animationPlayState), 'paused');
        await el.evaluate(el => el.removeAttribute('cells'));
        assert.deepEqual(await outlines(), ['p']);
    }));

    test('cells: rows and columns come from the page, follow a resize, and @udx measures from each element',() => chrome.withPage(async page => {
        await page.evaluate(() => document.body.innerHTML =
            '<div id="p" style="display:flex;flex-wrap:wrap;width:180px">' + '<i style="width:60px;height:40px"></i>'.repeat(7) + '</div>');
        await mount(page, '--at: @x @y @X @Y; --r: @r(1000); --d: $(@udx) $(@udy);', { seed: 1, cells: 'i' });
        let read = name => page.evaluate(name => [...document.querySelectorAll('i')].map(i => getComputedStyle(i).getPropertyValue(name)), name);
        assert.deepEqual(await read('--at'), ['1 1 3 3', '2 1 3 3', '3 1 3 3', '1 2 3 3', '2 2 3 3', '3 2 3 3', '1 3 3 3']);
        let rolls = await read('--r');

        await page.evaluate(() => document.getElementById('p').style.width = '120px');
        await page.waitForFunction(() => getComputedStyle(document.querySelectorAll('i')[2]).getPropertyValue('--at') === '1 2 2 4');
        assert.deepEqual(await read('--r'), rolls);

        let box = await page.evaluate(() => { let r = document.querySelectorAll('i')[4].getBoundingClientRect(); return [r.x + 30, r.y + 20]; });
        await page.mouse.move(box[0], box[1]);
        await page.waitForTimeout(100);
        let d = await read('--d');
        assert.equal(d[4].replace(/\s/g, ''), 'calc(30-30)calc(100-100)', d[4]);

        await page.evaluate(() => document.getElementById('p').style.width = '180px');
        await page.waitForFunction(() => getComputedStyle(document.querySelectorAll('i')[2]).getPropertyValue('--at') === '3 1 3 3');
    }));

    test('cells: @x is the place in the row, so short words under a wide one still count from the left', () => chrome.withPage(async page => {
        await page.evaluate(() => document.body.innerHTML = '<p style="font:16px/2 monospace;width:12ch;margin:0">Typography is a big deal</p>');
        await mount(page, '--at: @x @y', { seed: 1, cells: 'p::words' });
        let at = await page.evaluate(() => [...document.querySelectorAll('[cssd-split=word]')].map(w => w.textContent + ' ' + getComputedStyle(w).getPropertyValue('--at')));
        assert.deepEqual(at, ['Typography 1 1', 'is 1 2', 'a 2 2', 'big 3 2', 'deal 1 3']);
    }));

    test('cells: rows come from the layout the doodle\'s own styles make, and a layout that keeps moving is let be', () => chrome.withPage(async page => {
        await page.evaluate(() => document.body.innerHTML = '<style>i, b { width: 50px; height: 20px }</style>' +
            '<div id="a" style="display:flex;flex-wrap:wrap;width:180px">' + '<i></i>'.repeat(4) + '</div>' +
            '<div id="b" style="display:flex;flex-wrap:wrap;width:120px">' + '<b></b>'.repeat(2) + '</div>');
        await mount(page, 'width: 80px; --at: @x @y', { seed: 1, cells: '#a i' });
        await page.waitForFunction(() => getComputedStyle(document.querySelectorAll('i')[2]).getPropertyValue('--at') === '1 2');

        let el = await mount(page, '@match(y == 1) { width: 70px }', { seed: 1, cells: '#b b' });
        await page.waitForTimeout(300);
        await el.evaluate(el => {
            el.renders = 0;
            let render = el.render;
            el.render = (...args) => (el.renders++, render.apply(el, args));
        });
        await page.waitForTimeout(400);
        assert.equal(await el.evaluate(el => el.renders), 0);
    }));

    test('cells: a resize that keeps rows and columns draws again only for @udx', () => chrome.withPage(async page => {
        await page.evaluate(() => document.body.innerHTML =
            '<div id="p" style="display:flex;justify-content:center;width:300px">' + '<i style="width:60px;height:40px"></i>'.repeat(3) + '</div>');
        let plain = await mount(page, '--r: @r(1000)', { seed: 1, cells: 'i' });
        await mount(page, '--d: @udx', { seed: 1, cells: 'i' });
        await plain.evaluate(el => {
            el.renders = 0;
            let render = el.render;
            el.render = (...args) => (el.renders++, render.apply(el, args));
        });
        await page.evaluate(() => document.getElementById('p').style.width = '240px');
        await page.waitForFunction(() => getComputedStyle(document.querySelector('i')).getPropertyValue('--d').includes('60'));
        assert.equal(await plain.evaluate(el => el.renders), 0);
    }));

    test('cells: splitting leaves the text nodes of the page in place, so a framework can still change or remove them', () => chrome.withPage(async page => {
        await page.evaluate(() => {
            document.body.innerHTML = '<h1>Hello world</h1>';
            window.text = document.querySelector('h1').firstChild;
        });
        await mount(page, '--i: @i', { seed: 1, cells: 'h1::letters' });
        let letters = () => page.evaluate(() => [...document.querySelectorAll('h1 [cssd-split=letter]')].map(l => l.textContent).join(''));
        assert.equal(await letters(), 'Helloworld');
        assert.deepEqual(await page.evaluate(() => [text.parentNode === document.querySelector('h1'), text.data]), [true, '']);

        await page.evaluate(() => text.data = 'Hi there');
        await page.waitForFunction(() => document.querySelectorAll('h1 [cssd-split=letter]').length === 7);
        assert.equal(await letters(), 'Hithere');
        assert.equal(await page.evaluate(() => getComputedStyle(document.querySelectorAll('h1 [cssd-split=letter]')[6]).getPropertyValue('--i')), '7');

        await page.evaluate(() => text.remove());
        await page.waitForFunction(() => !document.querySelector('h1 [cssd-split]'));
    }));
});
