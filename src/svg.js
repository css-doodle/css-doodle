import { cache_image, is_safari } from './utils/index.js';

const NS = 'http://www.w3.org/2000/svg';
const NSXLink = 'http://www.w3.org/1999/xlink';

export function create_svg_url(svg, id) {
  let encoded = encodeURIComponent(svg) + (id ? `#${ id }` : '');
  return `url("data:image/svg+xml;utf8,${ encoded }")`;
}

export function normalize_svg(input) {
  const xmlns = `xmlns="${ NS }"`;
  const xmlnsXLink = `xmlns:xlink="${ NSXLink }"`;
  if (!input.includes('<svg')) {
    input = `<svg ${ xmlns } ${ xmlnsXLink }>${ input }</svg>`;
  }
  if (!input.includes('xmlns')) {
    input = input.replace(/<svg([\s>])/, `<svg ${ xmlns } ${ xmlnsXLink }$1`);
  }
  return input;
}

export function svg_to_png(svg, width, height, scale) {
  return new Promise((resolve, reject) => {
    let source = `data:image/svg+xml;utf8,${ encodeURIComponent(svg) }`;
    function action() {
      let img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = source;

      img.onload = () => {
        let canvas = document.createElement('canvas');
        let ctx = canvas.getContext('2d');

        let dpr = window.devicePixelRatio || 1;
        /* scale with devicePixelRatio only when the scale equals 1 */
        if (scale != 1) {
          dpr = 1;
        }

        canvas.width = width * dpr;
        canvas.height = height * dpr;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        try {
          canvas.toBlob(blob => {
            resolve({
              blob,
              source,
              url: URL.createObjectURL(blob)
            });
          });
        } catch (e) {
          reject(e);
        }
      }
    }

    if (is_safari()) {
      cache_image(source, action, 200);
    } else {
      action();
    }
  });
}

export function generate_svg(token, element, parent) {
  if (!element) {
    element = document.createDocumentFragment();
  }
  if (token.type === 'block') {
    // style tag
    if (token.name === 'style' && Array.isArray(token.value)) {
      let el = document.createElement('style');
      let styles = [];
      token.value.forEach(t => {
        styles.push(compose_block(t));
      });
      el.innerHTML = styles.join('');
      element.appendChild(el);
    }
    // normal svg elements
    else {
      try {
        let el = document.createElementNS(NS, token.name);
        if (el) {
          token.value.forEach(t => {
            generate_svg(t, el, token);
          });
          element.appendChild(el);
        }
      } catch (e) {}
    }
  }
  if (token.type === 'statement') {
    if (parent && parent.name == 'text' && token.name === 'content') {
      element.textContent = token.value;
    }
    // inline style
    else if (token.name.startsWith('style ')) {
      let name = (token.name.split('style ')[1] || '').trim();
      if (name.length) {
        let style = element.getAttribute('style') || '';
        element.setAttribute('style', style + `${name}: ${token.value};`);
      }
    }
    else {
      try {
        let ns = token.name.startsWith('xlink:') ? NSXLink : NS;
        element.setAttributeNS(ns, token.name, token.value);
      } catch (e) {}
    }
  }
  if (!parent) {
    let child = element.childNodes[0];
    return child && child.outerHTML || '';
  }
  return element;
}

function compose_block(block) {
  return `${block.name} {
    ${block.value.map(n => {
      if (n.type === 'statement') {
        return `${n.name}: ${n.value};`;
      } else if (n.type === 'block') {
        return compose_block(n);
      }
    }).join('')}
  }`
}
