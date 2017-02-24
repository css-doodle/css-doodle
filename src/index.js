
import compile from './compiler';

function clamp(num, min, max) {
  return (num <= min) ? min : ((num >= max) ? max : num);
};

function parse_size(size) {
  const split = size
    .replace(/\s+/g, '')
    .replace(/[,，xX]+/, 'x')
    .split('x');
  const ret = {
    x: clamp(parseInt(split[0], 10), 1, 16),
    y: clamp(parseInt(split[1] || split[0]), 1, 16)
  };
  return {
    x: ret.x,
    y: ret.y,
    count: ret.x * ret.y
  };
}

const basic_styles = (size) => `
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
    width: ${ 100 / size.x + '%' };
    height: ${ 100 / size.y + '%' };
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

class Doodle extends HTMLElement {
  constructor() {
    super();
  }
  connectedCallback() {
    this.size = parse_size(this.getAttribute('grid') || '1x1');
    const cell_styles = compile(this.innerHTML, this.size);
    this.attachShadow({ mode: 'open' }).innerHTML = `
      <style> ${ basic_styles(this.size)} </style>
      <style> ${ cell_styles } </style>
      <div class="container">
        ${
          `<div class="cell">
            <div class="shape"></div>
           </div>
          `.repeat(this.size.count)
        }
      </div>
    `;
  }
}

customElements.define('css-doodle', Doodle);

