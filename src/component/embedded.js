/**
 * Rendering of embedded doodles, shaders and patterns: each placeholder id
 * left in the compiled styles is resolved to an image (data-uri or CSS
 * variable) against the host element.
 */
import parse_grid from '../parser/parse-grid.js';
import parse_shaders from '../parser/parse-shaders.js';

import generate_css from '../generator/css.js';
import generate_shaders from '../generator/shaders.js';
import generate_pattern from '../generator/pattern.js';
import generate_png from '../generator/svg-to-png.js';

import create_animation from '../utils/create-animation.js';
import { NS, NSXHtml } from '../utils/svg.js';
import { utime, UTime } from '../core/uniforms.js';
import { cache_image, is_safari } from '../utils/browser.js';
import { debounce } from '../utils/fn.js';
import { css } from '../utils/tagged-template.js';
import { loadGoogleFontEmbed } from '../utils/google-font.js';

import { parse_css_cached } from './parse-cache.js';
import { get_basic_styles, create_grid } from './markup.js';

export function create_replacer(host, { doodles, shaders, pattern }) {
  const groups = [
    [doodles, (v, fn) => doodle_to_image(host, v.doodle, { arg: v.arg, upextra: v.upextra }, fn)],
    [shaders, (v, fn) => shader_to_image(host, v, fn)],
    [pattern, (v, fn) => pattern_to_image(host, v, fn)],
  ];
  return input => {
    let tasks = [];
    for (let [map, to_image] of groups) {
      for (let [id, value] of Object.entries(map)) {
        if (input.includes(id)) {
          tasks.push(new Promise(resolve => {
            to_image(value, result => resolve({ id, result }));
          }));
        }
      }
    }
    if (!tasks.length) {
      return Promise.resolve(input);
    }
    return Promise.all(tasks).then(mappings => {
      for (let { id, result } of mappings) {
        /* doodle resolves to a data-uri, shader and pattern render
         * into CSS variables */
        let target = /^(shader|pattern)/.test(id)
          ? `var(--${id})`
          : `url(${result})`;
        input = input.replaceAll('${' + id + '}', target);
      }
      return input;
    }).catch(err => {
      console.error(err);
      return input;
    });
  }
}

