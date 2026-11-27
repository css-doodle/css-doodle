import parseGrid from '../../parser/parse-grid.js';
import generateCss from '../../generator/css.js';

import { FilterHolderStyle } from '../../lib/svg.js';
import { removeParens, hasEntries } from '../../lib/type.js';
import { hash } from '../../lib/math.js';
import { UTime } from '../../core/uniforms.js';

import parseCss from '../../parser/parse-css.js';
import { createReplacer, svgUrl, frameSvg } from '../../component/doodle-image.js';
import { isAnimatedSvg } from '../../component/clock.js';
import { getBasicStyles, createGrid } from '../../component/markup.js';
import { getGoogleFontLink } from '../../component/google-font.js';

function escapeText(text) {
    return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;');
}

function escapeAttr(text) {
    return String(text).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

function dropStrayTemplateEnds(html) {
    let depth = 0;
    return html.replace(/<(\/?)template(?=[\s/>])[^>]*>/gi, (tag, end) => {
        if (!end) return depth++, tag;
        return depth ? (depth--, tag) : '';
    });
}

export default async function prerender(code = '', options = {}) {
    let attributes = { ...options.attributes };
    let variables = options.variables ?? {};
    let seed = options.seed ?? (attributes.seed || hash(JSON.stringify(attributes) + code));
    attributes.seed = seed;

    let needs = new Set();
    let warnings = [];
    let maxGrid = 'experimental' in attributes ? 256 : 64;
    let skip = () => (needs.add('shader'), Promise.resolve());
    let url = (svg, width, height) => {
        if (!(width && height)) return svgUrl(svg);
        if (isAnimatedSvg(svg)) {
            needs.add('safari');
            return svgUrl(svg);
        }
        return svgUrl(frameSvg(svg, width, height));
    };
    let host = {
        extra: {
            getVariable: name => {
                let value = variables[name];
                if (value === undefined) needs.add('variables');
                return removeParens(String(value ?? '').trim());
            },
            getRgbaColor: () => void needs.add('color'),
        },
        getMaxGrid: () => maxGrid,
        report: list => warnings.push(...list),
        hasAttribute: name => name in attributes,
        clockNow: () => 0,
        _clock: { base: 0 },
        draw: { pattern: skip, url },
    };

    let use = String(attributes.use ?? '').trim();
    if (/^var\(/.test(use)) {
        use = `@use:${use};`;
    }
    let source = use + code;
    let grid = parseGrid(attributes.grid, maxGrid);
    let compiled = generateCss(
        parseCss(source, host.extra), grid, seed, maxGrid, null,
        's' + hash(JSON.stringify([attributes, variables]) + code).toString(36), host.extra
    );
    warnings.unshift(...compiled.warnings);

    let { styles, content, filters, uniforms, patterns, props } = compiled;
    if (hasEntries(patterns)) needs.add('shader');
    if (uniforms.mousex || uniforms.mousey) needs.add('mouse');
    if (uniforms.width || uniforms.height) needs.add('size');
    if ('click:update' in attributes || 'click-to-update' in attributes || 'auto:update' in attributes) {
        needs.add('update');
    }
    if (Object.values(content).some(c => c.includes('<css-doodle'))) needs.add('doodle');

    grid = compiled.grid || grid;
    let replace = createReplacer(host, compiled);
    let sheet = await replace(styles.top + getBasicStyles(grid) + styles.all);
    if (sheet.includes(`var(${UTime})`)) needs.add('clock');
    if (props.hasTransition) {
        sheet += '@starting-style{cell,bd{all:revert!important}}';
    }

    let shadow = `<style>${sheet.replace(/\n\s+/g, ' ').replace(/<\/(style)/gi, '<\\/$1')}</style>`;
    if (styles.cells || styles.container || hasEntries(content)) {
        shadow += dropStrayTemplateEnds(createGrid(grid, compiled));
    }
    let defs = Object.values(filters).join('');
    let light = '';
    if (defs) {
        shadow += `<slot name="ft"></slot><ft style="${FilterHolderStyle}">${defs}</ft>`;
        light = `<ft slot="ft" style="${FilterHolderStyle}">${defs}</ft>`;
    }

    let before = '';
    if (styles.property.length) {
        before += `<style>${styles.property.join('')}</style>`;
    }
    if (styles.gf.length) {
        before += `<link rel="stylesheet" href="${escapeAttr(getGoogleFontLink(styles.gf))}">`;
    }

    let attrs = { role: 'img', ...attributes };
    let attrText = Object.entries(attrs)
        .map(([name, value]) => value === '' || value === true ? ` ${name}` : ` ${name}="${escapeAttr(value)}"`)
        .join('');

    let html = before + `<css-doodle${attrText}>${escapeText(code)}`
        + `<template shadowrootmode="open">${shadow}</template>${light}</css-doodle>`;

    return { html, seed, needs: [...needs], warnings };
}
