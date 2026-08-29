import parse_grid from '../parser/parse-grid.js';

import generate_css from '../generator/css.js';
import generate_png from '../generator/svg-to-png.js';

import get_rgba_color from '../utils/get-rgba-color.js';
import { get_variable, get_all_variables } from '../utils/variables.js';
import { NS, NSXHtml } from '../utils/svg.js';
import { is_nil } from '../utils/type.js';
import { get_png_name, is_safari, un_entity } from '../utils/browser.js';
import { css } from '../utils/tagged-template.js';
import { loadGoogleFontEmbed, loadGoogleFontLink } from '../utils/google-font.js';

import { parse_css_cached } from './parse-cache.js';
import { bind_uniforms } from './uniforms.js';
import { create_replacer } from './embedded.js';
import { get_basic_styles, create_grid } from './markup.js';

const Expose = {
  CSSDoodle: class {},
  define(name, element) {
    if (typeof customElements !== 'undefined' && !customElements.get(name)) {
      customElements.define(name, element);
    }
  }
}

if (typeof HTMLElement !== 'undefined') {
  Expose.CSSDoodle = class extends HTMLElement {
    static observedAttributes = [
      'grid', 'seed', 'use', 'experimental',
      'click-to-update', 'click:update',
      'auto:update',
    ];

    constructor() {
      super();
      this.doodle = this.attachShadow({ mode: 'open' });
      this.animations = [];
      this.observers = new Map();
      this.shader_renders = new Map();
      this.extra = {
        get_variable: name => get_variable(this, name),
        get_rgba_color: value => get_rgba_color(this.shadowRoot, value),
      };
    }

    connectedCallback(again) {
      if (this.innerHTML) {
        this.load(again);
        this._rendering = true;
      } else {
        // the source may not be parsed yet
        setTimeout(() => {
          this.load(again);
          this._rendering = true;
        });
      }
    }

    disconnectedCallback() {
      this.cleanup();
    }

    attributeChangedCallback(name, oldValue, newValue) {
      if (oldValue === newValue) {
        return;
      }
      if (name === 'click-to-update' || name === 'click:update') {
        if (newValue === null) {
          this.removeEventListener('click', this.bindClickToUpdate);
          this.removeAttribute('click-to-update');
          this.removeAttribute('click:update');
        } else if (oldValue === null) {
          this.addEventListener('click', this.bindClickToUpdate);
        }
      } else if (name === 'auto:update') {
        if (newValue !== null) {
          this.autoUpdate();
        } else {
          this.cancelAutoUpdate();
        }
      } else {
        this.connectedCallback(true);
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

    get grid() {
      return Object.assign({}, this.grid_size);
    }

    set grid(grid) {
      this.attr('grid', grid);
    }

    get seed() {
      return this._seed_value;
    }

    set seed(seed) {
      this.attr('seed', seed);
    }

    get use() {
      return this.attr('use');
    }

    set use(use) {
      this.attr('use', use);
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

    triggerEvent(name, detail = {}) {
      return this.dispatchEvent(
        new CustomEvent(name, {
          detail,
          bubbles: true,
          composed: true,
        })
      );
    }

    dispatchCellClick(event) {
      let cell = event.composedPath().find(el => el.tagName === 'CSSD-CELL');
      if (!cell) return;
      let match = /^c-(\d+)-(\d+)-(\d+)$/.exec(cell.id);
      if (!match) return;
      this.triggerEvent('click:cell', {
        x: Number(match[1]),
        y: Number(match[2]),
        z: Number(match[3]),
        element: cell,
        originalEvent: event,
      });
    }

    bindClickToUpdate() {
      this.update();
    }

    _get_auto_update_interval(interval) {
      const MIN = 500;
      const DEFAULT = 2000;
      if (is_nil(interval)) {
        interval = this.dataset.interval || this.attr('auto:update') || DEFAULT;
      }
      interval = String(interval).trim();
      if (/^([\d.]+)m$/.test(interval)) {
        interval = parseFloat(interval) * 60 * 1000;
      } else if (/^([\d.]+)s$/.test(interval)) {
        interval = parseFloat(interval) * 1000;
      } else {
        interval = parseFloat(interval);
      }
      if (isNaN(interval)) {
        return DEFAULT;
      }
      return Math.max(interval, MIN);
    }

    autoUpdate(interval) {
      clearInterval(this._auto_update_timer);
      if (!is_nil(interval)) {
        this.dataset.interval = interval;
      }
      this._auto_update_timer = setInterval(
        () => this.update({ auto: true }),
        this._get_auto_update_interval(interval)
      );
    }

    cancelAutoUpdate() {
      clearInterval(this._auto_update_timer);
      this._auto_update_timer = null;
      this.removeAttribute('auto:update');
      this.removeAttribute('data-interval');
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

    load(again) {
      if (this._rendering) {
        return false;
      }
      this.cleanup();
      let code = this._code || this.innerHTML;
      let parsed = parse_css_cached(this.get_use() + un_entity(code), this.extra);
      let compiled = this.generate(parsed);

      if (!again) {
        if (this.hasAttribute('click-to-update') || this.hasAttribute('click:update')) {
          this.addEventListener('click', this.bindClickToUpdate);
        }
        this.addEventListener('click', this.dispatchCellClick);
      }

      this.grid_size = compiled.grid || this.get_grid();
      this.build_grid(compiled, this.grid_size);
      this._code = code;
      this.innerHTML = '';

      setTimeout(() => {
        this._rendering = false;
        this.triggerEvent('render');
      });
    }

    update(styles, options = {}) {
      this.triggerEvent('beforeUpdate');
      if (typeof styles === 'object' && styles !== null) {
        options = styles;
        styles = '';
      }

      let useAnimation = this.viewTransition;
      if (useAnimation === undefined) {
        useAnimation = this.hasAttribute('view-transition');
      }
      if (useAnimation && document.startViewTransition) {
        document.startViewTransition(() => {
          this._update(styles);
        });
      } else {
        this._update(styles);
      }
      if (!options.auto && (this.hasAttribute('auto:update') || this._auto_update_timer)) {
        this.autoUpdate();
      }
    }

    _update(styles) {
      this.cleanup();
      // reuse the old rules when called without new code
      if (!styles) {
        styles = un_entity(this._code);
      }
      this._code = styles;
      if (!this.grid_size) {
        this.grid_size = this.get_grid();
      }

      const old = this.compiled;
      const compiled = this.generate(
        parse_css_cached(this.get_use() + styles, this.extra));
      const grid = compiled.grid || this.get_grid();
      const rebuild = this.should_rebuild(compiled, old, grid);

      Object.assign(this.grid_size, grid);

      if (rebuild) {
        this.build_grid(compiled, grid);
      } else {
        this.patch(compiled, old.styles);
      }

      setTimeout(() => {
        this.triggerEvent('render');
        this.triggerEvent('afterUpdate');
        this.triggerEvent('update');
      });
    }

    should_rebuild(compiled, old, grid) {
      if (!old) {
        return true;
      }
      // no cells yet, or nested doodles pending as content
      if (!this.shadowRoot.innerHTML || this.shadowRoot.querySelector('css-doodle')) {
        return true;
      }
      let { x, y, z } = this.grid_size;
      if (grid.x !== x || grid.y !== y || grid.z !== z) {
        return true;
      }
      if (JSON.stringify(old.content) !== JSON.stringify(compiled.content)) {
        return true;
      }
      if (!old.styles.cells || !compiled.styles.cells) {
        return true;
      }
      return old.styles.backdrop !== compiled.styles.backdrop;
    }

    /* refresh styles in place, keeping the cell elements */
    patch(compiled, old_styles) {
      bind_uniforms(this, compiled.uniforms);
      let replace = create_replacer(this, compiled);
      if (compiled.props.has_animation) {
        // detach animations first so they restart with the new styles
        this.set_style(old_styles.all.replace(/animation/g, 'x'));
        this.reflow();
      }
      if (compiled.styles.gf) {
        loadGoogleFontLink(compiled.styles.gf);
      }
      this.set_style(replace(
        compiled.styles.top +
        get_basic_styles(this.grid_size) +
        compiled.styles.all
      ));
    }

    build_grid(compiled, grid) {
      const { has_transition, has_animation } = compiled.props;
      const { uniforms, content, styles } = compiled;
      const basic_styles = get_basic_styles(grid);
      const has_content = Object.keys(content).length;

      this.doodle.innerHTML = css`
        <style>${basic_styles + styles.main}</style>
        ${(styles.cells || styles.container || has_content) ? create_grid(grid, compiled) : ''}
      `;
      if (has_transition || has_animation) {
        this.reflow();
      }
      if (styles.gf) {
        loadGoogleFontLink(styles.gf);
      }
      let replace = create_replacer(this, compiled);
      this.set_style(replace(styles.top + basic_styles + styles.all));
      if (has_content) {
        replace(Object.values(content).join(' '));
      }
      bind_uniforms(this, uniforms);
    }

    set_style(input) {
      if (input instanceof Promise) {
        input.then(v => this.set_style(v)).catch(console.error);
      } else {
        const el = this.shadowRoot.querySelector('style');
        if (el) {
          el.textContent = input.replace(/\n\s+/g, ' ');
        }
      }
    }

    reflow() {
      this.shadowRoot.querySelector('cssd-grid').offsetWidth;
    }

    cleanup() {
      if (this.compiled) {
        for (let am of this.animations) {
          am.cancel();
        }
        this.animations = [];
        let { pattern, shaders } = this.compiled;
        if (Object.keys(pattern).length || Object.keys(shaders).length) {
          for (let el of this.shadowRoot.querySelectorAll('cssd-cell')) {
            el.style.cssText = '';
          }
          this.observers.forEach(observer => {
            observer.disconnect();
          });
        }
        // clear shader CSS variables
        for (let id of Object.keys(shaders)) {
          this.style.removeProperty('--' + id);
        }
        for (let id of Object.keys(pattern)) {
          this.style.removeProperty('--' + id);
        }
      }
      this.observers.clear();
      this.shader_renders.forEach(({ canvas }) => {
        if (canvas && canvas.loseContext) {
          canvas.loseContext();
        }
      });
      this.shader_renders.clear();
      this.style.background = '';
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

    async export({ scale, name, download, detail } = {}) {
      let variables = get_all_variables(this);
      let html = this.doodle.innerHTML;

      let { width, height } = this.getBoundingClientRect();
      scale = parseInt(scale) || 1;

      let w = width * scale;
      let h = height * scale;
      let fonts = await loadGoogleFontEmbed();
      let svg = css`
          <svg ${NS} preserveAspectRatio="none" viewBox="0 0 ${width} ${height}" ${is_safari() ? '' : `width="${w}px" height="${h}px"`}>
            <foreignObject width="100%" height="100%">
              <div class="host" ${NSXHtml} style="width:${width}px;height:${height}px">
                <style><![CDATA[
                  ${fonts}
                  .host{${variables}}
                ]]></style>
                ${html}
              </div>
            </foreignObject>
          </svg>
        `;

      if (download || detail) {
        let { source, url, blob } = await generate_png(svg, w, h, scale);
        if (download) {
          let a = document.createElement('a');
          a.download = get_png_name(name);
          a.href = url;
          a.click();
        }
        return { width: w, height: h, svg, blob, source };
      }
      return { width: w, height: h, svg };
    }
  }
}

export const CSSDoodle = Expose.CSSDoodle;
export const define = Expose.define;
