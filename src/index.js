import parse_css from './parser/parse-css';
import parse_grid from './parser/parse-grid';
import generator from './generator';
import get_props from './utils/get-props';
import seedrandom from './lib/seedrandom';
import { cell_id, is_nil, normalize_png_name } from './utils/index';

class Doodle extends HTMLElement {
  constructor() {
    super();
    this.doodle = this.attachShadow({ mode: 'open' });
    this.extra = {
      get_variable: this.get_variable.bind(this)
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

    this.set_content('.style-keyframes', compiled.styles.keyframes);

    if (compiled.props.has_animation) {
      this.set_content('.style-cells', '');
      this.set_content('.style-container', '');
    }

    setTimeout(() => {
      this.set_content('.style-container',
          get_grid_styles(this.grid_size)
        + compiled.styles.host
        + compiled.styles.container
      );
      this.set_content('.style-cells', compiled.styles.cells);
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

    let random = seedrandom(seed);
    let compiled = this.compiled = generator(parsed, grid, random);
    return compiled;
  }

  load(again) {
    let use = this.get_use();
    if (!this.innerHTML.trim() && !use) {
      return false;
    }

    let parsed = parse_css(use + this.innerHTML, this.extra);
    let compiled = this.generate(parsed);

    this.grid_size = compiled.grid
      ? compiled.grid
      : this.get_grid();

    this.build_grid(compiled, this.grid_size);

    if (!again) {
      if (this.hasAttribute('click-to-update')) {
        this.addEventListener('click', e => this.update());
      }
    }
  }

  get_variable(name) {
    return getComputedStyle(this).getPropertyValue(name)
      .trim()
      .replace(/^\(|\)$/g, '');
  }

  build_grid(compiled, grid) {
    const { has_transition, has_animation } = compiled.props;
    const { keyframes, host, container, cells } = compiled.styles;
    const definitions = compiled.definitions;

    this.doodle.innerHTML = `
      <style>
        ${ get_basic_styles() }
      </style>
      <style class="style-keyframes">
        ${ keyframes }
      </style>
      <style class="style-container">
        ${ get_grid_styles(grid) }
        ${ host }
        ${ container }
      </style>
      <style class="style-cells">
        ${ (has_transition || has_animation) ? '' : cells }
      </style>
      <grid class="container"></grid>
    `;

    this.doodle.querySelector('.container')
      .appendChild(create_cells(grid));

    if (has_transition || has_animation) {
      setTimeout(() => {
        this.set_content('.style-cells', cells);
      }, 50);
    }

    // might be removed in the future
    if (window.CSS && window.CSS.registerProperty) {
      try {
        definitions.forEach(CSS.registerProperty);
      } catch (e) { }
    }
  }

  export({ scale, autoSize } = {}) {
    const { has_transition, has_animation } = this.compiled.props;
    const { keyframes, host, container, cells } = this.compiled.styles;
    const grid = this.grid_size;

    let html = `
      <style>
        ${ get_basic_styles() }
        ${ get_grid_styles(grid) }
        ${ host }
        ${ container }
        ${ cells }
        ${ keyframes }
      </style>
      ${ this.doodle.querySelector('.container').outerHTML }
    `;

    let { width, height } = this.getBoundingClientRect();
    scale = parseInt(scale) || 1;
    let w = width * scale;
    let h = height * scale;

    let svg = minify(`
      <svg xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 ${ width } ${ height }"
        ${ autoSize ? '' : `
          width="${ w }px"
          height="${ h }px"
        `}
      >
        <foreignObject width="100%" height="100%">
          <div xmlns="http://www.w3.org/1999/xhtml" class="host">
            ${ html }
          </div>
        </foreignObject>
      </svg>
    `);
    return {
      width: w,
      height: h,
      svg
    };
  }

  toPNG(scale, name) {
    let { width, height, svg } = this.export({ scale });
    const source = `data:image/svg+xml;utf8,${ encodeURIComponent(svg) }`;
    const img = new Image();
    img.src = source;
    img.onload = () => {
      let canvas = document.createElement('canvas');
      let ctx = canvas.getContext('2d');
      canvas.width = width;
      canvas.height = height;
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(blob => {
        let url;
        try {
          url = URL.createObjectURL(blob);
        } catch (e) {
          return console.warn(
            `Overload resolution ${ width }x${ height }'. Try to decrease the scale value!`
          );
        }
        let a = document.createElement('a');
        a.download = normalize_png_name(name);
        a.href = url;
        a.click();
      });
    }
  }

  set_content(selector, styles) {
    const el = this.shadowRoot.querySelector(selector);
    el && (el.styleSheet
      ? (el.styleSheet.cssText = styles )
      : (el.innerHTML = styles));
  }
}

if (!customElements.get('css-doodle')) {
  customElements.define('css-doodle', Doodle);
}

function get_basic_styles() {
  const inherited_grid_props = get_props(/grid/)
    .map(n => `${ n }: inherit;`)
    .join('');
  return `
    * {
      box-sizing: border-box;
    }
    *::after, *::before {
      box-sizing: inherit;
    }
    :host, .host {
      display: block;
      visibility: visible;
      width: auto;
      height: auto;
    }
    .container {
      position: relative;
      width: 100%;
      height: 100%;
      display: grid;
      ${ inherited_grid_props }
    }
    .container cell:empty {
      position: relative;
      line-height: 1;
      display: grid;
      place-items: center;
    }
  `;
}

function get_grid_styles({x, y}) {
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

function create_cells({ x, y, z }) {
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
  return root;
}

function CSSDoodle(input, ...vars) {
  let get_value = v => is_nil(v) ? '' : v;
  let rules = input.reduce((s, c, i) => s + c + get_value(vars[i]), '');
  let doodle = document.createElement('css-doodle');
  if (doodle.update) {
    doodle.update(rules);
  }
  return doodle;
}

export default CSSDoodle;
