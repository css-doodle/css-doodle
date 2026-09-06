import parseGrid from '../parser/parse-grid.js';

import generateCss from '../generator/css.js';
import generatePng from '../generator/svg-to-png.js';

import { getRgbaColor, getVariable, getAllVariables } from './computed-style.js';
import { NS, NSXHtml, FilterHolderStyle } from '../utils/svg.js';
import { isNil } from '../utils/type.js';
import { uniqueId } from '../utils/fn.js';
import { isSafari } from '../utils/browser.js';
import { css } from '../utils/tagged-template.js';
import { loadGoogleFontEmbed, loadGoogleFontLink } from './google-font.js';

import { parseCssCached } from './parse-cache.js';
import { bindUniforms, unbindUniforms } from './uniforms.js';
import { createReplacer, stampSvgImages, hasImageClock } from './embedded.js';
import { getBasicStyles, createGrid } from './markup.js';

function unEntity(code) {
    let textarea = document.createElement('textarea');
    textarea.innerHTML = code;
    return textarea.value;
}

function mountFilterDefs(parent, markup, slot) {
    let holder = parent.querySelector(':scope > ft');
    if (!markup) {
        if (holder) {
            holder.remove();
        }
        return null;
    }
    if (!holder) {
        holder = document.createElement('ft');
        holder.setAttribute('style', FilterHolderStyle);
        if (slot) {
            holder.setAttribute('slot', slot);
        }
        parent.appendChild(holder);
    }
    holder.innerHTML = markup;
    return holder;
}

function getPngName(name) {
    let prefix = isNil(name)
        ? Date.now()
        : String(name).replace(/\.png$/, '');
    return prefix + '.png';
}

let CSSDoodle = class {};

export function define(name, element) {
    if (typeof customElements !== 'undefined' && !customElements.get(name)) {
        customElements.define(name, element);
    }
}

