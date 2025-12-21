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

import { cache } from './cache.js';

const Expose = {
  CSSDoodle: class {},
  define(name, element) {
    if (typeof customElements !== 'undefined' && !customElements.get(name)) {
      customElements.define(name, element);
    }
  }
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
        setTimeout(() => {
          this.load(again);
          this._rendering = true;
        });;
      }
    }

    disconnectedCallback() {
      this.cleanup();
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

    _update(styles) {
      this.cleanup();
      // Use old rules to update
      if (!styles) {
        styles = un_entity(this._code);
      }
      if (this._code !== styles) {
        this._code = styles;
      }
      if (!this.grid_size) {
        this.grid_size = this.get_grid();
      }

      const { x: gx, y: gy, z: gz } = this.grid_size;
      const use = this.get_use();

      let old_content = '';
      let old_styles = {};
      if (this.compiled) {
        old_content = this.compiled.content;
        old_styles = this.compiled.styles;
      }

      const compiled = this.generate(parse_css(use + styles, this.extra));

      let grid = compiled.grid || this.get_grid();
      let { x, y, z } = grid;

      let should_rebuild = (
           !this.shadowRoot.innerHTML
        ||  this.shadowRoot.querySelector('css-doodle')
        || (gx !== x || gy !== y || gz !== z)
        || (JSON.stringify(old_content) !== JSON.stringify(compiled.content))
        || (!old_styles.cells || !compiled.styles.cells)
        || (old_styles.backdrop !== compiled.styles.backdrop)
      );

      Object.assign(this.grid_size, grid);

      if (should_rebuild) {
        compiled.grid
          ? this.build_grid(compiled, grid)
          : this.build_grid(this.generate(parse_css(use + styles, this.extra)), grid);
      } else {
        this.bind_uniforms(compiled.uniforms);
        let replace = this.replace(compiled);
        if (compiled.props.has_animation) {
          this.set_style(old_styles.all.replace(/animation/g, 'x'));
          this.reflow();
        }
        this.set_style(replace(
          compiled.styles.top +
          get_basic_styles(this.grid_size) +
          compiled.styles.all
        ));
      }

      setTimeout(() => {
        this.triggerEvent('render');
        this.triggerEvent('afterUpdate');
        this.triggerEvent('update');
      });
    }

    update(styles, options = {}) {
      this.triggerEvent('beforeUpdate');
      if (!document.startViewTransition) {
        return this._update(styles);
      }
      if (!arguments.length) {
        styles = '';
        options = {};
      }
      if (typeof styles === 'object') {
        options = styles;
        styles = '';
      }

      let useAnimation = this.viewTransition;
      if (useAnimation === undefined) {
        useAnimation = this.hasAttribute('view-transition');
      }
      if (useAnimation) {
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

    export({ scale, name, download, detail } = {}) {
      return new Promise((resolve, reject) => {
        let variables = get_all_variables(this);
        let html = this.doodle.innerHTML;

        let { width, height } = this.getBoundingClientRect();
        scale = parseInt(scale) || 1;

        let w = width * scale;
        let h = height * scale;

        let svg = `
          <svg ${NS} preserveAspectRatio="none" viewBox="0 0 ${width} ${height}" ${is_safari() ? '' : `width="${w}px" height="${h}px"`}>
            <foreignObject width="100%" height="100%">
              <div class="host" ${NSXHtml} style="width:${width}px;height:${height}px">
                <style><![CDATA[
                  .host{${variables}}
                ]]></style>
                ${html}
              </div>
            </foreignObject>
          </svg>
        `;

        if (download || detail) {
          generate_png(svg, w, h, scale)
            .then(({ source, url, blob }) => {
              resolve({
                width: w, height: h, svg, blob, source
              });
              if (download) {
                let a = document.createElement('a');
                a.download = get_png_name(name);
                a.href = url;
                a.click();
              }
            })
            .catch(error => {
              reject(error);
            });
        } else {
          resolve({
            width: w, height: h, svg: svg
          });
        }
      });
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

    attributeChangedCallback(name, oldValue, newValue) {
      if (oldValue !== newValue && Expose.CSSDoodle.observedAttributes.includes(name)) {
        if (name === 'click-to-update' || name === 'click:update') {
          if (newValue === null) {
            this.removeEventListener('click', this.bindClickToUpdate);
            this.removeAttribute('click-to-update');
            this.removeAttribute('click:update');
          } else if(oldValue === null) {
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
    }

    get_max_grid() {
      return this.hasAttribute('experimental') ? 256 : 64;
    }

    get_grid() {
      return parse_grid(this.attr('grid'), this.get_max_grid());
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

    cancelAutoUpdate(options = {}) {
      clearInterval(this._auto_update_timer);
      this._auto_update_timer = null;
      this.removeAttribute('auto:update');
      this.removeAttribute('data-interval');
    }

    get_use() {
      let use = String(this.attr('use') || '').trim();
      if (/^var\(/.test(use)) {
        use = `@use:${use};`;
      }
      return use;
    }

    cleanup() {
      cache.clear();
      if (this.compiled) {
        for (let am of this.animations) {
          am.cancel();
        }
        this.animations = [];
        let { pattern, shaders } = this.compiled;
        if (Object.keys(pattern).length || Object.keys(shaders).length) {
          for (let el of this.shadowRoot.querySelectorAll('cell')) {
            el.style.cssText = '';
          }
          this.observers.forEach((observer, target) => {
            observer.disconnect();
          });
        }
      }
      this.observers.clear();
      this.shader_renders.clear();
      this.style.background = '';
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

    doodle_to_image(code, options, fn) {
      if (typeof options === 'function') {
        fn = options;
        options = null;
      }
      code = ':doodle {width:100%;height:100%}' + code;
      let parsed = parse_css(code, this.extra);
      let _grid = parse_grid('');
      let compiled = generate_css(parsed, _grid, this._seed_value, this.get_max_grid(), this._seed_random, options.upextra);
      let styles = compiled.styles || {};
      let grid = compiled.grid ? compiled.grid : _grid;
      let viewBox = '';
      if (options && options.arg) {
        let v = parse_grid(options.arg, Infinity);
        if (v.x && v.y) {
          options.width = v.x + 'px';
          options.height = v.y + 'px';
          viewBox = `viewBox="0 0 ${v.x} ${v.y}"`;
        }
      }

      let replace = this.replace(compiled);
      let grid_container = create_grid(grid, compiled);

      let size = (options && options.width && options.height)
        ? `width="${options.width}" height="${options.height}"`
        : '';

      replace(`
        <svg ${size} ${NS} preserveAspectRatio="none" ${viewBox}>
          <foreignObject width="100%" height="100%">
            <div class="host" width="100%" height="100%" ${NSXHtml}>
              <style><![CDATA[
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
      `).then(result => {
        let source =`data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(result)))}`;
        if (is_safari()) {
          if (size) {
            generate_png(result, parseInt(options.width), parseInt(options.height), devicePixelRatio || 2).then(({ blob }) => {
              let url = URL.createObjectURL(blob);
              cache_image(url);
              fn(url);
            });
          } else {
            cache_image(source);
            fn(source);
          }
        } else {
          fn(source);
        }
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
        element = this.shadowRoot.querySelector('grid');
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

      const set_shader_prop = v => {
        element.style.setProperty('background', 'url("' + v + '") no-repeat 50%/cover');
      }
      const tick = ([render, animated, canvas]) => {
        if (target.type === 'content') {
          render(0, width, height, this._umouse, images);
          element.replaceChildren(canvas);
          if (animated) {
            this.animations.push(create_animation(t => {
              render(t, width, height, this._umouse, images);
            }));
          } else {
            if (!this.shader_renders.has(target.selector)) {
              this.shader_renders.set(target.selector, { render, canvas });
            }
          }
        } else {
          if (animated) {
            this.animations.push(create_animation(t => {
              render(t, width, height, this._umouse, images);
              set_shader_prop(canvas.toDataURL());
            }));
          } else {
            let _render = this.shader_renders.get(target.selector);
            if (!_render) {
              this.shader_renders.set(target.selector, { render, canvas });
            }
            render(0, width, height, this._umouse, images);
            set_shader_prop(canvas.toDataURL());
          }
        }
      }

      const transform = (sources, fn) => {
        let dpr = devicePixelRatio || 1;
        Promise.all(sources.map(({ name, value }) => {
          return new Promise(resolve => {
            this.doodle_to_image(value, {width, height}, src => {
              let img = new Image();
              img.width = width * dpr;
              img.height = height * dpr;
              img.onload = () => resolve({ name, value: img });
              img.src = src;
            });
          });
        })).then(fn);
      }

      if (!this.observers.has(target.selector)) {
        let observer = new ResizeObserver(debounce(() => {
          let rect = element.getBoundingClientRect();
          width = rect.width;
          height = rect.height;
          if (cs && cs.x && cs.y) {
            width = Math.min(cs.x, width);
            height = Math.min(cs.y, height);
          }
          transform(sources, result => {
            images = result;
            let render = this.shader_renders.get(target.selector);
            if (render) {
              render.render(0, width, height, this._umouse, images);
              if (target.type === 'background') {
                set_shader_prop(render.canvas.toDataURL());
              }
            }
          });
        }));
        observer.observe(element);
        this.observers.set(target.selector, observer);
      }

      if (sources.length) {
        transform(sources, result => {
          parsed.textures = images = result;
          parsed.width = width;
          parsed.height = height;
          generate_shaders(parsed, seed, target.type).then(tick).then(fn);
        });
      } else {
        generate_shaders(parsed, seed, target.type).then(tick).then(fn);
      }
    }

    bindClickToUpdate() {
      this.update();
    }

    load(again) {
      if (this._rendering) {
        return false;
      }
      this.cleanup();
      let code = this._code || this.innerHTML;
      let use = this.get_use();
      let parsed = parse_css(use + un_entity(code), this.extra);
      let compiled = this.generate(parsed);

      if (!again) {
        if (this.hasAttribute('click-to-update') || this.hasAttribute('click:update')) {
          this.addEventListener('click', this.bindClickToUpdate);
        }
      }

      this.grid_size = compiled.grid
        ? compiled.grid
        : this.get_grid();

      this.build_grid(compiled, this.grid_size);
      this._code = code;
      this.innerHTML = '';

      setTimeout(() => {
        this._rendering = false;
        this.triggerEvent('render');
      });
    }

    replace({ doodles, shaders, pattern }) {
      let doodle_ids = Object.keys(doodles);
      let shader_ids = Object.keys(shaders);
      let pattern_ids = Object.keys(pattern);
      let length = doodle_ids.length + shader_ids.length + pattern_ids.length;
      return input => {
        if (!length) {
          return Promise.resolve(input);
        }
        let mappings = [].concat(
          doodle_ids.map(id => {
            if (input.includes(id)) {
              return new Promise(resolve => {
                let { arg, doodle, upextra } = doodles[id];
                this.doodle_to_image(doodle, { arg, upextra }, value => resolve({ id, value }));
              });
            } else {
              return Promise.resolve('');
            }
          }),
          shader_ids.map(id => {
            if (input.includes(id)) {
              return new Promise(resolve => {
                this.shader_to_image(shaders[id], value => resolve({ id, value }));
              });
            } else {
              return Promise.resolve('');
            }
          }),
          pattern_ids.map(id => {
            if (input.includes(id)) {
              return new Promise(resolve => {
                this.pattern_to_image(pattern[id], value => resolve({ id, value }));
              });
            } else {
              return Promise.resolve('');
            }
          }),
        );

        return Promise.all(mappings).then(mapping => {
          for (let {id, value} of mapping) {
            /* default to data-uri for doodle and pattern */
            let target = `url(${value})`;
            /* shader uses css vars */
            if (/^shader|^pattern/.test(id)) target = `var(--${id})`;
            input = input.replaceAll('${' + id + '}', target);
          }
          return input;
        });
      }
    }

    reflow() {
      this.shadowRoot.querySelector('grid').offsetWidth;
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

    build_grid(compiled, grid) {
      const { has_transition, has_animation } = compiled.props;
      const { uniforms, content, styles } = compiled;
      let has_delay = (has_transition || has_animation);
      let has_content = Object.keys(content).length;
      this.doodle.innerHTML = `
        <style>${get_basic_styles(grid) + styles.main}</style>
        ${(styles.cells || styles.container || has_content) ? create_grid(grid, compiled) : ''}
      `;
      if (has_delay) {
        this.reflow();
      }
      let replace = this.replace(compiled);
      this.set_style(replace(
        styles.top +
        get_basic_styles(grid) +
        styles.all
      ));
      if (has_content) {
        replace(Object.values(compiled.content).join(' '));
      }
      this.bind_uniforms(uniforms);
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
        let event = new CustomEvent('pointermove', { detail: { offsetX: 0, offsetY: 0}});
        this.dispatchEvent(event);
      } else {
        if (!(mousex || mousey || mouse)) {
          this.off_umouse();
        }
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
      } else {
        if (!(width || height)) {
          this.off_usize();
        }
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

    set_style(input) {
      if (input instanceof Promise) {
        input.then(v => {
          this.set_style(v);
        });
      } else {
        const el = this.shadowRoot.querySelector('style');
        if (el) {
          el.textContent = input.replace(/\n\s+/g, ' ');
        }
      }
    }
  }
}

function get_basic_styles(grid) {
  let { x, y } = grid || {};
  return `
    *,*::after,*::before,:host,.host {
      box-sizing: border-box;
    }
    :host,.host {
      display: block;
      visibility: visible;
      width: auto;
      height: auto;
      contain: strict;
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
    grid, cell {
      display: grid;
      position: relative;
    }
    grid {
      gap: inherit;
      grid-template: repeat(${y},1fr)/repeat(${x},1fr)
    }
    b {
      position: absolute;
      inset: 0;
      pointer-events: none;
    }
    cell {
      place-items: center;
      min-height: 0;
      min-width: 0;
    }
    svg, canvas {
      position: absolute;
    }
    grid, svg, canvas {
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
  return `<cell id="${id}" part="cell">${head}${tail}</cell>`;
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
      let cell = create_cell(1, 1, i, content, child);
      child = cell;
    }
    result = child;
  }
  let html = `<grid part="grid">${result}</grid>`;
  if (styles.backdrop) {
    html += '<b></b>'
  }
  return html;
}

export const CSSDoodle = Expose.CSSDoodle;
export const define = Expose.define;
