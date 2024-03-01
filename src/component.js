import parse_css from './parser/parse-css.js';
import parse_grid from './parser/parse-grid.js';
import parse_shaders from './parser/parse-shaders.js';

import generate_css from './generator/css.js';
import generate_shader from './generator/shader.js';
import generate_pattern from './generator/pattern.js';
import generate_png from './generator/svg-to-png.js';

import get_rgba_color from './utils/get-rgba-color.js';
import create_animation from './utils/create-animation.js';

import { get_variable, get_all_variables } from './utils/variables.js';
import { NS, NSXHtml } from './utils/svg.js';
import { utime, umousex, umousey, uwidth, uheight } from './uniforms.js';
import { cell_id, is_nil, get_png_name, cache_image, is_safari, entity, un_entity } from './utils/index.js';

import { cache } from './cache.js';

export class CSSDoodle extends HTMLElement {
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

  update(styles) {
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
    let old_styles = '';
    if (this.compiled) {
      old_content = this.compiled.content;
      old_styles = this.compiled.styles.all;
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
    if (compiled.props.has_animation) {
      this.set_style(old_styles.replace(/animation/g, 'x'));
      this.reflow();
    }
    this.set_style(replace(
      get_basic_styles(this.grid_size) +
      compiled.styles.all
    ));
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
        <svg ${NS}
          preserveAspectRatio="none"
          viewBox="0 0 ${width} ${height}"
          ${is_safari() ? '' : `width="${w}px" height="${h}px"`}
        >
          <foreignObject width="100%" height="100%">
            <div class="host" ${NSXHtml} style="width:${width}px;height:${height}px">
              <style>.host{${entity(variables)}}</style>
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
      }
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
    let compiled = generate_css(parsed, _grid, this._seed_value, this.get_max_grid(), this._seed_random);
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
    let grid_container = create_grid(grid, compiled.content);

    let size = (options && options.width && options.height)
      ? `width="${options.width}" height="${options.height}"`
      : '';

    replace(`
      <svg ${size} ${NS} preserveAspectRatio="none" ${viewBox}>
        <foreignObject width="100%" height="100%">
          <div class="host" width="100%" height="100%" ${NSXHtml}>
            <style>
              ${get_basic_styles(grid)}
              ${compiled.styles.all}
            </style>
            ${grid_container}
          </div>
        </foreignObject>
      </svg>
    `).then(result => {
      let source =`data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(result)))}`;
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

  shader_to_image({ shader, cell, id }, fn) {
    const element = this.doodle.getElementById(cell);
    if (!element) {
      return false;
    }
    let { width, height } = element.getBoundingClientRect();
    let ratio = devicePixelRatio || 1;
    let seed = this.seed;
    let parsed = typeof shader === 'string' ? parse_shaders(shader) : shader;
    parsed.width = width;
    parsed.height = height;

    let sources = parsed.textures;
    let images = [];

    const set_shader_prop = v => {
      element.style.setProperty(id, `url(${v})`);
    }

    const tick = v => {
      if (typeof v === 'function') {
        this.animations.push(create_animation(t => {
          set_shader_prop(v(t, width, height, images));
        }));
      } else {
        set_shader_prop(v);
      }
    }

    const transform = (sources, fn) => {
      Promise.all(sources.map(({ name, value }) => {
        return new Promise(resolve => {
          this.doodle_to_image(value, {width, height}, src => {
            let img = new Image();
            img.width = width * ratio;
            img.height = width * ratio;
            img.onload = () => resolve({ name, value: img });
            img.src = src;
          });
        });
      })).then(fn);
    }

    if (!element.observer) {
      element.observer = new ResizeObserver(() => {
        let rect = element.getBoundingClientRect();
        width = rect.width;
        height = rect.height;
        transform(sources, result => images = result);
      });
      element.observer.observe(element);
    }

    if (sources.length) {
      transform(sources, result => {
        parsed.textures = images = result;
        parsed.width = width;
        parsed.height = height;
        generate_shader(parsed, seed).then(tick).then(fn);
      });
    } else {
      generate_shader(parsed, seed).then(tick).then(fn);
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
    this._code = this.innerHTML;
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

  reflow() {
    this.shadowRoot.querySelector('grid').offsetWidth;
  }

  build_grid(compiled, grid) {
    const { has_transition, has_animation } = compiled.props;
    let has_delay = (has_transition || has_animation);
    const { uniforms, content, styles } = compiled;

    this.doodle.innerHTML = `
      <style>${get_basic_styles(grid) + styles.main}</style>
      ${create_grid(grid, content)}
    `;
    if (has_delay) {
      this.reflow();
    }
    let replace = this.replace(compiled);
    this.set_style(replace(
      get_basic_styles(grid) +
      styles.all
    ));
    if (uniforms.time) {
      this.reg_utime();
    }
    if (uniforms.mousex || uniforms.mousey) {
      this.reg_umouse(uniforms);
    } else {
      this.off_umouse();
    }
    if (uniforms.width || uniforms.height) {
      this.reg_usize(uniforms);
    } else {
      this.off_usize();
    }
  }

  reg_umouse(uniforms) {
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

  off_umouse() {
    if (this.umouse_fn) {
      this.style.removeProperty('--' + umousex.name);
      this.style.removeProperty('--' + umousey.name);
      this.removeEventListener('pointermove', this.umouse_fn);
      this.umouse_fn = null;
    }
  }

  reg_usize(uniforms) {
    if (!this.usize_observer) {
      this.usize_observer = new ResizeObserver(() => {
        let box = this.getBoundingClientRect();
        if (uniforms.width) {
          this.style.setProperty('--' + uwidth.name, box.width);
        }
        if (uniforms.height) {
          this.style.setProperty('--' + uheight.name, box.height);
        }
      });
      this.usize_observer.observe(this);
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
          syntax: '<number>',
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

export function define(name, element) {
  if (customElements !== 'undefined' && !customElements.get(name)) {
    customElements.define(name, element);
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
      --${utime.name}: 0
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
    cell {
      place-items: center
    }
    svg {
      position: absolute;
    }
    grid, svg {
      width: 100%;
      height: 100%
    }
  `;
}

function create_cell(x, y, z, content, child = '') {
  let id = cell_id(x, y, z);
  let head = content['#' + id] ?? '';
  let tail = child ?? '';
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
