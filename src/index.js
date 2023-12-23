import parse_css from './parser/parse-css.js';
import parse_grid from './parser/parse-grid.js';
import parse_shaders from './parser/parse-shaders.js';

import generate_css from './generator/css.js';
import generate_shader from './generator/shader.js';
import generate_pattern from './generator/pattern.js';
import generate_png from './generator/svg-to-png.js';

import get_props from './utils/get-props.js';
import get_rgba_color from './utils/get-rgba-color.js';
import { get_variable, get_all_variables } from './utils/variables.js';
import Cache from './utils/cache.js';
import create_animation_frame from './utils/create-animation-frame.js';

import { NS, NSXHtml } from './utils/svg.js';
import { utime, umousex, umousey, uwidth, uheight } from './uniforms.js';

import {
  cell_id, is_nil,
  normalize_png_name, cache_image,
  is_safari, entity, un_entity,
} from './utils/index.js';

if (typeof customElements !== 'undefined') {
  class Doodle extends HTMLElement {
    constructor() {
      super();
      this.doodle = this.attachShadow({ mode: 'open' });
      this.animations = [];
      this.extra = {
        get_variable: name => get_variable(this, name),
        get_rgba_color: value => get_rgba_color(this.shadowRoot, value),
      };
    }

    connectedCallback(again) {
      if (this.innerHTML) {
        this.load(again);
      } else {
        setTimeout(() => this.load(again));
      }
    }

    disconnectedCallback() {
      this.cleanup();
    }

    cleanup() {
      Cache.clear();
      for (let animation of this.animations) {
        animation.cancel();
      }
      this.animations = [];
    }

    update(styles) {
      this.cleanup();
      // Use old rules to update
      if (!styles) {
        styles = un_entity(this._innerHTML);
      }
      if (this._innerHTML !== styles) {
        this._innerHTML = styles;
      }
      if (!this.grid_size) {
        this.grid_size = this.get_grid();
      }

      const { x: gx, y: gy, z: gz } = this.grid_size;
      const use = this.get_use();

      let old_content = '';
      if (this.compiled) {
        old_content = this.compiled.content;
      }

      const compiled = this.generate(parse_css(use + styles, this.extra));

      let grid = compiled.grid || this.get_grid();
      let { x, y, z } = grid;

      let should_rebuild = (
           !this.shadowRoot.innerHTML
        ||  this.shadowRoot.querySelector('css-doodle')
        || (gx !== x || gy !== y || gz !== z)
        || (JSON.stringify(old_content) !== JSON.stringify(compiled.content))
      );

      Object.assign(this.grid_size, grid);

      if (should_rebuild) {
        return compiled.grid
          ? this.build_grid(compiled, grid)
          : this.build_grid(this.generate(parse_css(use + styles, this.extra)), grid);
      }

      let replace = this.replace(compiled);
      let { keyframes, host, container, cells } = compiled.styles;

      let new_styles = replace(
        get_basic_styles() +
        get_grid_styles(this.grid_size) +
        keyframes + host + container + cells
      );
      if (compiled.props.has_animation) {
        this.set_content('style', '');
        setTimeout(() => {
          this.set_content('style', new_styles);
        });
      } else {
        this.set_content('style', new_styles);
      }
    }

    get grid() {
      return Object.assign({}, this.grid_size);
    }

    set grid(grid) {
      this.attr('grid', grid);
      this.connectedCallback(true);
    }

    get seed() {
      return this._seed_value;
    }

    set seed(seed) {
      this.attr('seed', seed);
      this.connectedCallback(true);
    }

    get use() {
      return this.attr('use');
    }

    set use(use) {
      this.attr('use', use);
      this.connectedCallback(true);
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
        use = `@use:${ use };`;
      }
      return use;
    }

    attr(name, value) {
      if (arguments.length === 1) {
        return this.getAttribute(name);
      }
      if (arguments.length === 2) {
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
      code = ':doodle { width:100%;height:100% }' + code;
      let parsed = parse_css(code, this.extra);
      let _grid = parse_grid('');
      let compiled = generate_css(parsed, _grid, this._seed_value, this.get_max_grid(), this._seed_random);
      let grid = compiled.grid ? compiled.grid : _grid;
      const { keyframes, host, container, cells } = compiled.styles;

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
      let grid_container = create_grid(grid, compiled.content);

      let size = (options && options.width && options.height)
        ? `width="${ options.width }" height="${ options.height }"`
        : '';

      replace(`
        <svg ${size} ${NS} preserveAspectRatio="none" ${viewBox}>
          <foreignObject width="100%" height="100%">
            <div class="host" width="100%" height="100%" ${NSXHtml}>
              <style>
                ${get_basic_styles()}
                ${get_grid_styles(grid)}
                ${host}
                ${container}
                ${cells}
                ${keyframes}
              </style>
              ${grid_container}
            </div>
          </foreignObject>
        </svg>
      `).then(result => {
        let source =`data:image/svg+xml;base64,${ window.btoa(unescape(encodeURIComponent(result))) }`;
        if (is_safari()) {
          cache_image(source);
        }
        fn(source);
      });
    }

    pattern_to_image({ code, cell, id }, fn) {
      let shader = generate_pattern(code, this.extra);
      this.shader_to_image({ shader, cell, id }, fn);
    }

    pause() {
      this.setAttribute('cssd-paused', true);
      for (let animation of this.animations) {
        animation.pause();
      }
    }

    resume() {
      this.removeAttribute('cssd-paused');
      for (let animation of this.animations) {
        animation.resume();
      }
    }

    shader_to_image({ shader, cell, id }, fn) {
      let parsed = typeof shader === 'string' ?  parse_shaders(shader) : shader;
      let element = this.doodle.getElementById(cell);
      const seed = this.seed;

      const set_shader_prop = (v) => {
        element.style.setProperty(id, `url(${v})`);
      }

      const tick = (value) => {
        if (typeof value === 'function') {
          let animation = create_animation_frame(t => {
            set_shader_prop(value(t));
          });
          this.animations.push(animation);
          return '';
        }
        set_shader_prop(value);
      }

      let { width, height } = element && element.getBoundingClientRect() || {
        width: 0, height: 0
      };

      let ratio = window.devicePixelRatio || 1;
      if (!parsed.textures.length || parsed.ticker) {
        generate_shader(parsed, width, height, seed).then(tick).then(fn);
      }
      // Need to bind textures first
      else {
        let transforms = parsed.textures.map(texture => {
          return new Promise(resolve => {
            this.doodle_to_image(texture.value, { width, height }, src => {
              let img = new Image();
              img.width = width * ratio;
              img.height = height * ratio;
              img.onload = () => resolve({ name: texture.name, value: img });
              img.src = src;
            });
          });
        });
        Promise.all(transforms).then(textures => {
          parsed.textures = textures;
          generate_shader(parsed, width, height, seed).then(tick).then(fn);
        });
      }
    }

    load(again) {
      this.cleanup();
      let use = this.get_use();
      let parsed = parse_css(use + un_entity(this.innerHTML), this.extra);
      let compiled = this.generate(parsed);

      if (!again) {
        if (this.hasAttribute('click-to-update')) {
          this.addEventListener('click', e => this.update());
        }
      }

      this.grid_size = compiled.grid
        ? compiled.grid
        : this.get_grid();

      this.build_grid(compiled, this.grid_size);
      this._innerHTML = this.innerHTML;
      this.innerHTML = '';
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
                let { arg, doodle } = doodles[id];
                this.doodle_to_image(doodle, { arg }, value => resolve({ id, value }));
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

    build_grid(compiled, grid) {
      const { has_transition, has_animation } = compiled.props;
      let has_delay = (has_transition || has_animation);
      const { keyframes, host, container, cells } = compiled.styles;
      const { uniforms, content } = compiled;

      let replace = this.replace(compiled);

      this.doodle.innerHTML = `
        <style></style>
        ${create_grid(grid, content)}
      `;

      let styles = replace(
        get_basic_styles() +
        get_grid_styles(grid) +
        keyframes + host + container + cells
      );

      if (has_delay) {
        setTimeout(() => {
          this.set_content('style', styles);
        }, 50);
      } else {
        this.set_content('style', styles);
      }

      if (uniforms.time) {
        this.register_utime();
      }
      if (uniforms.mousex || uniforms.mousey) {
        this.register_umouse(uniforms);
      } else {
        this.remove_umouse();
      }
      if (uniforms.width || uniforms.height) {
        this.register_usize(uniforms);
      } else {
        this.remove_usize();
      }
    }

    register_umouse(uniforms) {
      if (!this.umouse_fn) {
        this.umouse_fn = e => {
          let data = e.detail || e;
          if (uniforms.mousex) {
            this.style.setProperty('--' + umousex.name, data.offsetX);
          }
          if (uniforms.mousey) {
            this.style.setProperty('--' + umousey.name, data.offsetY);
          }
        }
        this.addEventListener('pointermove', this.umouse_fn);
        let event = new CustomEvent('pointermove', { detail: { offsetX: 0, offsetY: 0}});
        this.dispatchEvent(event);
      }
    }

    remove_umouse() {
      if (this.umouse_fn) {
        this.style.removeProperty('--' + umousex.name);
        this.style.removeProperty('--' + umousey.name);
        this.removeEventListener('pointermove', this.umouse_fn);
        this.umouse_fn = null;
      }
    }

    register_usize(uniforms) {
      if (!this.usize_observer) {
        const setProperty = () => {
          let box = this.getBoundingClientRect();
          if (uniforms.width) {
            this.style.setProperty('--' + uwidth.name, box.width);
          }
          if (uniforms.height) {
            this.style.setProperty('--' + uheight.name, box.height);
          }
        };
        setProperty();
        this.usize_observer = new ResizeObserver(entries => {
          for (let entry of entries) {
            let data = entry.contentBoxSize || entry.contentRect;
            if (data) setProperty();
          }
        });
        this.usize_observer.observe(this);
      }
    }

    remove_usize() {
      if (this.usize_observer) {
        this.style.removeProperty('--' + uwidth.name);
        this.style.removeProperty('--' + uheight.name);
        this.usize_observer.unobserve(this);
        this.usize_observer = null;
      }
    }

    register_utime() {
      if (!window.CSS || !window.CSS.registerProperty) {
        return false;
      }
      if (!this.is_utime_set) {
        try {
          CSS.registerProperty({
            name: '--' + utime.name,
            syntax: '<number>',
            initialValue: 0,
            inherits: true
          });
        } catch (e) {}
        this.is_utime_set = true;
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
          <svg ${NS}
            preserveAspectRatio="none"
            viewBox="0 0 ${width} ${height}"
            ${is_safari() ? '' : `width="${w}px" height="${h}px"`}
          >
            <foreignObject width="100%" height="100%">
              <div class="host" ${NSXHtml} style="width: ${width}px; height: ${height}px">
                <style>.host {${entity(variables)}}</style>
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
                a.download = normalize_png_name(name);
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

    set_content(selector, styles) {
      if (styles instanceof Promise) {
        styles.then(value => {
          this.set_content(selector, value);
        });
      } else {
        const el = this.shadowRoot.querySelector(selector);
        el && (el.styleSheet
          ? (el.styleSheet.cssText = styles )
          : (el.innerHTML = styles));
      }
    }
  }
  if (!customElements.get('css-doodle')) {
    customElements.define('css-doodle', Doodle);
  }
}

function get_basic_styles() {
  const inherited_grid_props = get_props(/grid/)
    .map(n => `${ n }: inherit;`)
    .join('');
  return `
    *,*::after,*::before {
      box-sizing: border-box;
    }
    :host, .host {
      display: block;
      visibility: visible;
      width: auto;
      height: auto;
      contain: content;
      box-sizing: border-box;
      --${utime.name}: 0
    }
    :host([hidden]), .host[hidden] {
      display: none
    }
    grid {
      position: relative;
      width: 100%;
      height: 100%;
      display: grid;
      ${inherited_grid_props}
    }
    cell {
      position: relative;
      display: grid;
      place-items: center
    }
    svg {
      position: absolute;
      width: 100%;
      height: 100%
    }
    :host([cssd-paused]),
    :host([cssd-paused]) * {
      animation-play-state: paused !important
    }
  `;
}

function get_grid_styles(grid_obj) {
  let { x, y } = grid_obj || {};
  return `
    :host, .host {
      grid-template-rows: repeat(${y}, 1fr);
      grid-template-columns: repeat(${x}, 1fr);
    }
  `;
}

function get_content(input) {
  return is_nil(input) ? '' : input;
}

function create_cell(x, y, z, content, child = '') {
  let id = cell_id(x, y, z);
  let head = get_content(content['#' + id]);
  let tail = get_content(child);
  return `<cell id="${id}">${head}${tail}</cell>`;
}

function create_grid(grid_obj, content) {
  let { x, y, z } = grid_obj || {};
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
  return `<grid>${result}</grid>`;
}
