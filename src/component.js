import parse_css from './parser/parse-css.js';
import parse_grid from './parser/parse-grid.js';
import parse_shaders from './parser/parse-shaders.js';

import generate_css from './generator/css.js';
import generate_shaders from './generator/shaders.js';
import generate_pattern from './generator/pattern.js';
import generate_png from './generator/svg-to-png.js';

import get_rgba_color from './utils/get-rgba-color.js';
import create_animation from './utils/create-animation.js';

import { get_variable, get_all_variables } from './utils/variables.js';
import { NS, NSXHtml } from './utils/svg.js';
import { utime, UTime, umousex, umousey, uwidth, uheight } from './uniforms.js';
import { cell_id, is_nil, get_png_name, cache_image, is_safari, un_entity, debounce } from './utils/index.js';

import { css } from './utils/tagged-template.js';
import { loadGoogleFontEmbed, loadGoogleFontLink } from './utils/google-font.js';

const Expose = {
  CSSDoodle: class {},
  define(name, element) {
    if (typeof customElements !== 'undefined' && !customElements.get(name)) {
      customElements.define(name, element);
    }
  }
}

const parse_cache = new Map();

function parse_css_cached(code, extra) {
  if (code.includes('@use')) {
    return parse_css(code, extra);
  }
  let parsed = parse_cache.get(code);
  if (!parsed) {
    if (parse_cache.size >= 64) {
      parse_cache.clear();
    }
    parsed = parse_css(code, extra);
    parse_cache.set(code, parsed);
  }
  return parsed;
}