export function doodle_to_image(host, code, options, fn) {
  if (typeof options === 'function') {
    fn = options;
    options = null;
  }
  options = options || {};
  code = ':doodle {width:100%;height:100%}' + code;
  let parsed = parse_css_cached(code, host.extra);
  let _grid = parse_grid('');
  let compiled = generate_css(parsed, _grid, host._seed_value, host.get_max_grid(), host._seed_random, options.upextra);
  let styles = compiled.styles || {};
  let grid = compiled.grid ? compiled.grid : _grid;
  let viewBox = '';
  if (options.arg) {
    let v = parse_grid(options.arg, Infinity);
    if (v.x && v.y) {
      options.width = v.x + 'px';
      options.height = v.y + 'px';
      viewBox = `viewBox="0 0 ${v.x} ${v.y}"`;
    }
  }

  let replace = create_replacer(host, compiled);
  let grid_container = create_grid(grid, compiled);

  let size = (options.width && options.height)
    ? `width="${options.width}" height="${options.height}"`
    : '';

  loadGoogleFontEmbed(styles.gf || [])
    .then(importedFonts => replace(css`
      <svg ${size} ${NS} preserveAspectRatio="none" ${viewBox}>
        <foreignObject width="100%" height="100%">
          <div class="host" width="100%" height="100%" ${NSXHtml}>
            <style><![CDATA[
              ${importedFonts}
              ${styles.top}
              @property --${utime.name} { syntax: "<integer>"; initial-value: 0; inherits: true; }
              @property --${UTime.name} { syntax: "<integer>"; initial-value: 0; inherits: true; }
              ${get_basic_styles(grid)}
              ${styles.all}
            ]]></style>
            ${grid_container}
          </div>
        </foreignObject>
      </svg>
    `))
    .then(result => {
      let source = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(result)))}`;
      if (is_safari() && size) {
        return generate_png(result, parseInt(options.width), parseInt(options.height), devicePixelRatio || 2)
          .then(({ blob }) => {
            let url = URL.createObjectURL(blob);
            cache_image(url);
            return url;
          });
      }
      if (is_safari()) {
        cache_image(source);
      }
      return source;
    })
    .then(fn)
    .catch(err => {
      console.error(err);
      fn('');
    });
}

export function pattern_to_image(host, { code, cell, id, arg, target }, fn) {
  let shader = generate_pattern(code, host.extra);
  shader_to_image(host, { shader, cell, id, arg, target }, fn);
}

export function shader_to_image(host, { shader, cell, id, arg, target }, fn) {
  let element;
  if (target.selector === ':host') {
    element = host;
  } else if (target.selector === ':container') {
    element = host.shadowRoot.querySelector('cssd-grid');
  } else {
    element = host.doodle.getElementById(cell);
  }

  let { width, height } = element.getBoundingClientRect();
  let cs;

  if (arg) {
    cs = parse_grid(arg, Infinity);
    if (cs.x && cs.y) {
      width = Math.min(cs.x, width);
      height = Math.min(cs.y, height);
    }
  }

  let seed = host.seed;
  let parsed = typeof shader === 'string' ? parse_shaders(shader) : shader;
  parsed.width = width;
  parsed.height = height;

  let sources = parsed.textures;
  let images = [];
  let ready = false;
  let last_w = 0, last_h = 0;

  const set_shader_prop = v => {
    host.style.setProperty(id, 'url("' + v + '")');
  }

  const tick = ([render, animated, canvas]) => {
    // release any context still held for this target before drawing again
    let existing = host.shader_renders.get(target.selector);
    if (existing && existing.canvas && existing.canvas.loseContext) {
      existing.canvas.loseContext();
    }
    host.shader_renders.delete(target.selector);

    render(0, width, height, host._umouse, images);
    last_w = width;
    last_h = height;
    ready = true;

    if (animated) {
      if (target.type === 'content') {
        element.replaceChildren(canvas);
        host.animations.push(create_animation(t => {
          render(t, width, height, host._umouse, images);
        }));
      } else {
        host.animations.push(create_animation(t => {
          render(t, width, height, host._umouse, images);
          set_shader_prop(canvas.toDataURL());
        }));
      }
      host.shader_renders.set(target.selector, { render, canvas, animated: true });
    } else {
      let data_url = canvas.toDataURL();
      if (target.type === 'content') {
        let img = new Image();
        img.style.cssText = 'position:absolute;width:100%;height:100%;object-fit:cover';
        img.src = data_url;
        element.replaceChildren(img);
      } else {
        set_shader_prop(data_url);
      }
      if (canvas.loseContext) {
        canvas.loseContext();
      }
    }
  }

  const transform = (sources, cb) => {
    let dpr = devicePixelRatio || 1;
    Promise.all(sources.map(({ name, value }) => {
      return new Promise(resolve => {
        doodle_to_image(host, value, { width, height }, src => {
          if (!src) {
            resolve({ name, value: null });
            return;
          }
          let img = new Image();
          img.width = width * dpr;
          img.height = height * dpr;
          img.onload = () => resolve({ name, value: img });
          img.onerror = () => resolve({ name, value: null });
          img.src = src;
        });
      });
    })).then(cb);
  }

  const draw = after => {
    parsed.textures = images;
    parsed.width = width;
    parsed.height = height;
    return generate_shaders(parsed, seed, target.type)
      .then(tick)
      .then(after)
      .catch(err => {
        console.error(err);
        if (after) after('');
      });
  }

  const run = after => {
    if (sources.length) {
      transform(sources, result => {
        images = result;
        draw(after);
      });
    } else {
      draw(after);
    }
  }

  if (!host.observers.has(target.selector)) {
    let observer = new ResizeObserver(debounce(() => {
      if (!ready) return;
      let rect = element.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      if (cs && cs.x && cs.y) {
        width = Math.min(cs.x, width);
        height = Math.min(cs.y, height);
      }
      if (width === last_w && height === last_h) return;
      last_w = width;
      last_h = height;
      let live = host.shader_renders.get(target.selector);
      if (live && live.animated) {
        // live context adapts to the new size on its next frame; just
        // refresh the textures the loop reads from the closure
        transform(sources, result => { images = result; });
      } else {
        // static render was baked to an image and its context freed: redraw
        run();
      }
    }));
    observer.observe(element);
    host.observers.set(target.selector, observer);
  }

  run(fn);
}
