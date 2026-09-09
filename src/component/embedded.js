import parseGrid from '../parser/parse-grid.js';
import parseShaders from '../parser/parse-shaders.js';

import generateCss from '../generator/css.js';
import generateShaders from '../generator/shaders.js';
import generatePattern from '../generator/pattern.js';
import generatePng from '../generator/svg-to-png.js';

import createAnimation from './animation.js';
import { NS, NSXHtml, FilterHolderStyle } from '../lib/svg.js';
import { utime, UTime } from '../core/uniforms.js';
import { cacheImage, isSafari } from '../lib/browser.js';
import { debounce } from '../lib/fn.js';
import { RE_PLACEHOLDER } from '../lib/placeholder.js';
import { css } from '../lib/tagged-template.js';
import { loadGoogleFontEmbed } from './google-font.js';

import { stampSheet } from './clock.js';
import { parseCssCached } from './parse-cache.js';
import { getBasicStyles, createGrid } from './markup.js';


// cells that produce the same nested doodle svg share one image url
const sharedUrls = new WeakMap();

export function releaseSharedImages(host) {
    let urls = sharedUrls.get(host);
    if (!urls) return;
    sharedUrls.delete(host);
    for (let url of urls.values()) {
        Promise.resolve(url).then(url => {
            if (url.startsWith('blob:')) URL.revokeObjectURL(url);
        }, () => {});
    }
}

function sharedImage(host, svg, toUrl) {
    let urls = sharedUrls.get(host);
    if (!urls) {
        sharedUrls.set(host, urls = new Map());
    }
    let url = urls.get(svg);
    if (url === undefined) {
        urls.set(svg, url = toUrl());
    }
    return url;
}

export function createReplacer(host, { doodles, shaders, patterns }) {
    // each group resolves with the text that takes the place of its placeholder
    const groups = [
        [doodles, (id, v) => doodleToImage(host, v.doodle, { arg: v.arg, upextra: v.upextra, instance: id })
            .then(url => `url(${url})`)],
        [shaders, (id, v) => shaderToImage(host, v).then(() => `var(--${id})`)],
        [patterns, (id, v) => patternToImage(host, v).then(() => `var(--${id})`)],
    ];
    return input => {
        let present = new Set();
        for (let [, id] of input.matchAll(RE_PLACEHOLDER)) {
            present.add(id);
        }
        let tasks = [];
        for (let [map, toImage] of groups) {
            for (let [id, value] of Object.entries(map)) {
                if (present.has(id)) {
                    tasks.push(toImage(id, value).then(text => [id, text]));
                }
            }
        }
        if (!tasks.length) {
            return Promise.resolve(input);
        }
        return Promise.all(tasks).then(mappings => {
            let targets = new Map(mappings);
            return input.replace(RE_PLACEHOLDER, (m, id) => targets.get(id) ?? m);
        }).catch(err => {
            console.error(err);
            return input;
        });
    }
}

export async function doodleToImage(host, code, options) {
    code = ':doodle {width:100%;height:100%}' + code;
    let parsed = parseCssCached(code, host.extra);
    let baseGrid = parseGrid('');
    let compiled = generateCss(parsed, baseGrid, host.compiled.seed, host.getMaxGrid(), host.compiled.random, options.upextra, options.instance);
    host.report(compiled.warnings);
    let styles = compiled.styles;
    let grid = compiled.grid || baseGrid;

    let viewBox = '';
    let { width, height } = options;
    if (options.arg) {
        let v = parseGrid(options.arg, Infinity);
        if (v.x && v.y) {
            width = v.x + 'px';
            height = v.y + 'px';
            viewBox = `viewBox="0 0 ${v.x} ${v.y}"`;
        }
    }
    let size = (width && height)
        ? `width="${width}" height="${height}"`
        : '';

    let filterDefs = Object.values(compiled.filters).join('');
    if (filterDefs) {
        filterDefs = `<div style="${FilterHolderStyle}">${filterDefs}</div>`;
    }

    try {
        let fonts = await loadGoogleFontEmbed(styles.gf);
        let sheet = stampSheet(host, fonts + styles.top + `
            @property ${utime} { syntax: "<integer>"; initial-value: 0; inherits: true; }
            @property ${UTime} { syntax: "<integer>"; initial-value: 0; inherits: true; }
        ` + getBasicStyles(grid) + styles.all);
        let svg = await createReplacer(host, compiled)(css`
            <svg ${size} ${NS} preserveAspectRatio="none" ${viewBox}>
                <foreignObject width="100%" height="100%">
                    <div class="host" width="100%" height="100%" ${NSXHtml}>
                        <style><![CDATA[${sheet}]]></style>
                        ${createGrid(grid, compiled)}
                        ${filterDefs}
                    </div>
                </foreignObject>
            </svg>
        `);
        return await sharedImage(host, svg, () => {
            let source = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
            if (!isSafari()) {
                return source;
            }
            if (!size) {
                cacheImage(source);
                return source;
            }
            return generatePng(svg, parseInt(width), parseInt(height), devicePixelRatio || 2)
                .then(({ blob }) => {
                    let url = URL.createObjectURL(blob);
                    cacheImage(url);
                    return url;
                });
        });
    } catch (err) {
        console.error(err);
        return '';
    }
}

