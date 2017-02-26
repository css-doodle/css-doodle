import compile from './compiler';
import parse_size from './parse-size';

class Doodle extends HTMLElement {
  constructor() {
    super();
    this.doodle = this.attachShadow({ mode: 'open' });
    this.basic_styles = `
      *, *:after, *:before {
        box-sizing: border-box;
      }
      :host {
        display: inline-block;
        width: 1em;
        height: 1em;
        will-change: transform;
      }
      .container {
        position: relative;
        width: 100%;
        height: 100%;
      }
      .container:after {
        content: '';
        display: block;
        clear: both;
        visibility: hidden;
      }
      .cell {
        position: relative;
        float: left;
        line-height: 0;
      }
      .shape {
        line-height: 0;
        position: absolute;
        width: 100%;
        height: 100%;
        transform-origin: center center;
        z-index: 1;
        display: flex;
        align-items: center;
        justify-content: center;
      }
    `;
  }

  connectedCallback() {
    let compiled;

    this.size = parse_size(
      this.getAttribute('grid') || '1x1'
    );

    // clear content before throwing error
    try {
      compiled = compile(this.innerHTML, this.size);
    } catch (e) {
      this.innerHTML = '';
      throw new Error(e);
    }

    const { has_transition } = compiled.props;
    this.doodle.innerHTML = `
      <style>${ this.basic_styles }</style>
      <style class="style-container">
        ${ this.style_size() }
        ${ compiled.styles.host }
      </style>
      <style class="style-cells">
        ${ has_transition ? '' : compiled.styles.cells }
      </style>
      <div class="container">
        ${ this.html_cells() }
      </div>
    `;

    has_transition && setTimeout(() => {
      this.set_style(
        '.style-cells',
        compiled.styles.cells
      );
    }, 50);
  }

  style_size() {
    return `
      .cell {
        width: ${ 100 / this.size.x + '%' };
        height: ${ 100 / this.size.y + '%' };
      }
    `;
  }

  html_cells() {
    const cell = `
      <div class="cell">
        <div class="shape"></div>
      </div>
    `;
    return cell.repeat(this.size.count);
  }

  set_style(selector, styles) {
    const el = this.shadowRoot.querySelector(selector);
    el && (el.styleSheet
      ? (el.styleSheet.cssText = styles )
      : (el.innerHTML = styles));
  }

  update(styles) {
    if (!styles) return false;
    const compiled = compile(styles, this.size);
    this.set_style('.style-container',
      this.style_size() + compiled.styles.host
    );
    this.set_style('.style-cells',
      compiled.styles.cells
    );
    this.innerHTML = styles;
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
