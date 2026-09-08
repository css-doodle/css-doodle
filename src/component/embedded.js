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


const sharedUrls = new WeakMap();

function revokeUrls(entry) {
    for (let url of entry.urls.values()) {
        Promise.resolve(url).then(url => {
            if (/^blob:/.test(url)) URL.revokeObjectURL(url);
        });
    }
}

// the blob urls of the nested images belong to one generation
export function releaseSharedImages(host) {
    let entry = sharedUrls.get(host);
    if (entry) {
        revokeUrls(entry);
        sharedUrls.delete(host);
    }
}

function sharedImage(host, svg, toUrl) {
    let entry = sharedUrls.get(host);
    if (!entry || entry.generation !== host._generation) {
        releaseSharedImages(host);
        sharedUrls.set(host, entry = { generation: host._generation, urls: new Map() });
    }
    let url = entry.urls.get(svg);
    if (url === undefined) {
        entry.urls.set(svg, url = toUrl());
    }
    return url;
}

export function createReplacer(host, { doodles, shaders, patterns }) {
    // each group resolves with the text that takes the place of its placeholder
    const groups = [
        [doodles, (id, v, done) => doodleToImage(host, v.doodle,
            { arg: v.arg, upextra: v.upextra, instance: id }, url => done(`url(${url})`))],
        [shaders, (id, v, done) => shaderToImage(host, v, () => done(`var(--${id})`))],
        [patterns, (id, v, done) => patternToImage(host, v, () => done(`var(--${id})`))],
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
                    tasks.push(new Promise(resolve => {
                        toImage(id, value, text => resolve([id, text]));
                    }));
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

export function doodleToImage(host, code, options, fn) {
    code = ':doodle {width:100%;height:100%}' + code;
    let parsed = parseCssCached(code, host.extra);
    let _grid = parseGrid('');
    let compiled = generateCss(parsed, _grid, host.compiled.seed, host.getMaxGrid(), host.compiled.random, options.upextra, options.instance);
    host.report(compiled.warnings);
    let styles = compiled.styles;
    let grid = compiled.grid || _grid;

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

    let replace = createReplacer(host, compiled);
    let gridContainer = createGrid(grid, compiled);
    let filterDefs = Object.values(compiled.filters).join('');
    if (filterDefs) {
        filterDefs = `<div style="${FilterHolderStyle}">${filterDefs}</div>`;
    }

    let size = (width && height)
        ? `width="${width}" height="${height}"`
        : '';

    loadGoogleFontEmbed(styles.gf)
        .then(importedFonts => {
            let sheet = stampSheet(host, importedFonts + styles.top + `
                @property ${utime} { syntax: "<integer>"; initial-value: 0; inherits: true; }
                @property ${UTime} { syntax: "<integer>"; initial-value: 0; inherits: true; }
            ` + getBasicStyles(grid) + styles.all);
            return replace(css`
                <svg ${size} ${NS} preserveAspectRatio="none" ${viewBox}>
                    <foreignObject width="100%" height="100%">
                        <div class="host" width="100%" height="100%" ${NSXHtml}>
                            <style><![CDATA[${sheet}]]></style>
                            ${gridContainer}
                            ${filterDefs}
                        </div>
                    </foreignObject>
                </svg>
            `);
        })
        .then(result => sharedImage(host, result, () => {
            let source = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(result)))}`;
            if (isSafari() && size) {
                return generatePng(result, parseInt(width), parseInt(height), devicePixelRatio || 2)
                    .then(({ blob }) => {
                        let url = URL.createObjectURL(blob);
                        cacheImage(url);
                        return url;
                    });
            }
            if (isSafari()) {
                cacheImage(source);
            }
            return source;
        }))
        .then(fn)
        .catch(err => {
            console.error(err);
            fn('');
        });
}

export function patternToImage(host, { source, cell, id, arg, target }, fn) {
    let shader = generatePattern(source, host.extra);
    shaderToImage(host, { source: shader, cell, id, arg, target }, fn);
}

export function shaderToImage(host, { source, cell, id, arg, target }, fn) {
    let element;
    if (target.selector === ':host') {
        element = host;
    } else if (target.selector === ':container') {
        element = host.shadowRoot.querySelector('grid');
    } else {
        element = host.doodle.getElementById(cell);
    }

    let cs = arg ? parseGrid(arg, Infinity) : null;

    // the drawing size, capped by the size argument when it has one
    const measure = () => {
        let { width, height } = element.getBoundingClientRect();
        if (cs && cs.x && cs.y) {
            width = Math.min(cs.x, width);
            height = Math.min(cs.y, height);
        }
        return { width, height };
    }

    let { width, height } = measure();

    let seed = host.seed;
    let generation = host._generation;
    let parsed = typeof source === 'string' ? parseShaders(source) : { ...source };

    let sources = parsed.textures;
    let textures = [];
    let ready = false;
    let lastW = 0, lastH = 0;

    const setShaderProp = v => {
        host.style.setProperty(id, 'url("' + v + '")');
    }

    const onLost = () => {
        host.report([{ message: 'WebGL context lost' }]);
    }

    const tick = drawing => {
        if (host._generation !== generation) {
            drawing.dispose();
            return;
        }
        let existing = host.shaderRenders.get(target.selector);
        if (existing) {
            existing.dispose();
            host.shaderRenders.delete(target.selector);
        }

        drawing.draw(0, width, height, host._umouse, textures);
        lastW = width;
        lastH = height;
        ready = true;

        if (drawing.animated) {
            // a new loop starts in the host's current state
            const animate = fn => {
                let animation = createAnimation(fn);
                if (host._offscreen || host.hasAttribute('cssd-paused')) {
                    animation.pause();
                }
                host.animations.push(animation);
            }
            if (target.type === 'content') {
                // the WebGL canvas is shared, so the cell shows a copy of each frame
                let view = document.createElement('canvas');
                let ctx = view.getContext('2d');
                ctx.globalCompositeOperation = 'copy';
                const blit = () => {
                    let { canvas } = drawing;
                    if (view.width !== canvas.width || view.height !== canvas.height) {
                        view.width = canvas.width;
                        view.height = canvas.height;
                        ctx.globalCompositeOperation = 'copy';
                    }
                    ctx.drawImage(canvas, 0, 0);
                }
                blit();
                element.replaceChildren(view);
                animate(t => {
                    drawing.draw(t, width, height, host._umouse, textures);
                    blit();
                });
            } else {
                animate(t => {
                    drawing.draw(t, width, height, host._umouse, textures);
                    setShaderProp(drawing.canvas.toDataURL());
                });
            }
            host.shaderRenders.set(target.selector, drawing);
        } else {
            let dataUrl = drawing.canvas.toDataURL();
            if (target.type === 'content') {
                let img = new Image();
                img.style.cssText = 'position:absolute;width:100%;height:100%;object-fit:cover';
                img.src = dataUrl;
                element.replaceChildren(img);
            } else {
                setShaderProp(dataUrl);
            }
            drawing.dispose();
        }
    }

    const transform = (sources, cb) => {
        let dpr = devicePixelRatio || 1;
        Promise.all(sources.map(({ name, value }) => {
            return new Promise(resolve => {
                doodleToImage(host, value, { width, height, instance: `${id.slice(2)}-${name}` }, src => {
                    if (!src) {
                        resolve({ name, value: null });
                        return;
                    }
                    let img = new Image();
                    img.width = width * dpr;
                    img.height = height * dpr;
                    img.onload = () => resolve({ name, value: img });
                    img.onerror = () => resolve({ name, value: null });
                    img.src = src;
                });
            });
        })).then(cb);
    }

    const draw = after => {
        parsed.textures = textures;
        parsed.width = width;
        parsed.height = height;
        try {
            tick(generateShaders(parsed, seed, cell, onLost));
        } catch (err) {
            console.error(err);
        }
        if (after) after();
    }

    const run = after => {
        if (sources.length) {
            transform(sources, result => {
                textures = result;
                draw(after);
            });
        } else {
            draw(after);
        }
    }

    if (!host.observers.has(target.selector)) {
        let observer = new ResizeObserver(debounce(() => {
            if (!ready || host.observers.get(target.selector) !== observer) return;
            let size = measure();
            width = size.width;
            height = size.height;
            if (width === lastW && height === lastH) return;
            lastW = width;
            lastH = height;
            let live = host.shaderRenders.get(target.selector);
            if (live && live.animated) {
                transform(sources, result => { textures = result; });
            } else {
                run();
            }
        }));
        observer.observe(element);
        host.observers.set(target.selector, observer);
    }

    run(fn);
}
