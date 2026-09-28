import parseGrid from '../parser/parse-grid.js';
import generateCss from '../generator/css.js';

import { NS, NSXHtml, FilterHolderStyle, cdata } from '../lib/svg.js';
import { utime, UTime } from '../core/uniforms.js';
import { RE_PLACEHOLDER } from '../lib/placeholder.js';
import { css } from '../lib/tagged-template.js';
import { loadGoogleFontEmbed } from './google-font.js';

import { stampSheet, stampSmil, smilTick, TRANSITION_NONE } from './clock.js';
import { parseCssCached } from './parse-cache.js';
import { getBasicStyles, createGrid } from './markup.js';

const RE_URL_ESCAPE = /[\n\r"#%:<>\\]/g;

export function svgUrl(svg) {
    return 'data:image/svg+xml,' + svg.replace(RE_URL_ESCAPE, encodeURIComponent);
}

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

export function createReplacer(host, compiled) {
    const { doodles, shaders, patterns } = compiled;
    const unset = () => Promise.resolve();
    const { shader = unset, pattern = unset } = host.draw ?? {};
    const groups = [
        [doodles, (id, v) => doodleToImage(host, v.doodle, { arg: v.arg, upextra: v.upextra, instance: id, compiled })
            .then(url => `url("${url}")`)],
        [shaders, (id, v) => shader(host, { ...v, compiled }).then(() => `var(--${id})`)],
        [patterns, (id, v) => pattern(host, { ...v, compiled }).then(() => `var(--${id})`)],
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

// a nested doodle composes once for the render that asked for it: a restamp
// for the clock rebuilds the image but must not draw from the stream again
const composedDoodles = new WeakMap();

export async function doodleToImage(host, code, options) {
    code = ':doodle {width:100%;height:100%}' + code;
    let baseGrid = parseGrid('');
    let source = options.compiled ?? host.compiled;
    let composed = composedDoodles.get(source);
    if (!composed) {
        composedDoodles.set(source, composed = new Map());
    }
    let key = options.instance + code;
    let compiled = composed.get(key);
    if (!compiled) {
        let parsed = parseCssCached(code, host.extra);
        compiled = generateCss(parsed, baseGrid, source.seed, host.getMaxGrid(), source.random, options.upextra, options.instance);
        composed.set(key, compiled);
        host.report(compiled.warnings);
    }
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
        let sheet = stampSheet(host, fonts + styles.top + css`
            @property ${utime} { syntax: "<integer>"; initial-value: 0; inherits: true; }
            @property ${UTime} { syntax: "<integer>"; initial-value: 0; inherits: true; }
        ` + getBasicStyles(grid) + styles.all) + TRANSITION_NONE;
        let markup = stampSmil(host, createGrid(grid, compiled) + filterDefs);
        let svg = await createReplacer(host, compiled)(css`
            <svg ${size} ${NS} preserveAspectRatio="none" ${viewBox}>
                ${smilTick(sheet)}
                <foreignObject width="100%" height="100%">
                    <div class="host" width="100%" height="100%" ${NSXHtml}>
                        <style>${cdata(sheet)}</style>
                        ${markup}
                    </div>
                </foreignObject>
            </svg>
        `);
        return await sharedImage(host, svg, () => (host.draw?.url ?? svgUrl)(svg, width, height));
    } catch (err) {
        console.error(err);
        return '';
    }
}