if (typeof HTMLElement !== 'undefined') {
    CSSDoodle = class extends HTMLElement {
        static observedAttributes = [
            'grid', 'seed', 'use', 'experimental',
            'click-to-update', 'click:update',
            'auto:update',
        ];

        constructor() {
            super();
            this.doodle = this.attachShadow({ mode: 'open' });
            this.addEventListener('click', this.dispatchCellClick);
            this.animations = [];
            this.observers = new Map();
            this.shaderRenders = new Map();
            this._instance = uniqueId();
            this._generation = 0;
            this._clock = { base: 0, since: 0 };
            this._warned = new Set();
            this.extra = {
                getVariable: name => getVariable(this, name),
                getRgbaColor: value => getRgbaColor(this.shadowRoot, value),
            };
        }

        connectedCallback() {
            if (this.compiled || this.innerHTML) {
                this.load();
            } else {
                this.waitForSource();
            }
        }

        waitForSource() {
            let doc = this.ownerDocument;
            let timer;
            let done = () => {
                observer.disconnect();
                clearTimeout(timer);
                doc.removeEventListener('DOMContentLoaded', done);
                if (this.isConnected && !this.compiled) {
                    this.load();
                }
            };
            let observer = new MutationObserver(done);
            observer.observe(this, { childList: true });
            if (doc.readyState === 'loading') {
                doc.addEventListener('DOMContentLoaded', done);
            } else {
                timer = setTimeout(done);
            }
        }

        disconnectedCallback() {
            this.cleanup();
            unbindUniforms(this);
            clearInterval(this._auto_update_timer);
        }

        attributeChangedCallback(name, oldValue, newValue) {
            if (oldValue === newValue) {
                return;
            }
            if (name === 'click-to-update' || name === 'click:update') {
                if (newValue === null) {
                    this.removeEventListener('click', this.bindClickToUpdate);
                    this.removeAttribute('click-to-update');
                    this.removeAttribute('click:update');
                } else if (oldValue === null) {
                    this.addEventListener('click', this.bindClickToUpdate);
                }
            } else if (name === 'auto:update') {
                if (newValue !== null) {
                    this.autoUpdate();
                } else {
                    this.cancelAutoUpdate();
                }
            } else if (this.compiled) {
                // before the first load the attribute is read by that load
                this.update();
            }
        }

        attr(name, value) {
            let len = arguments.length;
            if (len === 1) {
                return this.getAttribute(name);
            }
            if (len === 2) {
                this.setAttribute(name, value);
                return value;
            }
        }

        get grid() {
            return Object.assign({}, this.gridSize);
        }

        set grid(grid) {
            this.attr('grid', grid);
        }

        get seed() {
            return this.compiled?.seed;
        }

        set seed(seed) {
            this.attr('seed', seed);
        }

        get use() {
            return this.attr('use');
        }

        set use(use) {
            this.attr('use', use);
        }

        get diagnostics() {
            return (this.compiled && this.compiled.warnings) || [];
        }

        getMaxGrid() {
            return this.hasAttribute('experimental') ? 256 : 64;
        }

        getGrid() {
            return parseGrid(this.attr('grid'), this.getMaxGrid());
        }

        getUse() {
            let use = String(this.attr('use') || '').trim();
            if (/^var\(/.test(use)) {
                use = `@use:${use};`;
            }
            return use;
        }

        triggerEvent(name, detail = {}) {
            return this.dispatchEvent(
                new CustomEvent(name, {
                    detail,
                    bubbles: true,
                    composed: true,
                })
            );
        }

        dispatchCellClick(event) {
            let cell = event.composedPath().find(el => el.tagName === 'CELL');
            if (!cell) return;
            let match = /^c-(\d+)-(\d+)-(\d+)$/.exec(cell.id);
            if (!match) return;
            this.triggerEvent('click:cell', {
                x: Number(match[1]),
                y: Number(match[2]),
                z: Number(match[3]),
                element: cell,
                originalEvent: event,
            });
        }

        bindClickToUpdate() {
            this.update();
        }

        _get_auto_update_interval(interval) {
            const MIN = 500;
            const DEFAULT = 2000;
            if (isNil(interval)) {
                interval = this.dataset.interval || this.attr('auto:update') || DEFAULT;
            }
            interval = String(interval).trim();
            if (/^([\d.]+)m$/.test(interval)) {
                interval = parseFloat(interval) * 60 * 1000;
            } else if (/^([\d.]+)s$/.test(interval)) {
                interval = parseFloat(interval) * 1000;
            } else {
                interval = parseFloat(interval);
            }
            if (isNaN(interval)) {
                return DEFAULT;
            }
            return Math.max(interval, MIN);
        }

        autoUpdate(interval) {
            clearInterval(this._auto_update_timer);
            if (!isNil(interval)) {
                this.dataset.interval = interval;
            }
            this._auto_update_timer = setInterval(
                () => this.update({ auto: true }),
                this._get_auto_update_interval(interval)
            );
        }

        cancelAutoUpdate() {
            clearInterval(this._auto_update_timer);
            this._auto_update_timer = null;
            this.removeAttribute('auto:update');
            this.removeAttribute('data-interval');
        }

        generate(parsed) {
            let grid = this.getGrid();
            let seed = this.attr('seed') || this.attr('data-seed');
            if (isNil(seed)) {
                seed = Date.now();
            }
            let compiled = this.compiled = generateCss(
                parsed, grid, seed, this.getMaxGrid(), null, [], this._instance
            );
            this.report(compiled.warnings);
            return compiled;
        }

        report(warnings) {
            for (let { message, pos } of warnings) {
                if (this._warned.has(message)) continue;
                this._warned.add(message);
                let where = pos ? ` (at line ${pos[1] + 1}, column ${pos[0] + 1})` : '';
                console.warn(message + where, this);
            }
        }

        load() {
            this.cleanup();
            let code = this._code || unEntity(this.innerHTML);
            let parsed = parseCssCached(this.getUse() + code, this.extra);
            let compiled = this.generate(parsed);

            this.gridSize = compiled.grid || this.getGrid();
            this._code = code;
            // the source is cleared before buildGrid so the filter defs it
            // mounts as light children don't get wiped along with it
            this.innerHTML = '';
            this.buildGrid(compiled, this.gridSize);

            if (this.hasAttribute('auto:update') || this._auto_update_timer) {
                this.autoUpdate();
            }
            setTimeout(() => {
                this.triggerEvent('render');
            });
        }

        update(styles, options = {}) {
            this.triggerEvent('beforeUpdate');
            if (typeof styles === 'object' && styles !== null) {
                options = styles;
                styles = '';
            }

            this._update(styles);
            if (!options.auto && (this.hasAttribute('auto:update') || this._auto_update_timer)) {
                this.autoUpdate();
            }
        }

        _update(styles) {
            this.cleanup();
            // reuse the old rules when called without new code
            if (!styles) {
                styles = this._code;
            }
            this._code = styles;

            const old = this.compiled;
            const compiled = this.generate(
                parseCssCached(this.getUse() + styles, this.extra));
            const grid = compiled.grid || this.getGrid();
            const rebuild = this.shouldRebuild(compiled, old, grid);

            this.gridSize = grid;

            if (rebuild) {
                this.buildGrid(compiled, grid);
            } else {
                this.patch(compiled, old.styles);
            }

            setTimeout(() => {
                this.triggerEvent('render');
                this.triggerEvent('afterUpdate');
                this.triggerEvent('update');
            });
        }

        shouldRebuild(compiled, old, grid) {
            if (!old) {
                return true;
            }
            // no cells yet, or nested doodles pending as content
            if (!this.shadowRoot.innerHTML || this.shadowRoot.querySelector('css-doodle')) {
                return true;
            }
            let { x, y, z } = this.gridSize;
            if (grid.x !== x || grid.y !== y || grid.z !== z) {
                return true;
            }
            if (JSON.stringify(old.content) !== JSON.stringify(compiled.content)) {
                return true;
            }
            if (!old.styles.cells || !compiled.styles.cells) {
                return true;
            }
            return old.styles.backdrop !== compiled.styles.backdrop;
        }

        // refresh styles in place, keeping the cell elements
        patch(compiled, oldStyles) {
            bindUniforms(this, compiled.uniforms);
            if (compiled.props.hasAnimation) {
                // detach animations first so they restart with the new styles
                this.setStyle(oldStyles.all.replace(/animation/g, 'x'));
                this.reflow();
            }
            loadGoogleFontLink(compiled.styles.gf);
            this.applyStyles(compiled);
            this.mountFilters(compiled.filters);
            this.syncSvgAnimations();
        }

        buildGrid(compiled, grid) {
            const { hasTransition, hasAnimation } = compiled.props;
            const { uniforms, content, styles } = compiled;
            const basicStyles = getBasicStyles(grid);
            const hasContent = Object.keys(content).length;

            this.doodle.innerHTML = css`
                <style>${basicStyles + styles.main}</style>
                ${(styles.cells || styles.container || hasContent) ? createGrid(grid, compiled) : ''}
            `;
            if (hasTransition || hasAnimation) {
                this.reflow();
            }
            loadGoogleFontLink(styles.gf);
            let replace = this.applyStyles(compiled);
            if (hasContent) {
                replace(Object.values(content).join(' '));
            }
            bindUniforms(this, uniforms);
            this.mountFilters(compiled.filters);
            this.syncSvgAnimations();
        }

        // the main sheet with its nested doodle and paint images resolved
        applyStyles(compiled) {
            let replace = createReplacer(this, compiled);
            this.setStyle(replace(
                compiled.styles.top +
                getBasicStyles(this.gridSize) +
                compiled.styles.all
            ).then(sheet => {
                // the clock runs from the moment the sheet and its images land
                if (!this._clock.since && !this.hasAttribute('cssd-paused')) {
                    this._clock.since = performance.now();
                }
                return stampSvgImages(this, sheet);
            }));
            return replace;
        }

        // running time of the host in ms, frozen while paused; the images
        // that carry their own clock are stamped with it
        clockNow() {
            let { base, since } = this._clock;
            return base + (since ? performance.now() - since : 0);
        }

        // nested doodle images and animated svg images carry their own
        // clocks, so the sheet is rebuilt with the host's time on pause/resume
        restamp() {
            let compiled = this.compiled;
            if (!compiled) return;
            let { styles, doodles } = compiled;
            if (Object.keys(doodles).length || hasImageClock(styles.top + styles.all)) {
                this.applyStyles(compiled);
            }
        }

        mountFilters(filters) {
            let markup = Object.values(filters).join('');
            let slot = this.shadowRoot.querySelector('slot[name="ft"]');
            if (markup && !slot) {
                slot = document.createElement('slot');
                slot.setAttribute('name', 'ft');
                this.shadowRoot.appendChild(slot);
            }
            if (!markup && slot) {
                slot.remove();
            }
            let holders = [
                mountFilterDefs(this.shadowRoot, markup),
                mountFilterDefs(this, markup, 'ft'),
            ];
            this._filters_markup = markup;
            if (markup) {
                requestAnimationFrame(() => requestAnimationFrame(() => {
                    if (this._filters_markup !== markup) {
                        return;
                    }
                    if (isSafari()) {
                        // Safari keeps the def animations running but won't repaint
                        // the elements referencing them until their compositing
                        // layers get rebuilt, so flip a rendering hint for a frame
                        // on everything that may carry a filter
                        let targets = [
                            this, ...this.shadowRoot.querySelectorAll('grid,cell')
                        ];
                        for (let el of targets) {
                            el.style.willChange = 'filter';
                        }
                        requestAnimationFrame(() => requestAnimationFrame(() => {
                            for (let el of targets) {
                                el.style.willChange = '';
                            }
                        }));
                    } else {
                        for (let holder of holders) {
                            holder.innerHTML = markup;
                        }
                        this.syncSvgAnimations();
                    }
                }));
            }
        }

        setStyle(input) {
            if (input instanceof Promise) {
                // a render that was replaced while waiting must not write its styles
                let generation = this._generation;
                input.then(v => {
                    if (this._generation === generation) {
                        this.setStyle(v);
                    }
                }).catch(console.error);
            } else {
                const el = this.shadowRoot.querySelector('style');
                if (el) {
                    el.textContent = input.replace(/\n\s+/g, ' ');
                }
            }
        }

        reflow() {
            let el = this.shadowRoot.querySelector('grid') || this;
            el.offsetWidth;
        }

        cleanup() {
            this._generation++;
            for (let am of this.animations) {
                am.cancel();
            }
            this.animations = [];
            this.observers.forEach(observer => observer.disconnect());
            this.observers.clear();
            this.shaderRenders.forEach(drawing => drawing.dispose());
            this.shaderRenders.clear();
            this._clock = { base: 0, since: 0 };
            // the shader and pattern images live in host variables
            if (this.compiled) {
                let { patterns, shaders } = this.compiled;
                for (let id of Object.keys(shaders)) {
                    this.style.removeProperty('--' + id);
                }
                for (let id of Object.keys(patterns)) {
                    this.style.removeProperty('--' + id);
                }
            }
        }

        pause() {
            if (this.hasAttribute('cssd-paused')) return;
            this._clock = { base: this.clockNow(), since: 0 };
            this.setAttribute('cssd-paused', true);
            for (let am of this.animations) {
                am.pause();
            }
            for (let nested of this.shadowRoot.querySelectorAll('css-doodle')) {
                nested.pause();
            }
            this.syncSvgAnimations();
            this.restamp();
        }

        resume() {
            if (!this.hasAttribute('cssd-paused')) return;
            this.removeAttribute('cssd-paused');
            this._clock.since = performance.now();
            for (let am of this.animations) {
                am.resume();
            }
            for (let nested of this.shadowRoot.querySelectorAll('css-doodle')) {
                nested.resume();
            }
            this.syncSvgAnimations();
            this.restamp();
        }

        // SMIL animations in inline svg (content, filter defs) ignore
        // animation-play-state, so they follow the paused attribute here
        syncSvgAnimations() {
            let paused = this.hasAttribute('cssd-paused');
            let svgs = [
                ...this.shadowRoot.querySelectorAll('svg'),
                ...this.querySelectorAll(':scope > ft svg'),
            ];
            for (let svg of svgs) {
                paused ? svg.pauseAnimations() : svg.unpauseAnimations();
            }
        }

        async export({ scale, name, download, detail } = {}) {
            let variables = getAllVariables(this);
            let html = this.doodle.innerHTML;

            let { width, height } = this.getBoundingClientRect();
            scale = parseInt(scale) || 1;

            let w = width * scale;
            let h = height * scale;
            let fonts = await loadGoogleFontEmbed();
            let svg = css`
                <svg ${NS} preserveAspectRatio="none" viewBox="0 0 ${width} ${height}" ${isSafari() ? '' : `width="${w}px" height="${h}px"`}>
                    <foreignObject width="100%" height="100%">
                        <div class="host" ${NSXHtml} style="width:${width}px;height:${height}px">
                            <style><![CDATA[
                                ${fonts}
                                .host{${variables}}
                            ]]></style>
                            ${html}
                        </div>
                    </foreignObject>
                </svg>
            `;

            if (download || detail) {
                let { source, url, blob } = await generatePng(svg, w, h, scale);
                if (download) {
                    let a = document.createElement('a');
                    a.download = getPngName(name);
                    a.href = url;
                    a.click();
                }
                return { width: w, height: h, svg, blob, source };
            }
            return { width: w, height: h, svg };
        }
    }
}

export { CSSDoodle };
