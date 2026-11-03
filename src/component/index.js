import parseGrid from '../parser/parse-grid.js';
import parseCss from '../parser/parse-css.js';
import parseValueGroup from '../parser/parse-value-group.js';

import Func, { MathFunc } from '../core/function.js';
import createRandom from '../core/random.js';
import generateCss from '../generator/css.js';
import generatePng from '../generator/svg-to-png.js';

import { getRgbaColor, getVariable, getAllVariables } from './computed-style.js';
import { NS, NSXHtml, FilterHolderStyle, cdata } from '../lib/svg.js';
import { isNil } from '../lib/type.js';
import { clearMemos } from '../lib/cache.js';
import { fontsLoading } from '../generator/trace.js';
import { isSafari } from '../lib/browser.js';
import { css } from '../lib/tagged-template.js';
import { RE_PLACEHOLDER, hasPlaceholder } from '../lib/placeholder.js';
import { loadGoogleFontEmbed, loadGoogleFontLink } from './google-font.js';

import { bindUniforms, unbindUniforms, syncUTime } from './uniforms.js';
import { utime, UTime } from '../core/uniforms.js';
import { compile } from '../generator/glsl-math-transformer.js';
import { stampSvgImages, hasImageClock, TRANSITION_NONE } from './clock.js';
import { createReplacer } from './doodle-image.js';
import { draw } from './embedded.js';
import { getBasicStyles, createGrid } from './markup.js';

const propertyRules = new Map();
let propertySheet = null;

function hoistProperties(host, rules = []) {
    if (rules.length) propertyRules.set(host, rules);
    else if (!propertyRules.delete(host)) return;
    let text = [...new Set([...propertyRules.values()].flat())].join('\n');
    if (!propertySheet?.isConnected) {
        propertySheet = document.head.appendChild(document.createElement('style'));
    }
    if (propertySheet.textContent !== text) propertySheet.textContent = text;
}

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

const reducedMotion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');

const live = new Set();
const arrived = new Set();
const added = new Set();

const addons = new Map();

const ADDON_HOSTS = [
    'https://unpkg.com/@css-doodle/addons@1/',
    'https://cdn.jsdelivr.net/npm/@css-doodle/addons@1/',
];

const loadScript = src => new Promise(resolve => {
    let script = document.createElement('script');
    script.src = src;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    setTimeout(resolve, 5000);
    document.head.append(script);
});

function loadAddon(name) {
    if (!added.has(name) && !addons.has(name)) {
        addons.set(name, (async () => {
            await new Promise(resolve => setTimeout(resolve));
            for (let host of [CSSDoodle.addonBase, ...ADDON_HOSTS]) {
                if (!added.has(name) && host && await loadScript(`${host}${name}.js`)) added.add(name);
            }
        })().then(() => addons.set(name, true)));
    }
    return added.has(name) || addons.get(name);
}

const split = text => [...parseValueGroup(text, { noSpace: true })];
const words = text => [...parseValueGroup(text)];

