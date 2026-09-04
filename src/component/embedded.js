import parseGrid from '../parser/parse-grid.js';
import parseShaders from '../parser/parse-shaders.js';

import generateCss from '../generator/css.js';
import generateShaders from '../generator/shaders.js';
import generatePattern from '../generator/pattern.js';
import generatePng from '../generator/svg-to-png.js';

import createAnimation from './animation.js';
import { NS, NSXHtml, FilterHolderStyle } from '../utils/svg.js';
import { utime, UTime } from '../core/uniforms.js';
import { cacheImage, isSafari } from '../utils/browser.js';
import { debounce } from '../utils/fn.js';
import { css } from '../utils/tagged-template.js';
import { loadGoogleFontEmbed } from './google-font.js';

import { parseCssCached } from './parse-cache.js';
import { getBasicStyles, createGrid } from './markup.js';

const RE_PLACEHOLDER = /\$\{([^}]*)\}/g;

const images = new WeakMap();

function sharedImage(host, svg, toUrl) {
    let entry = images.get(host);
    if (!entry || entry.generation !== host._generation) {
        images.set(host, entry = { generation: host._generation, urls: new Map() });
    }
    let url = entry.urls.get(svg);
    if (url === undefined) {
        entry.urls.set(svg, url = toUrl());
    }
    return url;
}

export function createReplacer(host, { doodles, shaders, pattern }) {
    const groups = [
        [doodles, (id, v, fn) => doodleToImage(host, v.doodle, { arg: v.arg, upextra: v.upextra, instance: id }, fn)],
        [shaders, (id, v, fn) => shaderToImage(host, v, fn)],
        [pattern, (id, v, fn) => patternToImage(host, v, fn)],
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
                        toImage(id, value, result => resolve({ id, result }));
                    }));
                }
            }
        }
        if (!tasks.length) {
            return Promise.resolve(input);
        }
        return Promise.all(tasks).then(mappings => {
            let targets = new Map();
            for (let { id, result } of mappings) {
                targets.set(id, /^(shader|pattern)/.test(id) ? `var(--${id})` : `url(${result})`);
            }
            return input.replace(RE_PLACEHOLDER, (m, id) => targets.get(id) ?? m);
        }).catch(err => {
            console.error(err);
            return input;
        });
    }
}

export function doodleToImage(host, code, options, fn) {
    if (typeof options === 'function') {
        fn = options;
        options = null;
    }
    options = options || {};
    code = ':doodle {width:100%;height:100%}' + code;
    let parsed = parseCssCached(code, host.extra);
    let _grid = parseGrid('');
    let compiled = generateCss(parsed, _grid, host._seed_value, host.getMaxGrid(), host._seed_random, options.upextra, options.instance);
    host.report(compiled.warnings);
    let styles = compiled.styles || {};
    let grid = compiled.grid ? compiled.grid : _grid;
    let viewBox = '';
    if (options.arg) {
        let v = parseGrid(options.arg, Infinity);
        if (v.x && v.y) {
            options.width = v.x + 'px';
            options.height = v.y + 'px';
            viewBox = `viewBox="0 0 ${v.x} ${v.y}"`;
        }
    }

    let replace = createReplacer(host, compiled);
    let gridContainer = createGrid(grid, compiled);
    let filterDefs = Object.values(compiled.filters).join('');
    if (filterDefs) {
        filterDefs = `<div style="${FilterHolderStyle}">${filterDefs}</div>`;
    }

    let size = (options.width && options.height)
        ? `width="${options.width}" height="${options.height}"`
        : '';

    loadGoogleFontEmbed(styles.gf || [])
        .then(importedFonts => replace(css`
            <svg ${size} ${NS} preserveAspectRatio="none" ${viewBox}>
                <foreignObject width="100%" height="100%">
                    <div class="host" width="100%" height="100%" ${NSXHtml}>
                        <style><![CDATA[
                            ${importedFonts}
                            ${styles.top}
                            @property --${utime.name} { syntax: "<integer>"; initial-value: 0; inherits: true; }
                            @property --${UTime.name} { syntax: "<integer>"; initial-value: 0; inherits: true; }
                            ${getBasicStyles(grid)}
                            ${styles.all}
                        ]]></style>
                        ${gridContainer}
                        ${filterDefs}
                    </div>
                </foreignObject>
            </svg>
        `))
        .then(result => sharedImage(host, result, () => {
            let source = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(result)))}`;
            if (isSafari() && size) {
                return generatePng(result, parseInt(options.width), parseInt(options.height), devicePixelRatio || 2)
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

export function patternToImage(host, { code, cell, id, arg, target }, fn) {
    let shader = generatePattern(code, host.extra);
    shaderToImage(host, { shader, cell, id, arg, target }, fn);
}

export function shaderToImage(host, { shader, cell, id, arg, target }, fn) {
    let element;
    if (target.selector === ':host') {
        element = host;
    } else if (target.selector === ':container') {
        element = host.shadowRoot.querySelector('grid');
    } else {
        element = host.doodle.getElementById(cell);
    }

    let { width, height } = element.getBoundingClientRect();
    let cs;

    if (arg) {
        cs = parseGrid(arg, Infinity);
        if (cs.x && cs.y) {
            width = Math.min(cs.x, width);
            height = Math.min(cs.y, height);
        }
    }

    let seed = host.seed;
    let generation = host._generation;
    let parsed = typeof shader === 'string' ? parseShaders(shader) : shader;
    parsed.width = width;
    parsed.height = height;

    let sources = parsed.textures;
    let images = [];
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

        drawing.draw(0, width, height, host._umouse, images);
        lastW = width;
        lastH = height;
        ready = true;

        if (drawing.animated) {
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
                host.animations.push(createAnimation(t => {
                    drawing.draw(t, width, height, host._umouse, images);
                    blit();
                }));
            } else {
                host.animations.push(createAnimation(t => {
                    drawing.draw(t, width, height, host._umouse, images);
                    setShaderProp(drawing.canvas.toDataURL());
                }));
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
        parsed.textures = images;
        parsed.width = width;
        parsed.height = height;
        try {
            tick(generateShaders(parsed, seed, cell, onLost));
            if (after) after();
        } catch (err) {
            console.error(err);
            if (after) after('');
        }
    }

    const run = after => {
        if (sources.length) {
            transform(sources, result => {
                images = result;
                draw(after);
            });
        } else {
            draw(after);
        }
    }

    if (!host.observers.has(target.selector)) {
        let observer = new ResizeObserver(debounce(() => {
            if (!ready || host.observers.get(target.selector) !== observer) return;
            let rect = element.getBoundingClientRect();
            width = rect.width;
            height = rect.height;
            if (cs && cs.x && cs.y) {
                width = Math.min(cs.x, width);
                height = Math.min(cs.y, height);
            }
            if (width === lastW && height === lastH) return;
            lastW = width;
            lastH = height;
            let live = host.shaderRenders.get(target.selector);
            if (live && live.animated) {
                transform(sources, result => { images = result; });
            } else {
                run();
            }
        }));
        observer.observe(element);
        host.observers.set(target.selector, observer);
    }

    run(fn);
}
