import parse_css from './parser/parse-css.js';
import parse_grid from './parser/parse-grid.js';
import parse_shaders from './parser/parse-shaders.js';

import { generate_css } from './generator/css.js';
import { draw_shader } from './generator/shader.js';
import { draw_pattern } from './generator/pattern.js';
import { draw_canvas } from './generator/canvas.js';
import { svg_to_png } from './generator/svg-to-png.js';

import { seedrandom } from './lib/seedrandom.js';
import * as Uniforms from './uniforms.js';

import { get_props } from './utils/get-props.js';
import { get_variable, get_all_variables } from './utils/variables.js';
import { get_rgba_color } from './utils/get-rgba-color.js';
import Cache from './utils/cache.js';
import create_animation_frame from './utils/create-animation-frame.js';

import {
  make_tag_function,
  cell_id, is_nil,
  normalize_png_name, cache_image,
  is_safari, entity, un_entity,
  maybe
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
      Cache.clear();
      this.clear_animations();
    }

    update(styles) {
      this.disconnectedCallback();

      let use = this.get_use();
      if (!styles) styles = un_entity(this.innerHTML);
      this.innerHTML = styles;

      if (!this.grid_size) {
        this.grid_size = this.get_grid();
      }

      let { x: gx, y: gy, z: gz } = this.grid_size;

      const compiled = this.generate(
        parse_css(use + styles, this.extra)
      );

      if (!this.shadowRoot.innerHTML) {
        Object.assign(this.grid_size, compiled.grid);
        return this.build_grid(compiled, compiled.grid);
      }

      if (compiled.grid) {
        let { x, y, z } = compiled.grid;
        if (gx !== x || gy !== y || gz !== z) {
          Object.assign(this.grid_size, compiled.grid);
          return this.build_grid(compiled, compiled.grid);
        }
        Object.assign(this.grid_size, compiled.grid);
      }
      else {
        let grid = this.get_grid();
        let { x, y, z } = grid;
        if (gx !== x || gy !== y || gz !== z) {
          Object.assign(this.grid_size, grid);
          return this.build_grid(
            this.generate(parse_css(use + styles, this.extra)),
            grid
          );
        }
      }

      let replace = this.replace(compiled);
      this.set_content('.style-keyframes', replace(compiled.styles.keyframes));

      if (compiled.props.has_animation) {
        this.set_content('.style-cells', '');
        this.set_content('.style-container', '');
      }

      setTimeout(() => {
        this.set_content('.style-container', replace(
            get_grid_styles(this.grid_size)
          + compiled.styles.host
          + compiled.styles.container
        ));
        this.set_content('.style-cells', replace(compiled.styles.cells));
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

    static get observedAttributes() {
      return ['grid', 'use', 'seed'];
    }

    attributeChangedCallback(name, old_val, new_val) {
      if (old_val == new_val) {
        return false;
      }
      let observed = ['grid', 'use', 'seed'].includes(name);
      if (observed && !is_nil(old_val)) {
        this[name] = new_val;
      }
    }

    get_grid() {
      return parse_grid(this.attr('grid'));
    }

    get_use() {
      let use = this.attr('use') || '';
      if (use) use = `@use:${ use };`;
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

      seed = String(seed);
      this._seed_value = seed;

      let random = this.random = seedrandom(seed);
      let compiled = this.compiled = generate_css(parsed, grid, random);
      return compiled;
    }

    doodle_to_image(code, options, fn) {
      if (typeof options === 'function') {
        fn = options;
        options = null;
      }
      code = ':doodle { width:100%;height:100% }' + code;
      let parsed = parse_css(code, this.extra);
      let _grid = parse_grid({});
      let compiled = generate_css(parsed, _grid, this.random);
      let grid = compiled.grid ? compiled.grid : _grid;
      const { keyframes, host, container, cells } = compiled.styles;

      let replace = this.replace(compiled);
      let grid_container = create_grid(grid);

      let size = (options && options.width && options.height)
        ? `width="${ options.width }" height="${ options.height }"`
        : '';

      replace(`
        <svg ${ size } xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none">
          <foreignObject width="100%" height="100%">
            <div class="host" xmlns="http://www.w3.org/1999/xhtml">
              <style>
                ${ get_basic_styles() }
                ${ get_grid_styles(grid) }
                ${ host }
                ${ container }
                ${ cells }
                ${ keyframes }
              </style>
              <svg id="defs" xmlns="http://www.w3.org/2000/svg" style="width:0; height:0"></svg>
              ${ grid_container }
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

    pattern_to_image({ code, cell }, fn) {
      let shader = draw_pattern(code, this.extra);
      this.shader_to_image({ shader, cell }, fn);
    }

    canvas_to_image({ code }, fn) {
      draw_canvas(code).then(fn);
    }

    clear_animations() {
      for (let animation of this.animations) {
        animation.cancel();
      }
      this.animations = [];
    }

    shader_to_image({ shader, cell, id }, fn) {
      let parsed = typeof shader === 'string' ?  parse_shaders(shader) : shader;
      let element = this.doodle.getElementById(cell);

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
        draw_shader(parsed, width, height).then(tick).then(fn);
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
          draw_shader(parsed, width, height).then(tick).then(fn);
        });
      }
    }

    load(again) {
      let use = this.get_use();
      let parsed = parse_css(use + un_entity(this.innerHTML), this.extra);
      let compiled = this.generate(parsed);
      let { uniforms } = compiled;

      if (!again) {
        if (this.hasAttribute('click-to-update')) {
          this.addEventListener('click', e => this.update());
        }
      }

      this.grid_size = compiled.grid
        ? compiled.grid
        : this.get_grid();

      this.build_grid(compiled, this.grid_size);
    }

    replace({ doodles, shaders, canvas, pattern }) {
      let doodle_ids = Object.keys(doodles);
      let shader_ids = Object.keys(shaders);
      let canvas_ids = Object.keys(canvas);
      let pattern_ids = Object.keys(pattern);
      let length = doodle_ids.length + canvas_ids.length + shader_ids.length + pattern_ids.length;
      return input => {
        if (!length) {
          return Promise.resolve(input);
        }
        let mappings = [].concat(
          doodle_ids.map(id => {
            if (input.includes(id)) {
              return new Promise(resolve => {
                this.doodle_to_image(doodles[id], value => resolve({ id, value }));
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
          canvas_ids.map(id => {
            if (input.includes(id)) {
              return new Promise(resolve => {
                this.canvas_to_image(canvas[id], value => resolve({ id, value }));
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
            /* canvas uses css painting api */
            if (/^canvas/.test(id)) target = value;
            /* shader uses css vars */
            if (/^shader/.test(id)) target = `var(--${id})`;
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
      let style_container = get_grid_styles(grid) + host + container;
      let style_cells = has_delay ? '' : cells;

      const { uniforms } = compiled;

      let replace = this.replace(compiled);

      this.doodle.innerHTML = `
        <style>${ get_basic_styles() }</style>
        <style class="style-keyframes">${ keyframes }</style>
        <style class="style-container">${ style_container }</style>
        <style class="style-cells">${ style_cells }</style>
        <svg id="defs" xmlns="http://www.w3.org/2000/svg" style="width:0;height:0"></svg>
        ${ create_grid(grid) }
      `;

      this.set_content('.style-container', replace(style_container));

      if (has_delay) {
        setTimeout(() => {
          this.set_content('.style-cells', replace(cells));
        }, 50);
      } else {
        this.set_content('.style-cells', replace(cells));
      }

      if (uniforms.time) {
        this.register_uniform_time();
      }
      if (uniforms.mousex || uniforms.mousey) {
        this.register_uniform_mouse(uniforms);
      } else {
        this.remove_uniform_mouse();
      }
      if (uniforms.width || uniforms.height) {
        this.register_uniform_resolution(uniforms);
      } else {
        this.remove_uniform_resolution();
      }
    }

    register_uniform_mouse(uniforms) {
      if (!this.uniform_mouse_callback) {
        let { uniform_mousex, uniform_mousey } = Uniforms;
        this.uniform_mouse_callback = e => {
          let data = e.detail || e;
          if (uniforms.mousex) {
            this.style.setProperty('--' + uniform_mousex.name, data.offsetX);
          }
          if (uniforms.mousey) {
            this.style.setProperty('--' + uniform_mousey.name, data.offsetY);
          }
        }
        this.addEventListener('pointermove', this.uniform_mouse_callback);
        let event = new CustomEvent('pointermove', { detail: { offsetX: 0, offsetY: 0}});
        this.dispatchEvent(event);
      }
    }

    remove_uniform_mouse() {
      if (this.uniform_mouse_callback) {
        let { uniform_mousex, uniform_mousey } = Uniforms;
        this.style.removeProperty('--' + uniform_mousex.name);
        this.style.removeProperty('--' + uniform_mousey.name);
        this.removeEventListener('pointermove', this.uniform_mouse_callback);
        this.uniform_mouse_callback = null;
      }
    }

    register_uniform_resolution(uniforms) {
      if (!this.uniform_resolution_observer) {
        let { uniform_width, uniform_height } = Uniforms;
        const setProperty = () => {
          let box = this.getBoundingClientRect();
          if (uniforms.width) {
            this.style.setProperty('--' + uniform_width.name, box.width);
          }
          if (uniforms.height) {
            this.style.setProperty('--' + uniform_height.name, box.height);
          }
        };
        setProperty();
        this.uniform_resolution_observer = new ResizeObserver(entries => {
          for (let entry of entries) {
            let data = entry.contentBoxSize || entry.contentRect;
            if (data) setProperty();
          }
        });
        this.uniform_resolution_observer.observe(this);
      }
    }

    remove_uniform_resolution() {
      if (this.uniform_resolution_observer) {
        let { uniform_width, uniform_height } = Uniforms;
        this.style.removeProperty('--' + uniform_width.name);
        this.style.removeProperty('--' + uniform_height.name);
        this.uniform_resolution_observer.unobserve(this);
        this.uniform_resolution_observer = null;
      }
    }

    register_uniform_time() {
      if (!window.CSS || !window.CSS.registerProperty) {
        return false;
      }
      if (!this.is_uniform_time_registered) {
        let { uniform_time } = Uniforms;
        try {
          CSS.registerProperty({
            name: '--' + uniform_time.name,
            syntax: '<number>',
            initialValue: 0,
            inherits: true
          });
        } catch (e) {}
        this.is_uniform_time_registered = true;
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
          <svg xmlns="http://www.w3.org/2000/svg"
            preserveAspectRatio="none"
            viewBox="0 0 ${ width } ${ height }"
            ${ is_safari() ? '' : `width="${ w }px" height="${ h }px"` }
          >
            <foreignObject width="100%" height="100%">
              <div
                class="host"
                xmlns="http://www.w3.org/1999/xhtml"
                style="width: ${ width }px; height: ${ height }px; "
              >
                <style>.host { ${entity(variables)} }</style>
                ${ html }
              </div>
            </foreignObject>
          </svg>
        `;

        if (download || detail) {
          svg_to_png(svg, w, h, scale)
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
  let { uniform_time } = Uniforms;
  const inherited_grid_props = get_props(/grid/)
    .map(n => `${ n }: inherit;`)
    .join('');
  return `
    * {
      box-sizing: border-box
    }
    *::after, *::before {
      box-sizing: inherit
    }
    :host, .host {
      display: block;
      visibility: visible;
      width: auto;
      height: auto;
      --${ uniform_time.name }: 0
    }
    :host([hidden]), .host[hidden] {
      display: none
    }
    .container {
      position: relative;
      width: 100%;
      height: 100%;
      display: grid;
      ${ inherited_grid_props }
    }
    cell:empty {
      position: relative;
      line-height: 1;
      display: grid;
      place-items: center
    }
    svg {
      position: absolute;
      width: 100%;
      height: 100%;
    }
  `;
}

function get_grid_styles(grid_obj) {
  let { x, y } = grid_obj || {};
  return `
    :host, .host {
      grid-template-rows: repeat(${ y }, 1fr);
      grid-template-columns: repeat(${ x }, 1fr);
    }
  `;
}

function create_cell(x, y, z) {
  let cell = document.createElement('cell');
  cell.id = cell_id(x, y, z);
  return cell;
}

function create_grid(grid_obj) {
  let { x, y, z } = grid_obj || {};
  let grid = document.createElement('grid');
  let root = document.createDocumentFragment();
  if (z == 1) {
    for (let j = 1; j <= y; ++j) {
      for (let i = 1; i <= x; ++i) {
        root.appendChild(create_cell(i, j, 1));
      }
    }
  }
  else {
    let temp = null;
    for (let i = 1; i <= z; ++i) {
      let cell = create_cell(1, 1, i);
      (temp || root).appendChild(cell);
      temp = cell;
    }
    temp = null;
  }
  grid.className = 'container';
  grid.appendChild(root);
  return grid.outerHTML;
}

const CSSDoodle = make_tag_function(rules => {
  let doodle = document.createElement('css-doodle');
  if (doodle.update) {
    doodle.update(rules);
  }
  return doodle;
});

export {
  CSSDoodle,
}