export function patternToImage(host, pattern) {
    let source = generatePattern(pattern.source, host.extra, message => host.report([{ message }]));
    return shaderToImage(host, { ...pattern, source });
}

export async function shaderToImage(host, { source, cell, id, arg, target }) {
    // restamping the sheet resolves its placeholders again; a rendered shader stays
    if (host.shaderRenders.has(id)) return;
    let element;
    if (target.selector === ':host') {
        element = host;
    } else if (target.selector === ':container') {
        element = host.shadowRoot.querySelector('grid');
    } else {
        element = host.doodle.getElementById(cell);
    }

    // the drawing size, capped by the size argument when it has one
    let cap = arg ? parseGrid(arg, Infinity) : null;
    const measure = () => {
        let { width, height } = element.getBoundingClientRect();
        if (cap && cap.x && cap.y) {
            width = Math.min(cap.x, width);
            height = Math.min(cap.y, height);
        }
        return { width, height };
    }

    let { width, height } = measure();
    let generation = host._generation;
    let parsed = typeof source === 'string' ? parseShaders(source) : source;
    let textures = [];

    const tick = drawing => {
        if (host._generation !== generation) {
            drawing.dispose();
            return;
        }
        drawing.draw(0, width, height, host._umouse, textures);

        let present;
        if (target.type === 'content') {
            // the WebGL canvas is shared, so the cell keeps a copy of each frame
            let view = document.createElement('canvas');
            let ctx = view.getContext('2d');
            element.replaceChildren(view);
            present = () => {
                let { canvas } = drawing;
                if (view.width !== canvas.width || view.height !== canvas.height) {
                    view.width = canvas.width;
                    view.height = canvas.height;
                }
                // resizing resets the context, so this is set per frame
                ctx.globalCompositeOperation = 'copy';
                ctx.drawImage(canvas, 0, 0);
            }
        } else {
            present = () => host.style.setProperty(id, `url("${drawing.canvas.toDataURL()}")`);
        }

        present();

        if (drawing.animated) {
            // a new loop starts in the host's current state
            let animation = createAnimation(t => {
                drawing.draw(t, width, height, host._umouse, textures);
                present();
            });
            if (host._offscreen || host.hasAttribute('cssd-paused')) {
                animation.pause();
            }
            host.animations.push(animation);
        } else {
            drawing.dispose();
        }
        host.shaderRenders.set(id, drawing);

        if (!host.observers.has(id)) {
            watch();
        }
    }

    // the texture doodles, rendered at the drawing size
    const loadTextures = () => {
        let dpr = devicePixelRatio || 1;
        return Promise.all(parsed.textures.map(({ name, value }) => {
            let options = { width, height, instance: `${id.slice(2)}-${name}` };
            return doodleToImage(host, value, options).then(src => new Promise(resolve => {
                if (!src) {
                    return resolve({ name, value: null });
                }
                let img = new Image();
                img.width = width * dpr;
                img.height = height * dpr;
                img.onload = () => resolve({ name, value: img });
                img.onerror = () => resolve({ name, value: null });
                img.src = src;
            }));
        }));
    }

    const render = async () => {
        if (parsed.textures.length) {
            textures = await loadTextures();
        }
        try {
            tick(generateShaders({ ...parsed, textures, width, height }, host.seed, cell, () => {
                host.report([{ message: 'WebGL context lost' }]);
            }));
        } catch (err) {
            console.error(err);
        }
    }

    // a size change redraws; a running loop only needs its textures refreshed
    const watch = () => {
        let observer = new ResizeObserver(debounce(() => {
            if (host.observers.get(id) !== observer) return;
            let size = measure();
            if (size.width === width && size.height === height) return;
            width = size.width;
            height = size.height;
            if (host.shaderRenders.get(id).animated) {
                loadTextures().then(result => { textures = result; });
            } else {
                render();
            }
        }));
        observer.observe(element);
        host.observers.set(id, observer);
    }

    await render();
}