if (typeof HTMLElement !== 'undefined') {
  Expose.CSSDoodle = class extends HTMLElement {
    static observedAttributes = [
      'grid', 'seed', 'use', 'experimental',
      'click-to-update', 'click:update',
      'auto:update',
    ];

    constructor() {
      super();
      this.doodle = this.attachShadow({ mode: 'open' });
      this.animations = [];
      this.observers = new Map();
      this.shader_renders = new Map();
      this.extra = {
        get_variable: name => get_variable(this, name),
        get_rgba_color: value => get_rgba_color(this.shadowRoot, value),
      };
    }

    connectedCallback(again) {
      if (this.innerHTML) {
        this.load(again);
        this._rendering = true;
      } else {
        // the source may not be parsed yet
        setTimeout(() => {
          this.load(again);
          this._rendering = true;
        });
      }
    }

    disconnectedCallback() {
      this.cleanup();
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
      } else {
        this.connectedCallback(true);
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
      return Object.assign({}, this.grid_size);
    }

    set grid(grid) {
      this.attr('grid', grid);
    }

    get seed() {
      return this._seed_value;
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

    get_max_grid() {
      return this.hasAttribute('experimental') ? 256 : 64;
    }

    get_grid() {
      return parse_grid(this.attr('grid'), this.get_max_grid());
    }

    get_use() {
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
      let cell = event.composedPath().find(el => el.tagName === 'CSSD-CELL');
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
      if (is_nil(interval)) {
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
      if (!is_nil(interval)) {
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
      let grid = this.get_grid();
      let seed = this.attr('seed') || this.attr('data-seed');
      if (is_nil(seed)) {
        seed = Date.now();
      }
      let compiled = this.compiled = generate_css(
        parsed, grid, seed, this.get_max_grid()
      );
      this._seed_value = compiled.seed;
      this._seed_random = compiled.random;
      return compiled;
    }

    load(again) {
      if (this._rendering) {
        return false;
      }
      this.cleanup();
      let code = this._code || this.innerHTML;
      let parsed = parse_css_cached(this.get_use() + un_entity(code), this.extra);
      let compiled = this.generate(parsed);

      if (!again) {
        if (this.hasAttribute('click-to-update') || this.hasAttribute('click:update')) {
          this.addEventListener('click', this.bindClickToUpdate);
        }
        this.addEventListener('click', this.dispatchCellClick);
      }

      this.grid_size = compiled.grid || this.get_grid();
      this.build_grid(compiled, this.grid_size);
      this._code = code;
      this.innerHTML = '';

      setTimeout(() => {
        this._rendering = false;
        this.triggerEvent('render');
      });
    }

    update(styles, options = {}) {
      this.triggerEvent('beforeUpdate');
      if (typeof styles === 'object' && styles !== null) {
        options = styles;
        styles = '';
      }

      let useAnimation = this.viewTransition;
      if (useAnimation === undefined) {
        useAnimation = this.hasAttribute('view-transition');
      }
      if (useAnimation && document.startViewTransition) {
        document.startViewTransition(() => {
          this._update(styles);
        });
      } else {
        this._update(styles);
      }
      if (!options.auto && (this.hasAttribute('auto:update') || this._auto_update_timer)) {
        this.autoUpdate();
      }
    }

    _update(styles) {
      this.cleanup();
      // reuse the old rules when called without new code
      if (!styles) {
        styles = un_entity(this._code);
      }
      this._code = styles;
      if (!this.grid_size) {
        this.grid_size = this.get_grid();
      }

      const old = this.compiled;
      const compiled = this.generate(
        parse_css_cached(this.get_use() + styles, this.extra));
      const grid = compiled.grid || this.get_grid();
      const rebuild = this.should_rebuild(compiled, old, grid);

      Object.assign(this.grid_size, grid);

      if (rebuild) {
        this.build_grid(compiled, grid);
      } else {
        this.patch(compiled, old.styles);
      }

      setTimeout(() => {
        this.triggerEvent('render');
        this.triggerEvent('afterUpdate');
        this.triggerEvent('update');
      });
    }

    should_rebuild(compiled, old, grid) {
      if (!old) {
        return true;
      }
      // no cells yet, or nested doodles pending as content
      if (!this.shadowRoot.innerHTML || this.shadowRoot.querySelector('css-doodle')) {
        return true;
      }
      let { x, y, z } = this.grid_size;
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

    /* refresh styles in place, keeping the cell elements */
    patch(compiled, old_styles) {
      this.bind_uniforms(compiled.uniforms);
      let replace = this.replace(compiled);
      if (compiled.props.has_animation) {
        // detach animations first so they restart with the new styles
        this.set_style(old_styles.all.replace(/animation/g, 'x'));
        this.reflow();
      }
      if (compiled.styles.gf) {
        loadGoogleFontLink(compiled.styles.gf);
      }
      this.set_style(replace(
        compiled.styles.top +
        get_basic_styles(this.grid_size) +
        compiled.styles.all
      ));
    }

    build_grid(compiled, grid) {
      const { has_transition, has_animation } = compiled.props;
      const { uniforms, content, styles } = compiled;
      const basic_styles = get_basic_styles(grid);
      const has_content = Object.keys(content).length;

      this.doodle.innerHTML = css`
        <style>${basic_styles + styles.main}</style>
        ${(styles.cells || styles.container || has_content) ? create_grid(grid, compiled) : ''}
      `;
      if (has_transition || has_animation) {
        this.reflow();
      }
      if (styles.gf) {
        loadGoogleFontLink(styles.gf);
      }
      let replace = this.replace(compiled);
      this.set_style(replace(styles.top + basic_styles + styles.all));
      if (has_content) {
        replace(Object.values(content).join(' '));
      }
      this.bind_uniforms(uniforms);
    }

    set_style(input) {
      if (input instanceof Promise) {
        input.then(v => this.set_style(v)).catch(console.error);
      } else {
        const el = this.shadowRoot.querySelector('style');
        if (el) {
          el.textContent = input.replace(/\n\s+/g, ' ');
        }
      }
    }

    reflow() {
      this.shadowRoot.querySelector('cssd-grid').offsetWidth;
    }

    cleanup() {
      if (this.compiled) {
        for (let am of this.animations) {
          am.cancel();
        }
        this.animations = [];
        let { pattern, shaders } = this.compiled;
        if (Object.keys(pattern).length || Object.keys(shaders).length) {
          for (let el of this.shadowRoot.querySelectorAll('cssd-cell')) {
            el.style.cssText = '';
          }
          this.observers.forEach(observer => {
            observer.disconnect();
          });
        }
        // clear shader CSS variables
        for (let id of Object.keys(shaders)) {
          this.style.removeProperty('--' + id);
        }
        for (let id of Object.keys(pattern)) {
          this.style.removeProperty('--' + id);
        }
      }
      this.observers.clear();
      this.shader_renders.forEach(({ canvas }) => {
        if (canvas && canvas.loseContext) {
          canvas.loseContext();
        }
      });
      this.shader_renders.clear();
      this.style.background = '';
    }

    pause() {
      this.setAttribute('cssd-paused', true);
      for (let am of this.animations) {
        am.pause();
      }
    }

    resume() {
      this.removeAttribute('cssd-paused');
      for (let am of this.animations) {
        am.resume();
      }
    }

    replace({ doodles, shaders, pattern }) {
      const groups = [
        [doodles, (v, fn) => this.doodle_to_image(v.doodle, { arg: v.arg, upextra: v.upextra }, fn)],
        [shaders, (v, fn) => this.shader_to_image(v, fn)],
        [pattern, (v, fn) => this.pattern_to_image(v, fn)],
      ];
      return input => {
        let tasks = [];
        for (let [map, to_image] of groups) {
          for (let [id, value] of Object.entries(map)) {
            if (input.includes(id)) {
              tasks.push(new Promise(resolve => {
                to_image(value, result => resolve({ id, result }));
              }));
            }
          }
        }
        if (!tasks.length) {
          return Promise.resolve(input);
        }
        return Promise.all(tasks).then(mappings => {
          for (let { id, result } of mappings) {
            /* doodle resolves to a data-uri, shader and pattern render
             * into CSS variables */
            let target = /^(shader|pattern)/.test(id)
              ? `var(--${id})`
              : `url(${result})`;
            input = input.replaceAll('${' + id + '}', target);
          }
          return input;
        }).catch(err => {
          console.error(err);
          return input;
        });
      }
    }

    doodle_to_image(code, options, fn) {
      if (typeof options === 'function') {
        fn = options;
        options = null;
      }
      options = options || {};
      code = ':doodle {width:100%;height:100%}' + code;
      let parsed = parse_css_cached(code, this.extra);
      let _grid = parse_grid('');
      let compiled = generate_css(parsed, _grid, this._seed_value, this.get_max_grid(), this._seed_random, options.upextra);
      let styles = compiled.styles || {};
      let grid = compiled.grid ? compiled.grid : _grid;
      let viewBox = '';
      if (options.arg) {
        let v = parse_grid(options.arg, Infinity);
        if (v.x && v.y) {
          options.width = v.x + 'px';
          options.height = v.y + 'px';
          viewBox = `viewBox="0 0 ${v.x} ${v.y}"`;
        }
      }

      let replace = this.replace(compiled);
      let grid_container = create_grid(grid, compiled);

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
                  ${get_basic_styles(grid)}
                  ${styles.all}
                ]]></style>
                ${grid_container}
              </div>
            </foreignObject>
          </svg>
        `))
        .then(result => {
          let source = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(result)))}`;
          if (is_safari() && size) {
            return generate_png(result, parseInt(options.width), parseInt(options.height), devicePixelRatio || 2)
              .then(({ blob }) => {
                let url = URL.createObjectURL(blob);
                cache_image(url);
                return url;
              });
          }
          if (is_safari()) {
            cache_image(source);
          }
          return source;
        })
        .then(fn)
        .catch(err => {
          console.error(err);
          fn('');
        });
    }

    pattern_to_image({ code, cell, id, arg, target }, fn) {
      let shader = generate_pattern(code, this.extra);
      this.shader_to_image({ shader, cell, id, arg, target }, fn);
    }

    shader_to_image({ shader, cell, id, arg, target }, fn) {
      let element;
      if (target.selector === ':host') {
        element = this;
      } else if (target.selector === ':container') {
        element = this.shadowRoot.querySelector('cssd-grid');
      } else {
        element = this.doodle.getElementById(cell);
      }

      let { width, height } = element.getBoundingClientRect();
      let cs;

      if (arg) {
        cs = parse_grid(arg, Infinity);
        if (cs.x && cs.y) {
          width = Math.min(cs.x, width);
          height = Math.min(cs.y, height);
        }
      }

      let seed = this.seed;
      let parsed = typeof shader === 'string' ? parse_shaders(shader) : shader;
      parsed.width = width;
      parsed.height = height;

      let sources = parsed.textures;
      let images = [];
      let ready = false;
      let last_w = 0, last_h = 0;

      const set_shader_prop = v => {
        this.style.setProperty(id, 'url("' + v + '")');
      }

      const tick = ([render, animated, canvas]) => {
        // release any context still held for this target before drawing again
        let existing = this.shader_renders.get(target.selector);
        if (existing && existing.canvas && existing.canvas.loseContext) {
          existing.canvas.loseContext();
        }
        this.shader_renders.delete(target.selector);

        render(0, width, height, this._umouse, images);
        last_w = width;
        last_h = height;
        ready = true;

        if (animated) {
          if (target.type === 'content') {
            element.replaceChildren(canvas);
            this.animations.push(create_animation(t => {
              render(t, width, height, this._umouse, images);
            }));
          } else {
            this.animations.push(create_animation(t => {
              render(t, width, height, this._umouse, images);
              set_shader_prop(canvas.toDataURL());
            }));
          }
          this.shader_renders.set(target.selector, { render, canvas, animated: true });
        } else {
          let data_url = canvas.toDataURL();
          if (target.type === 'content') {
            let img = new Image();
            img.style.cssText = 'position:absolute;width:100%;height:100%;object-fit:cover';
            img.src = data_url;
            element.replaceChildren(img);
          } else {
            set_shader_prop(data_url);
          }
          if (canvas.loseContext) {
            canvas.loseContext();
          }
        }
      }

      const transform = (sources, cb) => {
        let dpr = devicePixelRatio || 1;
        Promise.all(sources.map(({ name, value }) => {
          return new Promise(resolve => {
            this.doodle_to_image(value, { width, height }, src => {
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
        return generate_shaders(parsed, seed, target.type)
          .then(tick)
          .then(after)
          .catch(err => {
            console.error(err);
            if (after) after('');
          });
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

      if (!this.observers.has(target.selector)) {
        let observer = new ResizeObserver(debounce(() => {
          if (!ready) return;
          let rect = element.getBoundingClientRect();
          width = rect.width;
          height = rect.height;
          if (cs && cs.x && cs.y) {
            width = Math.min(cs.x, width);
            height = Math.min(cs.y, height);
          }
          if (width === last_w && height === last_h) return;
          last_w = width;
          last_h = height;
          let live = this.shader_renders.get(target.selector);
          if (live && live.animated) {
            // live context adapts to the new size on its next frame; just
            // refresh the textures the loop reads from the closure
            transform(sources, result => { images = result; });
          } else {
            // static render was baked to an image and its context freed: redraw
            run();
          }
        }));
        observer.observe(element);
        this.observers.set(target.selector, observer);
      }

      run(fn);
    }

    bind_uniforms({ time, mousex, mousey, mouse, width, height }) {
      if (time) {
        this.reg_utime();
      }
      if (mousex || mousey || mouse) {
        this.reg_umouse(mousex, mousey, mouse);
      } else {
        this.off_umouse();
      }
      if (width || height) {
        this.reg_usize(width, height);
      } else {
        this.off_usize();
      }
    }

    reg_utime() {
      if (!this.is_utime_set) {
        try {
          CSS.registerProperty({
            name: '--' + utime.name,
            syntax: '<integer>',
            initialValue: 0,
            inherits: true
          });
          CSS.registerProperty({
            name: '--' + UTime.name,
            syntax: '<integer>',
            initialValue: 0,
            inherits: true
          });
        } catch (e) {}
        this.is_utime_set = true;
      }
    }

    reg_umouse(mousex, mousey, mouse) {
      if (!this.umouse_fn) {
        this.umouse_fn = e => {
          let data = e.detail || e;
          if (mouse) {
            this._umouse = { x: data.offsetX, y: data.offsetY };
          }
          if (mousex || mousey) {
            this.style.setProperty('--' + umousex.name, data.offsetX);
            this.style.setProperty('--' + umousey.name, data.offsetY);
          }
        }
        this.addEventListener('pointermove', this.umouse_fn);
        let event = new CustomEvent('pointermove', { detail: { offsetX: 0, offsetY: 0 }});
        this.dispatchEvent(event);
      } else if (!(mousex || mousey || mouse)) {
        this.off_umouse();
      }
    }

    off_umouse() {
      if (this.umouse_fn) {
        this.style.removeProperty('--' + umousex.name);
        this.style.removeProperty('--' + umousey.name);
        this.removeEventListener('pointermove', this.umouse_fn);
        this.umouse_fn = null;
        delete this._umouse;
      }
    }

    reg_usize(width, height) {
      if (!this.usize_observer) {
        this.usize_observer = new ResizeObserver(() => {
          let box = this.getBoundingClientRect();
          if (width || height) {
            this.style.setProperty('--' + uwidth.name, box.width);
            this.style.setProperty('--' + uheight.name, box.height);
          }
        });
        this.usize_observer.observe(this);
      } else if (!(width || height)) {
        this.off_usize();
      }
    }

    off_usize() {
      if (this.usize_observer) {
        this.style.removeProperty('--' + uwidth.name);
        this.style.removeProperty('--' + uheight.name);
        this.usize_observer.unobserve(this);
        this.usize_observer = null;
      }
    }

    async export({ scale, name, download, detail } = {}) {
      let variables = get_all_variables(this);
      let html = this.doodle.innerHTML;

      let { width, height } = this.getBoundingClientRect();
      scale = parseInt(scale) || 1;

      let w = width * scale;
      let h = height * scale;
      let fonts = await loadGoogleFontEmbed();
      let svg = css`
          <svg ${NS} preserveAspectRatio="none" viewBox="0 0 ${width} ${height}" ${is_safari() ? '' : `width="${w}px" height="${h}px"`}>
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
        let { source, url, blob } = await generate_png(svg, w, h, scale);
        if (download) {
          let a = document.createElement('a');
          a.download = get_png_name(name);
          a.href = url;
          a.click();
        }
        return { width: w, height: h, svg, blob, source };
      }
      return { width: w, height: h, svg };
    }
  }
}

function get_basic_styles(grid) {
  let { x, y } = grid || {};
  return css`
    *,*::after,*::before,:host,.host {
      box-sizing: border-box;
    }
    :host,.host {
      display: block;
      visibility: visible;
      width: fit-content;
      height: fit-content;
      contain: content;
      view-transition-name: css-doodle;
      --${utime.name}: 0;
      --${UTime.name}: 0
    }
    :host([hidden]),[hidden] {
      display: none
    }
    :host([cssd-paused]),
    :host([cssd-paused]) * {
      animation-play-state: paused !important
    }
    cssd-grid, cssd-cell {
      display: grid;
      position: relative;
    }
    cssd-grid {
      gap: inherit;
      grid-template: repeat(${y},1fr)/repeat(${x},1fr)
    }
    b {
      position: absolute;
      inset: 0;
      pointer-events: none;
    }
    cssd-cell {
      place-items: center;
      min-height: 0;
      min-width: 0;
    }
    svg, canvas {
      position: absolute;
    }
    cssd-grid, svg, canvas {
      width: 100%;
      height: 100%
    }
    canvas {
      object-fit: cover;
    }
  `;
}

function create_cell(x, y, z, content, child = '') {
  let id = cell_id(x, y, z);
  let tail = child ?? '';
  let head = content['#' + id] ?? '';
  if (head.startsWith('${shader')) {
    head = '';
  }
  return `<cssd-cell id="${id}" part="cell">${head}${tail}</cssd-cell>`;
}

function create_grid(grid_obj, compiled) {
  let { x, y, z } = grid_obj || {};
  let { content, styles } = compiled;
  let result = '';
  if (z == 1) {
    for (let j = 1; j <= y; ++j) {
      for (let i = 1; i <= x; ++i) {
        result += create_cell(i, j, 1, content);
      }
    }
  }
  else {
    let child = '';
    for (let i = z; i >= 1; i--) {
      child = create_cell(1, 1, i, content, child);
    }
    result = child;
  }
  let html = `<cssd-grid part="grid">${result}</cssd-grid>`;
  if (styles.backdrop) {
    html += '<b></b>'
  }
  return html;
}

export const CSSDoodle = Expose.CSSDoodle;
export const define = Expose.define;
