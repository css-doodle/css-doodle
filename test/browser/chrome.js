// Shared by the browser tests: the source tree is bundled into one script
// and drawn by the installed Chrome (`channel: 'chrome'`), so nothing is
// downloaded. macOS draws shaders on the GPU through Metal, anywhere else
// on SwiftShader, which is what a CI runner without a GPU has;
// CSSD_GPU=swiftshader picks it on macOS too, CHROME_PATH another binary.
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { build } from 'esbuild';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export const GPU = process.env.CSSD_GPU || (process.platform === 'darwin' ? 'metal' : 'swiftshader');

const ARGS = {
    metal: ['--use-angle=metal', '--ignore-gpu-blocklist'],
    swiftshader: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
};

// driver chatter that WebGL logs as console warnings and errors
const NOISE = /GL Driver Message|GPU stall|WebGL: too many errors|Automatic fallback to software WebGL/;

export async function launch() {
    let dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cssd-browser-'));
    await build({
        entryPoints: [path.join(root, 'src', 'index.js')],
        bundle: true,
        format: 'iife',
        outfile: path.join(dir, 'css-doodle.js'),
        logLevel: 'warning',
    });
    let head = '<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#fff}</style>';
    fs.writeFileSync(path.join(dir, 'index.html'), head + '<script src="css-doodle.js"></script>');
    fs.writeFileSync(path.join(dir, 'bare.html'), head);
    let browser = await chromium.launch({
        channel: process.env.CHROME_PATH ? undefined : 'chrome',
        executablePath: process.env.CHROME_PATH,
        args: ARGS[GPU],
    });
    return {
        browser,
        dir,
        // a page with the runtime loaded, or a bare one with `runtime: false`
        async page({ runtime = true, ...options } = {}) {
            let page = await browser.newPage({ viewport: { width: 400, height: 400 }, deviceScaleFactor: 1, ...options });
            page.errors = [];
            page.on('pageerror', e => page.errors.push(e.message));
            page.on('console', m => {
                if (m.type() === 'error' && !NOISE.test(m.text())) page.errors.push(m.text());
            });
            await page.goto(`file://${dir}/${runtime ? 'index' : 'bare'}.html`);
            return page;
        },
        // a fresh page for fn, which must raise no errors on it
        async withPage(fn, options) {
            let page = await this.page(options);
            try {
                let result = await fn(page);
                assert.deepEqual(page.errors, []);
                return result;
            } finally {
                await page.close();
            }
        },
        async close() {
            await browser.close();
            fs.rmSync(dir, { recursive: true, force: true });
        },
    };
}

// appends a <css-doodle> and resolves once its first render lands;
// its `warn` events are kept on the element as `warnings`
export async function mount(page, code, attributes = { seed: 1 }, parent = 'body') {
    let handle = await page.evaluateHandle(({ code, attributes, parent }) => {
        let el = document.createElement('css-doodle');
        for (let [name, value] of Object.entries(attributes)) el.setAttribute(name, value);
        el.warnings = [];
        el.addEventListener('warn', e => el.warnings.push(e.detail.message));
        el.rendered = new Promise(resolve => el.addEventListener('render', resolve, { once: true }));
        el.textContent = code;
        document.querySelector(parent).append(el);
        return el;
    }, { code, attributes, parent });
    await within(handle.evaluate(el => el.rendered), 10000, 'no render event');
    return handle;
}

export function within(promise, ms, message) {
    let timer;
    return Promise.race([
        promise,
        new Promise((_, reject) => timer = setTimeout(() => reject(new Error(message)), ms)),
    ]).finally(() => clearTimeout(timer));
}

export const frames = (page, n = 2) => page.evaluate(n => new Promise(resolve => {
    let step = () => --n < 0 ? resolve() : requestAnimationFrame(step);
    step();
}), n);

// screenshots until two in a row match: images and shader frames land
// after the render event; `stable` is false if they never stopped changing
export async function settle(page, target = page, { timeout = 10000, interval = 150 } = {}) {
    await frames(page);
    let last = await target.screenshot();
    for (let start = Date.now(); Date.now() - start < timeout;) {
        await page.waitForTimeout(interval);
        let png = await target.screenshot();
        if (png.equals(last)) return { png, stable: true };
        last = png;
    }
    return { png: last, stable: false };
}

export async function decode(page, png) {
    let { width, height, data } = await page.evaluate(async base64 => {
        let blob = await (await fetch('data:image/png;base64,' + base64)).blob();
        let bitmap = await createImageBitmap(blob);
        let { width, height } = bitmap;
        let ctx = new OffscreenCanvas(width, height).getContext('2d');
        ctx.drawImage(bitmap, 0, 0);
        let bytes = ctx.getImageData(0, 0, width, height).data;
        let text = '';
        for (let i = 0; i < bytes.length; i += 0x8000) {
            text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        }
        return { width, height, data: btoa(text) };
    }, png.toString('base64'));
    return { width, height, data: Buffer.from(data, 'base64') };
}

export function colorAt(image, x, y) {
    let i = (y * image.width + x) * 4;
    return [...image.data.subarray(i, i + 3)];
}

export function hex(color) {
    if (color.length === 4) color = color.replace(/\w/g, '$&$&');
    let n = parseInt(color.slice(1), 16);
    return [n >> 16, (n >> 8) & 255, n & 255];
}

export const near = (a, b, tolerance = 48) => a.every((v, i) => Math.abs(v - b[i]) <= tolerance);

// pixels that are not the white page
export function painted(image) {
    let n = 0;
    for (let i = 0; i < image.data.length; i += 4) {
        if (image.data[i] < 250 || image.data[i + 1] < 250 || image.data[i + 2] < 250) n++;
    }
    return n;
}

// the share of pixels whose channels differ by more than `tolerance`
export function difference(a, b, tolerance = 24) {
    if (a.width !== b.width || a.height !== b.height) return 1;
    let n = 0;
    for (let i = 0; i < a.data.length; i += 4) {
        if (Math.abs(a.data[i] - b.data[i]) > tolerance
            || Math.abs(a.data[i + 1] - b.data[i + 1]) > tolerance
            || Math.abs(a.data[i + 2] - b.data[i + 2]) > tolerance) n++;
    }
    return n / (a.width * a.height);
}
