import parse_css from './parser/parse-css';
import parse_grid from './parser/parse-grid';
import parse_shaders from './parser/parse-shaders';
import generator from './generator';
import seedrandom from './lib/seedrandom';
import { svg_to_png } from './svg';
import { draw_shader } from './shader.js';
import { uniform_time } from './uniform';

import get_props from './utils/get-props';
import { get_variable, get_all_variables } from './utils/variables';
import { make_tag_function } from './utils/index';

import {
  cell_id, is_nil,
  normalize_png_name, cache_image,
  is_safari, un_entity,
  maybe
} from './utils/index';

class Doodle extends HTMLElement {
  constructor() {
    super();
    this.doodle = this.attachShadow({ mode: 'open' });
    this.extra = {
      get_variable: name => get_variable(this, name)
    };
  }

  connectedCallback(again) {
    if (/^(complete|interactive|loaded)$/.test(document.readyState)) {
      this.load(again);
    } else {
      setTimeout(() => this.load(again));
    }
  }

  update(styles) {
    let use = this.get_use();
    if (!styles) styles = this.innerHTML;
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

    let svg_paths = this.build_svg_paths(compiled.paths);
    if (svg_paths) {
      let defs = this.shadowRoot.querySelector('.svg-defs');
      if (defs) {
        defs.innerHTML = svg_paths;
      }
    }

    if (compiled.uniforms.time) {
      this.register_uniform_time();
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
    let compiled = this.compiled = generator(parsed, grid, random);
    return compiled;
  }

  doodle_to_image(code, options, fn) {
    if (typeof options === 'function') {
      fn = options;
      options = null;
    }
    let parsed = parse_css(code, this.extra);
    let _grid = parse_grid({});
    let compiled = generator(parsed, _grid, this.random);
    let grid = compiled.grid ? compiled.grid : _grid;
    const { keyframes, host, container, cells } = compiled.styles;
    let svg_defs = this.build_svg_paths(compiled.paths);

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
            <svg xmlns="http://www.w3.org/2000/svg" style="width:0; height:0">
              <defs class="svg-defs">${ svg_defs }</defs>
            </svg>
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

  shader_to_image({ shader, cell }, fn) {
    let parsed = parse_shaders(shader);
    let element = this.doodle.getElementById(cell);
    let { width = 0, height = 0} = element && element.getBoundingClientRect() || {};
    let ratio = window.devicePixelRatio || 1;

    if (!parsed.textures.length) {
      draw_shader(parsed, width, height).then(fn);
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
        draw_shader(parsed, width, height).then(fn);
      });
    }
  }

  load(again) {
    if (!again) {
      if (this.hasAttribute('click-to-update')) {
        this.addEventListener('click', e => this.update());
      }
    }
    let use = this.get_use();
    if (!this.innerHTML.trim() && !use) {
      return false;
    }
    let parsed = parse_css(use + un_entity(this.innerHTML), this.extra);
    let compiled = this.generate(parsed);

    this.grid_size = compiled.grid
      ? compiled.grid
      : this.get_grid();

    this.build_grid(compiled, this.grid_size);
  }

  replace({ doodles, shaders, paths }) {
    let doodle_ids = Object.keys(doodles);
    let shader_ids = Object.keys(shaders);
    let path_ids = Object.keys(paths);
    return input => {
      if (!doodle_ids.length && !shader_ids.length && !path_ids.length) {
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
        path_ids.map(id => {
          if (input.includes(id)) {
            return Promise.resolve({ id, value: '#' + id });
          } else {
            return Promise.resolve('');
          }
        })
      );

      return Promise.all(mappings).then(mapping => {
        if (input.replaceAll) {
          mapping.forEach(({ id, value }) => {
            input = input.replaceAll('${' + id + '}', `url(${value})`);
          });
        } else {
          mapping.forEach(({ id, value }) => {
            input = input.replace('${' + id + '}', `url(${value})`);
          });
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
    let svg_defs = this.build_svg_paths(compiled.paths);

    const { uniforms } = compiled;

    let replace = this.replace(compiled);

    this.doodle.innerHTML = `
      <style>${ get_basic_styles(uniforms) }</style>
      <style class="style-keyframes">${ keyframes }</style>
      <style class="style-container">${ style_container }</style>
      <style class="style-cells">${ style_cells }</style>
      <svg xmlns="http://www.w3.org/2000/svg" style="width:0;height:0">
        <defs class="svg-defs">${ svg_defs }</defs>
      </svg>
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

    // might be removed in the future
    const definitions = compiled.definitions;
    if (window.CSS && window.CSS.registerProperty) {
      try {
        if (uniforms.time) {
          this.register_uniform_time();
        }
        definitions.forEach(CSS.registerProperty);
      } catch (e) { }
    }
  }

  build_svg_paths(paths) {
    let names = Object.keys(paths || {});
    return names.map(name => `
      <clipPath id="${ paths[name].id }" clipPathUnits="objectBoundingBox">
        <path d="${ paths[name].commands }" />
      </clipPath>
    `).join('');
  }

  register_uniform_time() {
    if (!this.is_uniform_time_registered) {
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

      let svg = minify(`
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
              <style>.host { ${variables} }</style>
              ${ html }
            </div>
          </foreignObject>
        </svg>
      `);

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

function get_basic_styles(uniforms = {}) {
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

function minify(input) {
  return input
    .replace(/\n\s+|^\s+|\n+/g, ' ')
    .trim();
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

export default CSSDoodle;
