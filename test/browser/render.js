import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';

import prerender from '../../src/exports/generator/prerender.js';
import image from '../../src/exports/generator/image.js';
import { launch, mount, settle, decode, painted, colorAt, hex, near, difference, within } from './chrome.js';
import cases from './cases.js';

let chrome;
before(async () => chrome = await launch());
after(() => chrome?.close());

// the case drawn by the runtime, as decoded pixels
async function live(page, c) {
    let el = await mount(page, c.code, { seed: c.seed ?? 1 });
    let { png, stable } = await settle(page, el);
    return { el, png, stable, image: await decode(page, png) };
}

// identical code and seed drawn another way must look the same; the
// small allowance is for antialiasing that differs inside an <img>
const SAME = .005;

describe('cases', { concurrency: 4 }, () => {
    for (let c of cases) {
        test(c.name, () => chrome.withPage(async page => {
            let { el, stable, image } = await live(page, c);
            assert.ok(stable, 'the drawing kept changing');
            assert.deepEqual(await el.evaluate(el => el.warnings), c.warnings ?? []);
            if (c.blank) {
                assert.equal(painted(image), 0, 'drew something');
            } else {
                assert.ok(painted(image) > 0, 'drew nothing');
            }
            for (let [x, y, color] of c.probes ?? []) {
                let actual = colorAt(image, x, y);
                assert.ok(near(actual, hex(color)), `${x},${y} is rgb(${actual}), not ${color}`);
            }
        }));
    }
});

// prerender() and image() leave shaders out, so only the other cases
const drawable = cases.filter(c => !c.blank && !/@(shaders|pattern|scene)/.test(c.code));

describe('prerender() paints what the element paints', { concurrency: 4 }, () => {
    for (let c of drawable) {
        test(c.name, async () => {
            let expected = await chrome.withPage(page => live(page, c));
            let { html, needs } = await prerender(c.code, { seed: c.seed ?? 1 });
            assert.deepEqual(needs, []);
            await chrome.withPage(async page => {
                await page.setContent('<style>body{margin:0;background:#fff}</style>' + html);
                let el = await page.$('css-doodle');
                let { png } = await settle(page, el);
                let share = difference(await decode(page, png), expected.image, 0);
                assert.ok(share <= SAME, `without the runtime, ${(share * 100).toFixed(2)}% of pixels differ`);

                // the runtime takes over the prerendered element and redraws it from its source
                let rendered = el.evaluate(el => new Promise(resolve => el.addEventListener('render', () => resolve())));
                await page.addScriptTag({ path: `${chrome.dir}/css-doodle.js` });
                await within(rendered, 10000, 'the runtime did not render it');
                ({ png } = await settle(page, el));
                share = difference(await decode(page, png), expected.image, 0);
                assert.ok(share <= SAME, `once the runtime loads, ${(share * 100).toFixed(2)}% of pixels differ`);
            }, { runtime: false });
        });
    }
});

describe('image() draws what the element draws', { concurrency: 4 }, () => {
    for (let c of drawable) {
        test(c.name, async () => {
            let expected = await chrome.withPage(page => live(page, c));
            let { width, height } = expected.image;
            let { svg, needs, warnings } = await image(c.code, { seed: c.seed ?? 1, width, height });
            assert.deepEqual(needs, []);
            assert.deepEqual(warnings, []);
            await chrome.withPage(async page => {
                await page.setContent('<style>body{margin:0;background:#fff}img{display:block}</style><img>');
                let img = await page.$('img');
                await img.evaluate((img, { svg, width, height }) => new Promise((resolve, reject) => {
                    img.onload = resolve;
                    img.onerror = () => reject(new Error('the svg did not load'));
                    img.width = width;
                    img.height = height;
                    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
                }), { svg, width, height });
                let { png } = await settle(page, img);
                let share = difference(await decode(page, png), expected.image);
                assert.ok(share <= SAME, `${(share * 100).toFixed(2)}% of pixels differ`);
            }, { runtime: false });
        });
    }
});
