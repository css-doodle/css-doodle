import parse_css from './parser/parse-css';
import parse_size from './parser/parse-size';
import generator from './generator';

const basic = `
  :host {
    display: block;
    visibility: visible;
    width: 1em;
    height: 1em;
  }
  .container {
    position: relative;
    width: 100%;
    height: 100%;
    display: grid;
  }
  .cell {
    position: relative;
    line-height: 1;
    box-sizing: border-box;
    display: flex;
    justify-content: center;
    align-items: center;
  }
`;

class Doodle extends HTMLElement {
  constructor() {
    super();
    this.doodle = this.attachShadow({ mode: 'open' });
  }
  connectedCallback() {
    setTimeout(() => {
      let compiled;
      if (!this.innerHTML.trim()) {
        return false;
      }
      try {
        let parsed = parse_css(this.innerHTML);
        this.size = parse_size(this.getAttribute('grid'));
        compiled = generator(parsed, this.size);
        compiled.size && (this.size = compiled.size);
      } catch (e) {
        // clear content before throwing error
        this.innerHTML = '';
        throw new Error(e);
      }
      this.build_grid(compiled);
    });
  }

  build_grid(compiled) {
    const { has_transition, has_animation } = compiled.props;
    const { keyframes, host, container, cells } = compiled.styles;

    this.doodle.innerHTML = `
      <style>${ basic }</style>
      <style class="style-keyframes">
        ${ keyframes }
      </style>
      <style class="style-container">
        ${ this.style_size() }
        ${ host }
        ${ container }
      </style>
      <style class="style-cells">
        ${ (has_transition || has_animation) ? '' : cells }
      </style>
      <div class="container">
        ${ this.html_cells() }
      </div>
    `;

    if (has_transition || has_animation) {
      setTimeout(() => {
        this.set_style('.style-cells', cells);
      }, 50);
    }
  }

  style_size() {
    return `
      .container {
        grid-template-rows: repeat(${ this.size.x }, 1fr);
        grid-template-columns: repeat(${ this.size.y }, 1fr);
      }
    `;
  }

  html_cells() {
    return '<div class="cell"></div>'
      .repeat(this.size.count);
  }

  set_style(selector, styles) {
    const el = this.shadowRoot.querySelector(selector);
    el && (el.styleSheet
      ? (el.styleSheet.cssText = styles )
      : (el.innerHTML = styles));
  }

  update(styles) {
    if (!styles) return false;

    if (!this.size) {
      this.size = parse_size(this.getAttribute('grid'));
    }

    const compiled = generator(parse_css(styles), this.size);

    if (compiled.size) {
      var { x, y } = compiled.size;
      if (this.size.x !== x || this.size.y !== y) {
        Object.assign(this.size, compiled.size);
        return this.build_grid(compiled);
      }
      Object.assign(this.size, compiled.size);
    }

    else {
      var grid_size = parse_size(this.getAttribute('grid'));
      var { x, y } = grid_size;
      if (this.size.x !== x || this.size.y !== y) {
        Object.assign(this.size, grid_size);
        return this.build_grid(
          generator(parse_css(styles), this.size)
        );
      }
    }

    this.set_style('.style-keyframes',
      compiled.styles.keyframes
    );
    this.set_style('.style-container',
        this.style_size()
      + compiled.styles.host
      + compiled.styles.container
    );
    this.set_style('.style-cells',
      compiled.styles.cells
    );
    this.innerHTML = styles;
  }

  refresh() {
    this.update(this.innerHTML);
  }

  get grid() {
    return Object.assign({}, this.size);
  }

  set grid(grid) {
    this.setAttribute('grid', grid);
    this.connectedCallback();
  }

  static get observedAttributes() {
    return ['grid'];
  }

  attributeChangedCallback(name, old_val, new_val) {
    if (name == 'grid' && old_val) {
      if (old_val !== new_val) {
        this.grid = new_val;
      }
    }
  }
}

customElements.define('css-doodle', Doodle);
