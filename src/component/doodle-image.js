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

export function frameSvg(svg, width, height) {
    let w = parseFloat(width);
    let h = parseFloat(height);
    let inner = svgUrl(svg.replace(/^(<svg[^>]*?) viewBox="[^"]*"/, '$1'));
    return `<svg width="${width}" height="${height}" ${NS} preserveAspectRatio="none" viewBox="0 0 ${w} ${h}">`
        + `<image width="${w}" height="${h}" preserveAspectRatio="none" href="${inner}"/></svg>`;
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

const renders = new WeakMap();

export async function doodleToImage(host, code, options) {
    code = ':doodle {width:100%;height:100%}' + code;
    let baseGrid = parseGrid('');
    let source = options.compiled ?? host.compiled;
    let cache = renders.get(source);
    if (!cache) {
        renders.set(source, cache = { composed: new Map(), urls: new Map() });
    }
    let key = options.instance + code;
    let compiled = cache.composed.get(key);
    if (!compiled) {
        let parsed = parseCssCached(code, host.extra);
        compiled = generateCss(parsed, baseGrid, source.seed, host.getMaxGrid(), source.random, options.upextra, options.instance);
        cache.composed.set(key, compiled);
        host.report(compiled.warnings);
    }
    let styles = compiled.styles;
    let grid = compiled.grid || baseGrid;

    let viewBox = '';
    let { width, height } = options;
    if (options.arg) {
        let v = parseGrid(options.arg, Infinity);
        width = v.x + 'px';
        height = v.y + 'px';
        viewBox = `viewBox="0 0 ${v.x} ${v.y}"`;
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
                    <div class="host" ${NSXHtml}>
                        <style>${cdata(sheet)}</style>
                        ${markup}
                    </div>
                </foreignObject>
            </svg>
        `);
        let last = cache.urls.get(key);
        if (last?.svg !== svg) {
            cache.urls.set(key, last = { svg, url: (host.draw?.url ?? svgUrl)(svg, width, height) });
        }
        return last.url;
    } catch (err) {
        console.error(err);
        return '';
    }
}
