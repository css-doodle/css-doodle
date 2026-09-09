import parseGrid from '../parser/parse-grid.js';

import generateCss from '../generator/css.js';
import generatePng from '../generator/svg-to-png.js';

import { getRgbaColor, getVariable, getAllVariables } from './computed-style.js';
import { NS, NSXHtml, FilterHolderStyle } from '../lib/svg.js';
import { isNil } from '../lib/type.js';
import { uniqueId } from '../lib/fn.js';
import { isSafari } from '../lib/browser.js';
import { css } from '../lib/tagged-template.js';
import { loadGoogleFontEmbed, loadGoogleFontLink } from './google-font.js';

import { parseCssCached } from './parse-cache.js';
import { bindUniforms, unbindUniforms } from './uniforms.js';
import { stampSvgImages, hasImageClock } from './clock.js';
import { createReplacer, releaseSharedImages } from './embedded.js';
import { getBasicStyles, createGrid } from './markup.js';

function unEntity(code) {
    let textarea = document.createElement('textarea');
    textarea.innerHTML = code;
    return textarea.value;
}

function serializeDoodle(root) {
    let sources = root.querySelectorAll('canvas');
    let nodes = root.childNodes;
    if (sources.length) {
        let template = document.createElement('template');
        template.innerHTML = root.innerHTML;
        template.content.querySelectorAll('canvas').forEach((canvas, i) => {
            let image = document.createElement('img');
            image.setAttribute('style', 'position:absolute;width:100%;height:100%;object-fit:cover');
            image.setAttribute('src', sources[i].toDataURL());
            canvas.replaceWith(image);
        });
        nodes = template.content.childNodes;
    }
    let serializer = new XMLSerializer();
    return Array.from(nodes, node => serializer.serializeToString(node)).join('');
}