const UNIT = /(?<![\w.])((?:\d+(?:\.\d*)?|\.\d+)(?:e[-+]?\d+)?)(%|deg|turn|rad)(?![\w.(])/gi;
const DEGREES = { '%': 1, deg: 1, turn: 360, rad: 180 / Math.PI };

function expr(text, warn) {
    let failed = false;
    let fail = message => (failed = true, warn(message));
    text = String(text);
    if ([utime, UTime].some(name => text.includes(name))) return fail('@t is CSS time, use t'), null;
    let names = { __proto__: null, t: 'u_time' };
    let math = text.replace(UNIT, (_, n, unit) => +n * DEGREES[unit.toLowerCase()]);
    let code = compile(math, { names, warn: fail, unknown: name => (fail(`unknown name ${name}`), [0]) }).code('float');
    return failed || !code ? null : code.replace(/\bPI\b/g, '3.1415926535897932');
}

function guard(fn, warn) {
    try {
        return fn();
    } catch (err) {
        warn(err.message);
        return '';
    }
}

const SPLIT = 'cssd-split';
const segmenters = {};
const segments = (text, granularity) =>
    (segmenters[granularity] ??= new Intl.Segmenter(undefined, { granularity })).segment(text);

function span(kind, text = '') {
    let el = document.createElement('span');
    el.setAttribute(SPLIT, kind);
    el.textContent = text;
    return el;
}

function splitText(el, unit) {
    for (let copy of el.querySelectorAll(`[${SPLIT}=text]`)) {
        if (copy.previousSibling !== copy.source || copy.source.data) copy.nextSibling?.remove(), copy.remove();
    }
    let walker = document.createTreeWalker(el, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, node =>
        node.hasAttribute?.(SPLIT) ? NodeFilter.FILTER_REJECT : node.data?.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP
    ), nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (let node of nodes) {
        let copy = span('text', node.data), run = span('run'), word, wordLike;
        copy.style.cssText = 'position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap;user-select:none';
        copy.source = node;
        run.setAttribute('aria-hidden', true);
        for (let { segment, isWordLike } of segments(node.data, 'word')) {
            if (!segment.trim()) {
                run.append(segment);
                word = null;
                continue;
            }
            if (!word || (isWordLike && wordLike)) {
                run.append(word = span('word'));
                word.style.whiteSpace = 'nowrap';
                wordLike = false;
            }
            for (let { segment: letter } of segments(segment, 'grapheme')) word.append(span('letter', letter));
            wordLike ||= isWordLike;
        }
        // emptied, not removed: a framework may still hold the node
        node.after(copy, run);
        node.data = '';
    }
    return [...el.querySelectorAll(`[${SPLIT}=${unit.slice(0, -1)}]`)];
}

function layout(els, frame) {
    let offset = el => {
        let x = 0, y = 0;
        for (; el; el = el.offsetParent) x += el.offsetLeft, y += el.offsetTop;
        return [x, y];
    };
    let [fx, fy] = offset(frame);
    let boxes = els.map(el => {
        let [x, y] = offset(el);
        return { x: x - fx, y: y - fy, w: el.offsetWidth, h: el.offsetHeight };
    });
    let order = boxes.map((_, k) => k), rows = [], cols = [], count = [], n = 0, first;
    for (let k of order.sort((a, b) => boxes[a].y - boxes[b].y)) {
        let b = boxes[k];
        if (!first || Math.min(b.y + b.h, first.y + first.h) - Math.max(b.y, first.y) < Math.min(b.h, first.h) / 2) {
            first = b;
            n++;
        }
        rows[k] = n;
    }
    for (let k of order.sort((a, b) => boxes[a].x - boxes[b].x)) {
        cols[k] = count[rows[k]] = (count[rows[k]] || 0) + 1;
    }
    return boxes.map(({ x, y, w, h }, k) => ({ x: cols[k], y: rows[k], center: [x + w / 2, y + h / 2] }));
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
            'grid', 'seed', 'use', 'cells', 'experimental',
            'click-to-update', 'click:update',
            'auto:update', 'ignore-reduced-motion',
        ];

        static use(name, { shader, value, doodle } = {}) {
            if (added.has(name)) return;
            let [, base, variant] = /^([^.]+)(?:\.([^.]+))?$/.exec(name) || [];
            let owner = base && !doodle && Func, key = variant || name;
            if (variant) owner = (doodle ? base == 'doodle' : added.has(base)) && Func[base];
            if (owner && (key in owner || MathFunc[name])) return console.warn(`@${name} already exists`);
            if (!owner || !(shader || value || doodle)) return console.warn(`invalid addon @${name}`);
            owner[key] = doodle ? (code, api) => guard(() => doodle(code, {
                ...api, stream: key => createRandom([name, api.seed, key]).rand, split, words,
            }), api.warn) : shader ? Object.assign(() => {}, {
                shader: (code, extra, warn) => guard(() => shader(code, {
                    color: extra.getRgbaColor, expr: text => expr(text, warn), split, words, warn,
                }), warn),
            }) : ({ count, x, y, grid }, { rand, rules, seed, host, context }, position) => (...args) => {
                let warn = message => rules.warn(message);
                return guard(() => value(args, {
                    i: count, x, y, I: grid.count, X: grid.x, Y: grid.y, random: rand, seed,
                    stream: key => createRandom([base, seed, key]).rand,
                    color: (value, space) => host?.getRgbaColor?.(value, space) ?? null,
                    state: context['use:' + name + position] ??= {},
                    wait: promise => host?.wait?.(promise),
                    split, words, warn,
                }), warn);
            };
            if (!arrived.size) queueMicrotask(() => {
                let names = [...arrived];
                arrived.clear();
                for (let el of [...live]) {
                    if (!el.isConnected || !el.compiled || el._waiting) continue;
                    let source = el.getUse() + el._code;
                    if (source.includes('@use')) source += getAllVariables(el);
                    if (names.some(name => source.includes(('@' + name).replace('@doodle.', '.')))) el.render(el._code, el.compiled.seed);
                }
            });
            arrived.add(name);
            added.add(name);
        }

        constructor() {
            super();
            this._declared = !!this.shadowRoot;
            this.attachShadow({ mode: 'open' });
            for (let name of ['render', 'update', 'beforeUpdate']) {
                this.shadowRoot.addEventListener(name, e => e.stopPropagation());
            }
            this.addEventListener('click', this.dispatchCellClick);
            this.animations = [];
            this.observers = new Map();
            this.shaderRenders = new Map();
            this._instance = Math.random().toString(32).slice(2);
            this._generation = 0;
            this._moved = 0;
            this._styleReady = Promise.resolve();
            this._clock = { base: 0, since: 0 };
            this._offscreen = false;
            this._manual_motion = false;
            this._on_motion = () => this.syncMotion();
            this._warned = new Set();
            this.extra = {
                getVariable: name => getVariable(this, name),
                getRgbaColor: (value, space) => getRgbaColor(this.shadowRoot, value, space),
                wait: promise => this._waits?.add(promise),
            };
            this.draw = draw;
        }

        connectedCallback() {
            live.add(this);
            if (!this.hasAttribute('role') && !this.hasAttribute('cells')) {
                this.setAttribute('role', 'img');
            }
            this.watchViewport();
            reducedMotion?.addEventListener('change', this._on_motion);
            this.syncMotion();
            if (this.compiled || this.innerHTML || this._declared) {
                this.load();
            } else {
                this.waitForSource();
            }
        }

        waitForSource() {
            let doc = this.ownerDocument;
            let timer;
            // while loading, the source is complete once the parser has
            // moved past the element: a node follows it or an ancestor
            let passed = () => {
                for (let node = this; node; node = node.parentNode) {
                    if (node.nextSibling) return true;
                }
            };
            let done = () => {
                if (doc.readyState === 'loading' && !passed()) return;
                observer.disconnect();
                clearTimeout(timer);
                doc.removeEventListener('DOMContentLoaded', done);
                if (this.isConnected && !this.compiled) {
                    this.load();
                }
            };
            let observer = new MutationObserver(done);
            observer.observe(this.getRootNode(), { childList: true, subtree: true });
            if (doc.readyState === 'loading') {
                doc.addEventListener('DOMContentLoaded', done);
            } else {
                timer = setTimeout(done);
            }
        }

        disconnectedCallback() {
            live.delete(this);
            this.cleanup();
            for (let id in { ...this.compiled?.shaders, ...this.compiled?.patterns }) {
                this.vars.removeProperty('--' + id);
            }
            this._cells?.forEach(el => el.removeAttribute('cssd-' + this._instance));
            this._hosts?.forEach(el => el.removeAttribute(`cssd-${this._instance}-host`));
            unbindUniforms(this);
            hoistProperties(this);
            clearInterval(this._auto_update_timer);
            this._viewport?.disconnect();
            this._viewport = null;
            reducedMotion?.removeEventListener('change', this._on_motion);
        }

        reducesMotion() {
            return !!reducedMotion?.matches
                && !this._manual_motion
                && !this.hasAttribute('ignore-reduced-motion');
        }

        syncMotion() {
            if (this._manual_motion) return;
            this.reducesMotion() || this.getRootNode().host?.hasAttribute('cssd-paused')
                ? this.pause(true) : this.resume(true);
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
                    // before the first load, load() starts the timer
                    if (this.compiled) this.autoUpdate();
                } else {
                    this.cancelAutoUpdate();
                }
            } else if (name === 'ignore-reduced-motion') {
                this.syncMotion();
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
            return this._cells ? { cells: Math.max(this._cells.length, 1), at: this._at } : parseGrid(this.getAttribute('grid'), this.getMaxGrid());
        }

        get frame() {
            return this._cells && this._hosts[0] || this;
        }

        cellRules() {
            let m = `[cssd-${this._instance}]`, h = `[cssd-${this._instance}-host]`;
            if (!this._vars) (this._vars = document.createElement('style')).textContent = `${h}{}:is(${m},${h}),${m}::before,${m}::after{}`;
            if (this._vars.parentNode !== this) this.appendChild(this._vars);
            return this._vars.sheet;
        }

        get vars() {
            return this._cells && this.isConnected ? this.cellRules().cssRules[0].style : this.style;
        }

        pauseCells() {
            if (!this._cells || !this.isConnected) return;
            this.cellRules().cssRules[1].style.setProperty('animation-play-state', this.hasAttribute('cssd-paused') ? 'paused' : '', 'important');
        }

        finishAnimations() {
            if (!this.reducesMotion()) return;
            for (let target of this._cells ? this._hosts : [this, this.shadowRoot]) {
                for (let animation of target.getAnimations({ subtree: true })) {
                    if (animation.playState === 'paused' && animation.effect.getTiming().iterations !== Infinity) animation.finish();
                }
            }
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
            if (this._dragged) return;
            let cell = event.composedPath().find(el => el.tagName === 'CELL');
            if (!cell) return;
            let match = /^c-(\d+)-(\d+)-(\d+)$/.exec(cell.id || cell.className);
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
            if (!this._dragged) this.update();
        }

        autoUpdate(interval) {
            if (!isNil(interval)) {
                this.dataset.interval = interval;
            }
            clearInterval(this._auto_update_timer);
            this._auto_update_timer = setInterval(
                () => this.reducesMotion() || this.update({ auto: true }),
                parseInterval(this.dataset.interval || this.getAttribute('auto:update'))
            );
        }

        cancelAutoUpdate() {
            clearInterval(this._auto_update_timer);
            this._auto_update_timer = null;
            this.removeAttribute('auto:update');
            this.removeAttribute('data-interval');
        }

        generate(source, parsed, seed) {
            seed = this.getAttribute('seed') || seed;
            if (isNil(seed)) {
                seed = Date.now();
            }
            let compiled = this.compiled = generateCss(
                parsed, this.getGrid(), seed, this.getMaxGrid(), null, [], this._instance, this.extra
            );
            for (let name of parsed.addons) {
                if (!added.has(name)) compiled.warnings.push({ message: `unknown addon ${name}` });
            }
            this.report(compiled.warnings, source);
            return compiled;
        }

        report(warnings, source) {
            for (let warning of warnings) {
                let { message, pos, index } = warning;
                if (!this.triggerEvent('warn', warning)) continue;
                if (this._warned.has(message)) continue;
                this._warned.add(message);
                if (!pos && source && index >= 0) {
                    let lines = source.slice(0, index).split('\n');
                    pos = [lines.at(-1).length, lines.length - 1];
                }
                let where = pos ? ` (${pos[1] + 1}:${pos[0] + 1})` : '';
                console.warn(message + where, this);
            }
        }

        load() {
            if (!this._code) {
                for (let el of this.querySelectorAll(':scope>template[shadowrootmode],:scope>ft')) {
                    el.remove();
                }
            }
            let code = this._code || unEntity(this.innerHTML);
            this.innerHTML = '';
            this.render(code, this.compiled?.seed);
            if (this.hasAttribute('auto:update') || this._auto_update_timer) {
                this.autoUpdate();
            }
            this._styleReady.then(() => this.triggerEvent('render'));
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
            this._styleReady.then(() => {
                this.triggerEvent('render');
                this.triggerEvent('update');
            });
        }

        render(code, seed, tries = 2) {
            this.cleanup();
            this._code = code;
            let source = this.getUse() + code;
            let warn = message => this.report([{ message }]);
            let parsed = guard(() => parseCss(source, this.extra), warn);
            if (!parsed) return;
            let loading = parsed.addons.map(loadAddon).filter(status => status.then);
            this._waiting = loading.length > 0;
            if (this._waiting) {
                let generation = this._generation;
                this._styleReady = Promise.all(loading).then(() => {
                    if (generation !== this._generation) return;
                    this.render(code, seed, tries);
                    return this._styleReady;
                });
                return;
            }
            if (tries > 1) this._warned?.clear();
            let select = this.getAttribute('cells'), root = select && this.getRootNode(), mark = 'cssd-' + this._instance;
            let unit, hosts = [], base = select?.replace(/::(letters|words)(?=\s*(,|$))/g, (_, name) => (unit = name, ''));
            let query = () => {
                let found = [...root.querySelectorAll(base)].filter(el => !this.contains(el));
                hosts = unit ? found : [...new Set(found.map(el => el.parentElement).filter(Boolean))];
                return unit ? found.flatMap(el => splitText(el, unit)) : found;
            };
            let cells = select ? guard(query, warn) || [] : null;
            this._cells?.forEach(el => el.removeAttribute(mark));
            this._hosts?.forEach(el => el.removeAttribute(mark + '-host'));
            cells?.forEach((el, i) => el.setAttribute(mark, i + 1));
            hosts.forEach(el => el.setAttribute(mark + '-host', ''));
            this._cells = cells;
            this._hosts = hosts;
            let aims = /@ud[xy]\b/.test(source);
            let sign = (at = layout(cells, this.frame)) => JSON.stringify(at.map(p => [p.x, p.y, aims && p.center]));
            if (cells) {
                this._layout = sign(this._at = layout(cells, this.frame));
                let resize = new ResizeObserver(() => {
                    if (sign() !== this._layout) this._moved = 0, requestAnimationFrame(() => {
                        if (this.observers.get('resize') === resize) this.render(this._code, this.compiled?.seed);
                    });
                });
                for (let el of new Set([this.frame, ...cells.map(el => el.parentElement)])) el && resize.observe(el);
                this.observers.set('resize', resize);
                let pending, observer = new MutationObserver(records => {
                    if (pending || records.every(r => this.contains(r.target))) return;
                    pending = requestAnimationFrame(() => {
                        pending = 0;
                        if (this.observers.get('cells') !== observer) return;
                        let now = guard(query, warn) || [];
                        if (now.length !== cells.length || now.some((el, i) => el !== cells[i])) {
                            this.render(this._code, this.compiled?.seed);
                        }
                    });
                });
                observer.observe(root, { childList: true, subtree: true, characterData: true });
                this.observers.set('cells', observer);
                let click = e => {
                    let el = e.composedPath().find(el => el.hasAttribute?.(mark));
                    if (!el || this._dragged) return;
                    let { x, y } = this.gridSize.at[el.getAttribute(mark) - 1];
                    this.triggerEvent('click:cell', { x, y, z: 1, element: el, originalEvent: e });
                    if (this.hasAttribute('click-to-update') || this.hasAttribute('click:update')) this.update();
                };
                root.addEventListener('click', click);
                this.observers.set('click', { disconnect: () => root.removeEventListener('click', click) });
            } else {
                this._sheet?.remove();
                this._vars?.remove();
            }
            let old = this.compiled;
            let waits = this._waits = new Set();
            let compiled = guard(() => this.generate(source, parsed, seed), warn);
            if (!compiled) return;
            for (let id in { ...old?.shaders, ...old?.patterns }) {
                if (!compiled.shaders[id] && !compiled.patterns[id]) {
                    this.vars.removeProperty('--' + id);
                }
            }
            let grid = compiled.grid || this.getGrid();
            let rebuild = this.shouldRebuild(compiled, old, grid);
            this.gridSize = grid;
            if (cells) {
                this.shadowRoot.replaceChildren();
                if (Object.keys(compiled.content).length) warn('@content unsupported');
                this.mount(compiled);
                this.pauseCells();
            } else if (rebuild) {
                this.buildGrid(compiled, grid);
            } else {
                this.patch(compiled);
            }
            let wait = [...waits], generation = this._generation;
            if (cells) this._styleReady.then(() => {
                if (generation !== this._generation) return;
                let now = sign();
                if (now === this._layout) this._moved = 0;
                else if (this._moved++ < 2) this.render(this._code, this.compiled?.seed);
                else this._layout = now;
            });
            if (/\btext\s*:/.test(source.includes('@use') ? source + getAllVariables(this) : source)) {
                let linked = loadGoogleFontLink(compiled.styles.gf);
                if (linked) fontsLoading.add(linked);
                wait.push(...fontsLoading);
            }
            if (wait.length && tries) Promise.allSettled(wait).then(() => {
                if (wait.map(p => fontsLoading.delete(p)).includes(true)) clearMemos();
                if (generation === this._generation) this.render(this._code, this.compiled.seed, tries - 1);
            });
        }

        shouldRebuild(compiled, old, grid) {
            if (!old) {
                return true;
            }
            if (!this.shadowRoot.firstChild || this.shadowRoot.querySelector('css-doodle')) {
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
            let { hasTransition } = compiled.props;
            let { content, styles } = compiled;
            let hasContent = Object.keys(content).length;
            let sheet = hasTransition || !hasPlaceholder(styles.all)
                ? getBasicStyles(grid) + styles.main
                : (styles.top + getBasicStyles(grid) + styles.all).replace(RE_PLACEHOLDER, '');
            this.shadowRoot.innerHTML = css`
                <style>${sheet.replace(/<\/(style)/gi, '<\\/$1')}</style>
                ${(styles.cells || styles.container || hasContent) ? createGrid(grid, compiled) : ''}
            `;
            if (hasTransition) {
                this.reflow();
            }
            this.mount(compiled);
        }

        patch(compiled) {
            let style = this.shadowRoot.querySelector('style');
            if (compiled.props.hasAnimation && style) {
                style.textContent = style.textContent.replace(/animation/g, 'x');
                this.reflow();
            }
            this.mount(compiled);
        }

        mount(compiled) {
            let { styles, content, uniforms, filters } = compiled;
            loadGoogleFontLink(styles.gf);
            hoistProperties(this, styles.property);
            let replace = this.applyStyles(compiled);
            replace(Object.values(content).join(' '));
            bindUniforms(this, uniforms);
            this.mountFilters(filters);
            this.syncSvgAnimations();
        }

        // the main sheet with its nested doodle and paint images resolved
        applyStyles(compiled) {
            let replace = createReplacer(this, compiled), { top, all } = compiled.styles;
            let mark = `cssd-${this._instance}`, parent = `:where([${mark}-host]):not(#_)`;
            this.setStyle(replace(this._cells
                ? (top + all).replace(/#c-(\d+)-1-1\b|:is\(cell,#_\)|:host\(((?:[^()]|\([^()]*\))*)\)|:host,\.host|(?<=^|[{}\s])grid(?=\s*[{:.,[])/g,
                    (s, i, host = '') => i ? `:where([${mark}="${i}"]):not(#_)` : s[1] === 'i' ? `:where([${mark}]):not(#_)` : parent + host)
                : top + getBasicStyles(this.gridSize) + all
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

        // a render that was replaced while waiting must not write its styles
        setStyle(input) {
            let generation = this._generation;
            this._styleReady = input.then(sheet => {
                if (this._generation === generation) {
                    let style = this._cells ? (this._sheet ??= document.createElement('style')) : this.shadowRoot.querySelector('style');
                    if (this._cells && style.parentNode !== this) this.appendChild(style);
                    style.textContent = sheet.replace(/\n\s+/g, ' ');
                    this._landed = true;
                    syncUTime(this);
                    this.finishAnimations();
                    if (!isNil(this._seek)) {
                        let ms = this._seek;
                        this._seek = null;
                        this.currentTime = ms;
                    }
                }
            }).catch(console.error);
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
            this._landed = false;
        }

        pause(auto) {
            this._manual_motion ||= !auto;
            if (this.hasAttribute('cssd-paused')) return;
            this._clock = { base: this.clockNow(), since: 0 };
            this.setAttribute('cssd-paused', true);
            this.pauseCells();
            this.finishAnimations();
            for (let am of this.animations) {
                am.pause();
            }
            for (let nested of this.shadowRoot.querySelectorAll('css-doodle')) {
                nested.pause(auto);
            }
            this.syncSvgAnimations();
            this.restamp();
        }

        resume(auto) {
            this._manual_motion ||= !auto;
            if (!this.hasAttribute('cssd-paused')) return;
            this.removeAttribute('cssd-paused');
            this.pauseCells();
            this._clock.since = performance.now();
            syncUTime(this);
            if (!this._offscreen) {
                for (let am of this.animations) {
                    am.resume();
                }
            }
            for (let nested of this.shadowRoot.querySelectorAll('css-doodle')) {
                nested.resume(auto);
            }
            this.syncSvgAnimations();
            this.restamp();
        }

        get currentTime() {
            return this._seek ?? this.clockNow();
        }

        set currentTime(ms) {
            ms = +ms || 0;
            if (!this._landed) {
                this._seek = ms;
                return;
            }
            this._clock = { base: ms, since: this.hasAttribute('cssd-paused') ? 0 : performance.now() };
            for (let animation of [...this.getAnimations(), ...this.shadowRoot.getAnimations()]) {
                if (animation.animationName) animation.currentTime = ms;
            }
            syncUTime(this);
            for (let am of this.animations) {
                am.seek(ms);
            }
            for (let nested of this.shadowRoot.querySelectorAll('css-doodle')) {
                nested.currentTime = ms;
            }
            this.syncSvgAnimations(ms);
            this.restamp();
        }

        // SMIL animations in inline svg (content, filter defs) ignore
        // animation-play-state, so they follow the paused attribute here
        syncSvgAnimations(ms) {
            let paused = this.hasAttribute('cssd-paused');
            let svgs = [
                ...this.shadowRoot.querySelectorAll('svg'),
                ...this.querySelectorAll(':scope>ft svg'),
            ];
            for (let svg of svgs) {
                paused ? svg.pauseAnimations() : svg.unpauseAnimations();
                if (!isNil(ms)) svg.setCurrentTime(ms / 1000);
            }
        }

        async export({ scale, name, download, detail } = {}) {
            // Wait for pending styles and their embedded images before serializing.
            await this._styleReady;
            let variables = getAllVariables(this);
            let html = serializeDoodle(this.shadowRoot);

            let { width, height } = this.getBoundingClientRect();
            scale = parseInt(scale) || 1;

            let w = width * scale;
            let h = height * scale;
            let fonts = await loadGoogleFontEmbed(this.compiled?.styles.gf ?? []);
            let svg = css`
                <svg ${NS} preserveAspectRatio="none" viewBox="0 0 ${width} ${height}" ${isSafari() ? '' : `width="${w}px" height="${h}px"`}>
                    <foreignObject width="100%" height="100%">
                        <div class="host" ${NSXHtml} style="width:${width}px;height:${height}px">
                            <style>${cdata(fonts + `.host{${variables}}` + TRANSITION_NONE)}</style>
                            ${html}
                        </div>
                    </foreignObject>
                </svg>
            `;

            if (download || detail) {
                let { source, blob } = await generatePng(svg, w, h, scale);
                if (download) {
                    let a = document.createElement('a');
                    a.download = (isNil(name) ? Date.now() : String(name).replace(/\.png$/, '')) + '.png';
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
