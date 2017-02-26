import compile from './compiler';
import parse_size from './parse-size';

class Doodle extends HTMLElement {
  constructor() {
    super();
  }

  static get observedAttributes() {
    return ['grid'];
  }

  attributeChangedCallback(name, old_val, new_val) {
    if (old_val && old_val !== new_val) {
      this.grid = new_val;
    }
  }

  connectedCallback() {
    this.size = parse_size(
      this.getAttribute('grid') || '1x1'
    );
    const basic_styles = `
      *, *:after, *:before {
        box-sizing: border-box;
      }
      :host {
        display: inline-block;
        width: 1em;
        height: 1em;
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

    this.attachShadow({ mode: 'open' })
      .innerHTML = `
        <style>
          ${ basic_styles }
        </style>
        <style class="cell-size-styles">
          ${ this.cells_size_styles(this.size) }
        </style>
        <style class="cell-styles">
          ${ this.cells_styles(this.innerHTML, this.size) }
        </style>
        <div class="container">
          ${ this.cells(this.size) }
        </div>
      `;
  }

  cells_styles(styles, size) {
    return compile(styles, size);
  }

  cells_size_styles({ x, y }) {
    return `
      .cell {
        width: ${ 100 / x + '%' };
        height: ${ 100 / y + '%' };
      }
    `;
  }

  cells({ count }) {
    const cell = `
      <div class="cell">
        <div class="shape"></div>
      </div>
    `;
    return cell.repeat(count);
  }

  set_style(el, styles) {
    if (el) {
      el.styleSheet
        ? (el.styleSheet.cssText = styles )
        : (el.innerHTML = styles);
    }
  }

  get grid() {
    return Object.assign({}, this.size);
  }

  set grid(size) {
    this.size = parse_size(size || '1x1');
    this.shadowRoot.querySelector('.container')
      .innerHTML = this.cells(this.size);
    this.update();
  }

  update(styles) {
    this.set_style(
      this.shadowRoot.querySelector('.cell-size-styles'),
      this.cells_size_styles(this.size)
    );
    this.set_style(
      this.shadowRoot.querySelector('.cell-styles'),
      this.cells_styles(styles || this.innerHTML, this.size)
    );
  }
}

customElements.define('css-doodle', Doodle);