function mountFilterDefs(parent, markup, slot) {
    // `:scope >` matches nothing when the parent is a shadow root
    let holder = [...parent.children].find(el => el.localName === 'ft');
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

// `2s`, `1.5m` or a number of milliseconds, at least 500; 2000 when unreadable
function parseInterval(value) {
    let text = String(value ?? '').trim();
    let m = /^([\d.]+)(m|s)$/.exec(text);
    let ms = m ? parseFloat(m[1]) * (m[2] === 'm' ? 60000 : 1000) : parseFloat(text);
    return isNaN(ms) ? 2000 : Math.max(ms, 500);
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
            this.attachShadow({ mode: 'open' });
            this.addEventListener('click', this.dispatchCellClick);
            this.animations = [];
            this.observers = new Map();
            this.shaderRenders = new Map();
            this._instance = uniqueId();
            this._generation = 0;
            this._clock = { base: 0, since: 0 };
            this._offscreen = false;
            this._warned = new Set();
            this.extra = {
                getVariable: name => getVariable(this, name),
                getRgbaColor: value => getRgbaColor(this.shadowRoot, value),
            };
        }

        connectedCallback() {
            if (!this.hasAttribute('role')) {
                this.setAttribute('role', 'img');
            }
            this.watchViewport();
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
            this._viewport?.disconnect();
            this._viewport = null;
        }

        // the shader loops only draw while the host is in view
        watchViewport() {
            if (typeof IntersectionObserver === 'undefined') return;
            this._viewport = new IntersectionObserver(entries => {
                this._offscreen = !entries[entries.length - 1].isIntersecting;
                if (this.hasAttribute('cssd-paused')) return;
                for (let am of this.animations) {
                    this._offscreen ? am.pause() : am.resume();
                }
            });
            this._viewport.observe(this);
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

        get grid() {
            return { ...this.gridSize };
        }

        set grid(grid) {
            this.setAttribute('grid', grid);
        }

        get seed() {
            return this.compiled?.seed;
        }

        set seed(seed) {
            this.setAttribute('seed', seed);
        }

        get use() {
            return this.getAttribute('use');
        }

        set use(use) {
            this.setAttribute('use', use);
        }

        get diagnostics() {
            return this.compiled?.warnings ?? [];
        }

        getMaxGrid() {
            return this.hasAttribute('experimental') ? 256 : 64;
        }

        getGrid() {
            return parseGrid(this.getAttribute('grid'), this.getMaxGrid());
        }

        getUse() {
            let use = String(this.getAttribute('use') || '').trim();
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
                    cancelable: true,
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

        autoUpdate(interval) {
            if (!isNil(interval)) {
                this.dataset.interval = interval;
            }
            clearInterval(this._auto_update_timer);
            this._auto_update_timer = setInterval(
                () => this.update({ auto: true }),
                parseInterval(this.dataset.interval || this.getAttribute('auto:update'))
            );
        }

        cancelAutoUpdate() {
            clearInterval(this._auto_update_timer);
            this._auto_update_timer = null;
            this.removeAttribute('auto:update');
            this.removeAttribute('data-interval');
        }

        generate(code) {
            let seed = this.getAttribute('seed') || this.getAttribute('data-seed');
            if (isNil(seed)) {
                seed = Date.now();
            }
            let parsed = parseCssCached(this.getUse() + code, this.extra);
            let compiled = this.compiled = generateCss(
                parsed, this.getGrid(), seed, this.getMaxGrid(), null, [], this._instance
            );
            this.report(compiled.warnings);
            return compiled;
        }

        // each new warning is dispatched as a `warn` event before it is
        // printed; preventDefault() keeps it out of the console
        report(warnings) {
            for (let warning of warnings) {
                let { message, pos } = warning;
                if (this._warned.has(message)) continue;
                this._warned.add(message);
                if (!this.triggerEvent('warn', warning)) continue;
                let where = pos ? ` (at line ${pos[1] + 1}, column ${pos[0] + 1})` : '';
                console.warn(message + where, this);
            }
        }

        load() {
            let code = this._code || unEntity(this.innerHTML);
            this.innerHTML = '';
            this.render(code);
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
            this.render(styles || this._code);
            if (!options.auto && (this.hasAttribute('auto:update') || this._auto_update_timer)) {
                this.autoUpdate();
            }
            setTimeout(() => {
                this.triggerEvent('render');
                this.triggerEvent('afterUpdate');
                this.triggerEvent('update');
            });
        }

        render(code) {
            this.cleanup();
            this._code = code;
            let old = this.compiled;
            let compiled = this.generate(code);
            let grid = compiled.grid || this.getGrid();
            let rebuild = this.shouldRebuild(compiled, old, grid);
            this.gridSize = grid;
            if (rebuild) {
                this.buildGrid(compiled, grid);
            } else {
                this.patch(compiled, old.styles);
            }
        }

        shouldRebuild(compiled, old, grid) {
            if (!old) {
                return true;
            }
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

        buildGrid(compiled, grid) {
            let { hasTransition, hasAnimation } = compiled.props;
            let { content, styles } = compiled;
            let hasContent = Object.keys(content).length;
            this.shadowRoot.innerHTML = css`
                <style>${getBasicStyles(grid) + styles.main}</style>
                ${(styles.cells || styles.container || hasContent) ? createGrid(grid, compiled) : ''}
            `;
            if (hasTransition || hasAnimation) {
                this.reflow();
            }
            this.mount(compiled);
        }

        patch(compiled, oldStyles) {
            if (compiled.props.hasAnimation) {
                this.setStyle(oldStyles.all.replace(/animation/g, 'x'));
                this.reflow();
            }
            this.mount(compiled);
        }

        mount(compiled) {
            let { styles, content, uniforms, filters } = compiled;
            loadGoogleFontLink(styles.gf);
            let replace = this.applyStyles(compiled);
            replace(Object.values(content).join(' '));
            bindUniforms(this, uniforms);
            this.mountFilters(filters);
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

        clockNow() {
            let { base, since } = this._clock;
            return base + (since ? performance.now() - since : 0);
        }

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
            releaseSharedImages(this);
            this._clock = { base: 0, since: 0 };
            // the shader and pattern images live in host variables
            if (this.compiled) {
                let { shaders, patterns } = this.compiled;
                for (let id of [...Object.keys(shaders), ...Object.keys(patterns)]) {
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
            if (!this._offscreen) {
                for (let am of this.animations) {
                    am.resume();
                }
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
                ...this.querySelectorAll(':scope>ft svg'),
            ];
            for (let svg of svgs) {
                paused ? svg.pauseAnimations() : svg.unpauseAnimations();
            }
        }

        async export({ scale, name, download, detail } = {}) {
            let variables = getAllVariables(this);
            let html = serializeDoodle(this.shadowRoot);

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
                let { source, blob } = await generatePng(svg, w, h, scale);
                if (download) {
                    let a = document.createElement('a');
                    a.download = getPngName(name);
                    a.href = URL.createObjectURL(blob);
                    a.click();
                    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
                }
                return { width: w, height: h, svg, blob, source };
            }
            return { width: w, height: h, svg };
        }
    }
}

export { CSSDoodle };
