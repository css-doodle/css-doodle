import parseGrid from '../parser/parse-grid.js';
import generateCss from '../generator/css.js';

import { FilterHolderStyle } from '../lib/svg.js';
import { removeParens } from '../lib/type.js';
import { utime, UTime } from '../core/uniforms.js';

import { parseCssCached } from './parse-cache.js';
import { createReplacer } from './embedded.js';
import { getBasicStyles, createGrid } from './markup.js';
import { getGoogleFontLink } from './google-font.js';

function escapeText(text) {
    return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;');
}

function escapeAttr(text) {
    return String(text).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

// same input, same token: identical doodles on one page share identical filter defs
function hashId(text) {
    let h = 2166136261;
    for (let i = 0; i < text.length; i++) {
        h = Math.imul(h ^ text.charCodeAt(i), 16777619);
    }
    return 's' + (h >>> 0).toString(36);
}

/*
 * Renders a doodle to HTML with a declarative shadow root, so it paints
 * without the runtime. The source stays in the light DOM, which is not
 * rendered, so a runtime loaded later draws the same picture from it.
 *
 * `needs` lists what only the runtime can do:
 *   shader      @shaders and @pattern images are left out
 *   mouse, size the pointer and size uniforms stay at 0
 *   clock       @T/@TS count from the build time, not the visit
 *   update      click:update / auto:update
 *   transition  the output starts in the final state, no transition on load
 *   variables   a var() in `use` has no value in `options.variables`
 */
export async function prerender(code = '', options = {}) {
    let attributes = { ...options.attributes };
    let variables = options.variables ?? {};
    let seed = options.seed ?? (attributes.seed || attributes['data-seed'] || Date.now());
    attributes.seed = seed;
    delete attributes['data-seed'];

    let needs = new Set();
    let warnings = [];
    let maxGrid = 'experimental' in attributes ? 256 : 64;
    let host = {
        extra: {
            getVariable: name => {
                let value = variables[name];
                if (value === undefined) needs.add('variables');
                return removeParens(String(value ?? '').trim());
            },
            // colors only matter to @pattern, which is left out
            getRgbaColor: () => null,
        },
        getMaxGrid: () => maxGrid,
        report: list => warnings.push(...list),
        hasAttribute: name => name in attributes,
        _clock: { base: 0, since: 0 },
        // nested shader images are skipped as if already drawn
        shaderRenders: { has: () => (needs.add('shader'), true) },
    };

    let use = String(attributes.use ?? '').trim();
    if (/^var\(/.test(use)) {
        use = `@use:${use};`;
    }
    let source = use + code;
    let compiled = generateCss(
        parseCssCached(source, host.extra),
        parseGrid(attributes.grid, maxGrid),
        seed, maxGrid, null, [],
        hashId(JSON.stringify(attributes) + code)
    );
    warnings.unshift(...compiled.warnings);

    let { styles, content, filters, uniforms, shaders, patterns, props } = compiled;
    if (Object.keys(shaders).length || Object.keys(patterns).length) needs.add('shader');
    // uniforms.mouse feeds the shaders, covered by 'shader'
    if (uniforms.mousex || uniforms.mousey) needs.add('mouse');
    if (uniforms.width || uniforms.height) needs.add('size');
    if (props.hasTransition) needs.add('transition');
    if ('click:update' in attributes || 'click-to-update' in attributes || 'auto:update' in attributes) {
        needs.add('update');
    }

    let grid = compiled.grid || parseGrid(attributes.grid, maxGrid);
    let replace = createReplacer(host, { ...compiled, shaders: {}, patterns: {} });
    let sheet = await replace(styles.top + getBasicStyles(grid) + styles.all);
    // nested images keep var() as plain text in their urls
    if (sheet.includes(`var(${UTime})`)) needs.add('clock');

    let shadow = `<style>${sheet.replace(/\n\s+/g, ' ')}</style>`;
    if (styles.cells || styles.container || Object.keys(content).length) {
        shadow += createGrid(grid, compiled);
    }
    let defs = Object.values(filters).join('');
    let light = '';
    if (defs) {
        shadow += `<slot name="ft"></slot><ft style="${FilterHolderStyle}">${defs}</ft>`;
        light = `<ft slot="ft" style="${FilterHolderStyle}">${defs}</ft>`;
    }

    // registered once per document by the runtime; inside a shadow root it is ignored
    let before = '';
    if (uniforms.time) {
        before += `<style>@property ${utime}{syntax:"<integer>";initial-value:0;inherits:true}`
            + `@property ${UTime}{syntax:"<integer>";initial-value:0;inherits:true}</style>`;
    }
    if (styles.gf.length) {
        before += `<link rel="stylesheet" href="${escapeAttr(getGoogleFontLink(styles.gf))}">`;
    }

    let attrs = { role: 'img', ...attributes };
    let attrText = Object.entries(attrs)
        .map(([name, value]) => value === '' || value === true ? ` ${name}` : ` ${name}="${escapeAttr(value)}"`)
        .join('');

    // the source goes first: a runtime already defined reads it before the template arrives
    let html = before + `<css-doodle${attrText}>${escapeText(code)}`
        + `<template shadowrootmode="open">${shadow}</template>${light}</css-doodle>`;

    return { html, seed, needs: [...needs], warnings };
}
