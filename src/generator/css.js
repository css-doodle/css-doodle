import Func, { MathFunc } from '../core/function.js';
import Property from '../core/property.js';
import Selector from '../core/selector.js';
import parse_value_group from '../parser/parse-value-group.js';

import create_random from '../core/random.js';
import { utime, UTime } from '../core/uniforms.js';
import grid_style_rules from './grid-style.js';

import { cell_id } from '../utils/cell.js';
import { is_nil, get_value } from '../utils/type.js';
import { unique_id } from '../utils/fn.js';
import { join, make_array, remove_empty_values } from '../utils/list.js';
import {
  is_host_selector, is_parent_selector, is_special_selector, is_pseudo_selector
} from '../utils/selector.js';
import { css } from '../utils/tagged-template.js';

const DELAY = new Date().setHours(0, 0, 0, 0) - Date.now();

function is_image_value(value) {
  return String(value).includes('${') && /\$\{(shader|pattern|doodle)/.test(value);
}

const NO_SPACE = { noSpace: true };
const COMPOSABLE = new Set(['doodle', 'shaders', 'pattern']);
const static_args = new WeakMap();

function static_argument(argument) {
  let cached = static_args.get(argument);
  if (cached === undefined) {
    cached = false;
    let { values } = argument;
    if (values.length === 1 && values[0].type === 'text'
        && !/^\-\-\w/.test(values[0].value)) {
      cached = { cluster: argument.cluster, value: values[0].value };
    }
    static_args.set(argument, cached);
  }
  return cached;
}

const func_cache = new Map();

function find_func(name) {
  let fn = func_cache.get(name);
  if (fn === undefined) {
    fn = Func[name.startsWith('$') ? 'calc' : name] || MathFunc[name] || null;
    func_cache.set(name, fn);
  }
  return fn;
}

function is_static_rule(token) {
  let prop = token.property;
  if (prop.startsWith('@') || prop.startsWith('--')) return false;
  if (prop.startsWith('animation')) return false;
  if (prop === 'background-size') return false;
  if (!Array.isArray(token.value)) return false;
  return token.value.every(group =>
    group.every(n => n.type === 'text' && typeof n.value !== 'object'));
}

function rule_flags(prop) {
  return {
    animation: /^animation(\-name)?$/.test(prop),
    size: prop === 'width' || prop === 'height',
    bg_image: /^background(\-image)?$/.test(prop),
    var: prop.startsWith('--'),
    at: (prop.startsWith('@') && Property[prop.slice(1)]) ? prop.slice(1) : null,
    grid_like: /^grid/.test(prop),
  };
}

class Rules {

  constructor(tokens) {
    this.tokens = tokens;
    this.rules = new Map();
    this.rule_keys = {};
    this.props = {};
    this.keyframes = {};
    this.grid = null;
    this.seed = null;
    this.is_grid_set = false;
    this.is_gap_set = false;
    this.uniforms = {};
    this.skips = new WeakSet();
    this.memo = new WeakMap();
    this.reset();
  }

  reset() {
    this.styles = {
      host: '',
      container: '',
      cells: '',
      backdrop: '',
      keyframes: '',
      top: '',
      gf: [],
    }
    this.coords = [];
    this.doodles = {};
    this.pattern = {};
    this.shaders = {};
    this.content = {};
    this.vars = {};
    for (let key of this.rules.keys()) {
      if (key.startsWith('#c')) {
        this.rules.delete(key);
      }
    }
  }

  add_rule(selector, rule) {
    let rules = this.rules.get(selector);
    if (!rules) {
      this.rules.set(selector, rules = []);
    }
    if (!rule) {
      return;
    }
    if (selector === ':top:' || selector === ':gf:') {
      if (typeof rule === 'string') {
        let seen = this.rule_keys[selector] ??= new Set();
        if (seen.has(rule)) {
          return;
        }
        seen.add(rule);
      } else if (rules.includes(rule)) {
        return;
      }
    }
    if (Array.isArray(rule)) {
      rules.push(...rule);
    } else {
      rules.push(rule);
    }
  }

  scoped_vars(count, extra) {
    return Object.assign({},
      this.vars['host'],
      this.vars['container'],
      this.vars[count],
      extra
    );
  }

  apply_func(fn, coords, args, fname, contextVariable = {}) {
    let _fn = fn(coords);
    let input = [];
    for (let arg of args) {
      let type = typeof arg.value;
      if (!arg.cluster && (type === 'number' || type === 'string')) {
        input.push(...parse_value_group(arg.value, NO_SPACE));
      }
      else if (typeof arg === 'function') {
        input.push(arg);
      }
      else if (!is_nil(arg.value)) {
        input.push(get_value(arg.value));
      }
    }
    input = make_array(remove_empty_values(input));
    if (typeof _fn === 'function') {
      if (fname.startsWith('$')) {
        let group = this.scoped_vars(coords.count, contextVariable);
        let context = {};
        let unit = '';
        for (let [name, key] of Object.entries(group)) {
          context[name.slice(2)] = key;
        }
        if (fname.length > 1) {
          unit = fname.split('$')[1] ?? '';
        }
        return _fn(input, context) + unit;
      }
      return _fn(...input);
    }
    return _fn;
  }

  compose_aname(...args) {
    return args.join('-');
  }

  compose_selector(coords, pseudo = '') {
    let base = coords.__selector;
    if (!base) {
      base = coords.__selector = '#' + cell_id(coords.x, coords.y, coords.z);
    }
    return pseudo ? (base + pseudo) : base;
  }

  read_var(value, coords, contextVariable) {
    let group = this.scoped_vars(coords.count, contextVariable);
    if (group[value] !== undefined) {
      let result = String(group[value]).trim();
      if (result.startsWith('(') && result.endsWith(')')) {
        result = result.slice(1, -1);
      }
      return result.replace(/;+$/g, '');
    }
    return value;
  }

  compose_composable(fname, node, coords, selector) {
    let parts = (node.arguments || []).map(a => get_value((a.values || [])[0]));
    let temp;
    if (parts.length && /^\d/.test(parts[0])) {
      temp = parts[0];
      parts = parts.slice(1);
    }
    let value = parts.join(',');
    if (!is_nil(value) && value !== '') {
      switch (fname) {
        case 'doodle':
          return this.compose_doodle(
            this.inject_variables(value, coords.count), temp,
            coords.extra.length ? structuredClone(coords.extra) : undefined);
        case 'shaders':
        case 'pattern':
          return this.compose_paint(fname, value, coords, temp, selector);
      }
    }
  }

  evaluate_func(node, coords, contextVariable, selector, extra, in_argument) {
    let fname = node.name.slice(1);
    let fn = find_func(fname);
    if (typeof fn !== 'function') {
      // unrecognized functions read as literal text
      return { value: node.name };
    }
    this.check_uniforms(fname);
    if (COMPOSABLE.has(fname)) {
      let composed = this.compose_composable(fname, node, coords, selector);
      if (composed !== undefined) {
        return { value: composed };
      }
      if (!in_argument) {
        return { value: '' };
      }
    }
    coords.position = node.position;
    if (!in_argument && node.variables) {
      this.compose_variables(node.variables, coords, contextVariable);
    }
    let args = node.arguments.map(arg => {
      return fn.lazy
        ? (...lazy) => this.compose_argument(arg, coords, lazy, node, contextVariable, selector)
        : this.compose_argument(arg, coords, in_argument ? extra : [], node, contextVariable, selector);
    });
    let output = this.apply_func(fn, coords, args, fname, contextVariable);
    if (output && output.gf) {
      this.add_rule(':gf:', output.value);
    }
    return { value: get_value(output), extra: output?.extra };
  }

  compose_argument(argument, coords, extra = [], parent, contextVariable, selector) {
    let static_result = static_argument(argument);
    if (static_result) {
      return static_result;
    }
    coords.extra.push(extra);

    let result = argument.values.map(arg => {
      if (arg.type === 'text') {
        if (/^\-\-\w/.test(arg.value)) {
          if (parent && parent.name === '@var') {
            return arg.value;
          }
          return this.read_var(arg.value, coords, contextVariable);
        }
        return arg.value;
      }
      if (arg.type === 'func') {
        return this.evaluate_func(arg, coords, contextVariable, selector, extra, true).value;
      }
    });

    coords.extra.pop();

    return {
      cluster: argument.cluster,
      value: (result.length >= 2 ? ({ value: result.join('') }) : result[0])
    }
  }

  compose_doodle(doodle, arg, upextra) {
    let id = unique_id('doodle');
    this.doodles[id] = { doodle, arg, upextra };
    return '${' + id + '}';
  }

  get_target(selector, cell_selector) {
    let target = {
      selector: 'cell',
      type: 'background'
    };
    if (selector && selector.property === '@content') {
      target.type = 'content';
    } else if (selector && selector.property === '@grid') {
      target.selector = ':host';
    } else if (is_special_selector(selector)) {
      target.selector = selector;
    }
    if (target.selector === 'cell') {
      target.selector = cell_selector;
    }
    return target;
  }

  compose_paint(fname, source, { x, y, z }, arg, selector) {
    // the renderer reads `shader` for shaders and `code` for patterns
    let is_shader = fname === 'shaders';
    let id = unique_id(is_shader ? 'shader' : 'pattern');
    let cell_selector = cell_id(x, y, z);
    this[is_shader ? 'shaders' : 'pattern'][id] = {
      [is_shader ? 'shader' : 'code']: source,
      target: this.get_target(selector, cell_selector),
      arg,
      id: '--' + id,
      cell: cell_selector
    };
    return '${' + id + '}';
  }

  check_uniforms(name) {
    switch (name) {
      case 'ut': case 'UT': case 't': case 'T': case 'ts': case 'TS':
        this.uniforms.time = true; break;
      case 'ux': this.uniforms.mousex = true; break;
      case 'uy': this.uniforms.mousey = true; break;
      case 'uw': this.uniforms.width = true; break;
      case 'uh': this.uniforms.height = true; break;
      case 'shaders': this.uniforms.mouse = true; break;
    }
  }

  inject_variables(value, count) {
    let group = this.scoped_vars(count);
    let variables = [];
    for (let [name, key] of Object.entries(group)) {
      variables.push(`${name}: ${key};`);
    }
    variables = variables.join('');
    if (variables.length) {
      return `:doodle {${variables}}` + value;
    }
    return value;
  }

  compose_variables(variables, coords, result = {}) {
    for (let [name, value] of Object.entries(variables)) {
      result[name] = this.get_composed_value(value, coords, result).value;
    }
    return result;
  }

  compose_value(value, coords, contextVariable = {}, selector) {
    if (!Array.isArray(value)) {
      return {
        value: '',
        extra: '',
      }
    }
    let extra = '';
    let output = '';
    for (let val of value) {
      if (val.type === 'text') {
        output += val.value;
        continue;
      }
      if (val.type === 'func') {
        let evaluated = this.evaluate_func(val, coords, contextVariable, selector, [], false);
        output += evaluated.value;
        if (evaluated.extra) {
          extra = evaluated.extra;
        }
      }
    }
    return {
      value: output,
      extra: extra,
    }
  }

  get_composed_value(value, coords, context, selector) {
    let extra;
    let group = [];
    if (Array.isArray(value)) {
      let ctx = context || {};
      for (let v of value) {
        let composed = this.compose_value(v, coords, ctx, selector);
        if (composed.value) group.push(composed.value);
        if (composed.extra) extra = composed.extra;
      }
    }
    return {
      extra, group, value: group.join(',')
    }
  }

  add_grid_style(transformed) {
    for (let [selector, rule] of grid_style_rules(transformed)) {
      this.add_rule(selector, rule);
    }
  }

  compose_rule(token, coords, selector) {
    let info = this.memo.get(token);
    if (!info) {
      info = {
        static: is_static_rule(token),
        flags: rule_flags(token.property),
        cache: null,
      };
      this.memo.set(token, info);
    }
    if (!info.static) {
      return this.compose_rule_value(token, coords, selector, info.flags);
    }
    if (!info.cache) {
      info.cache = new Map();
    }
    let cached = info.cache.get(selector);
    if (cached === undefined) {
      cached = this.compose_rule_value(token, coords, selector, info.flags);
      info.cache.set(selector, cached);
    }
    return cached;
  }

  compose_rule_value(token, coords, selector, flags) {
    let prop = token.property;
    if (prop === '@seed') {
      return '';
    }
    let composed = this.get_composed_value(token.value, coords, {}, selector);
    let extra = composed.extra;
    let value = composed.value;

    if (flags.animation) {
      this.props.has_animation = true;

      if (is_host_selector(selector)) {
        let prefix = utime['n'] + ',' + UTime['n'];
        if (prefix && value) {
          value = prefix + ',' + value;
        }
      }

      if (coords.count > 1) {
        let { count } = coords;
        switch (prop) {
          case 'animation-name': {
            value = composed.group
              .map(n => this.compose_aname(n, count))
              .join(',');
            break;
          }
          case 'animation': {
            value = composed.group
              .map(n => {
                let group = (n || '').split(/\s+/);
                group[0] = this.compose_aname(group[0], count);
                return group.join(' ');
              })
              .join(',');
          }
        }
      }
    }

    if (prop === 'content') {
      if (!/["']|^none\s?$|^(var|counter|counters|attr|url)\(/.test(value)) {
        value = `'${value}'`;
      }
      let reset = new Map();
      value = value.replace(/var\(\-\-cssd\-u(time|mousex|mousey|width|height)\)/gi, (n, v) => {
        reset.set(v, `${v} calc(${n})`);
        return `counter(${v})`;
      });
      return css`
        ${reset.size ? `counter-reset:${Array.from(reset.values()).join(' ')};` : ''}
        content:${value};
      `;
    }

    if (prop === 'transition') {
      this.props.has_transition = true;
    }

    if (prop === 'background-size') {
      coords.has_bgsize = true;
    }

    let rule = `${prop}:${value};`

    if (flags.size) {
      if (!is_special_selector(selector)) {
        rule += `--_cell-${prop}:${value};`;
      }
    }

    if (flags.bg_image && is_image_value(value)) {
      let sizes = parse_value_group(value, NO_SPACE)
        .map(v => is_image_value(v) ? 'cover' : 'auto')
        .join(',');
      if (!coords.has_bgsize) {
        rule = `background-size:${sizes};` + rule;
      }
    }

    if (flags.var) {
      this.compose_vars(coords, selector, prop, value);
    }

    if (flags.at) {
      let name = flags.at;
      let transformed = Property[name](value, {
        is_special_selector: is_special_selector(selector),
        grid: coords.grid,
        max_grid: coords.max_grid,
        extra
      });

      switch (name) {
        case 'grid': {
          if (is_host_selector(selector)) {
            rule = transformed.size || '';
            this.add_grid_style(transformed);
          } else {
            rule = '';
            if (!this.is_grid_set) {
              transformed = Property[name](value, {
                is_special_selector: true,
                grid: coords.grid,
                max_grid: coords.max_grid
              });
              this.add_rule(':host', transformed.size || '');
              this.add_grid_style(transformed);
            }
          }
          this.grid = coords.grid;
          this.is_grid_set = true;
          break;
        }
        case 'gap': {
          rule = '';
          if (!this.is_gap_set) {
            this.add_rule(':container', `gap:${transformed};`);
            this.is_gap_set = true;
          }
          break;
        }
        case 'content': {
          rule = '';
          let key = this.compose_selector(coords);
          if (transformed !== undefined && !is_pseudo_selector(selector) && !is_parent_selector(selector)) {
            this.content[key] = remove_quotes(String(transformed));
          }
          this.content[key] = Func.raw({
            rules: {
              doodles: this.doodles
            }
          })(this.content[key] || '');
          break;
        }
        case 'seed': {
          rule = '';
          break;
        }
        case 'place-cell':
        case 'place':
        case 'position':
        case 'offset': {
          if (!is_host_selector(selector)) {
            rule = transformed;
          }
          break;
        }
        case 'use': {
          if (token.value.length) {
            this.compose(coords, token.value);
          }
          rule = '';
          break;
        }
        default: {
          rule = transformed;
        }
      }
    }

    if (flags.grid_like && is_host_selector(selector)) {
      this.add_rule(':container', `${prop}:${value};`);
      rule = '';
    }

    return rule;
  }

  compose_vars(coords, selector, prop, value) {
    let key = coords.count;
    if (is_parent_selector(selector)) {
      key = 'container';
    }
    if (is_host_selector(selector)) {
      key = 'host';
    }
    if (!this.vars[key]) {
      this.vars[key] = {};
    }
    this.vars[key][prop] = value;
  }

  pre_compose_rule(token, _coords, selector) {
    let coords = Object.assign({}, _coords);
    let prop = token.property;
    let context = this.scoped_vars(coords.count);
    if (/^\-\-/.test(prop)) {
      let value = this.get_composed_value(token.value, coords, context, selector).value;
      this.compose_vars(_coords, selector, prop, value);
    }
    switch (prop) {
      case '@grid': {
        let value = this.get_composed_value(token.value, coords, context, selector).value;
        let transformed = Property['grid'](value, {
          max_grid: _coords.max_grid
        });
        this.grid = transformed.grid;
        break;
      }
      case '@use': {
        if (token.value.length) {
          this.pre_compose(coords, token.value);
        }
        break;
      }
    }
  }

  pre_compose(coords, tokens) {
    if (is_nil(this.seed)) {
      // get seed first
      ;(tokens || this.tokens).forEach(token => {
        if (token.type === 'rule' && token.property === '@seed') {
          this.seed = token.rawValue();
        }
        if (token.type === 'pseudo' && is_host_selector(token.selector)) {
          for (let t of make_array(token.styles)) {
            if (t.type === 'rule' && t.property === '@seed') {
              this.seed = t.rawValue();
            }
          }
        }
      });
    }
    ;(tokens || this.tokens).forEach(token => {
      switch (token.type) {
        case 'rule': {
          this.pre_compose_rule(token, coords)
          break;
        }
        case 'pseudo': {
          if (is_host_selector(token.selector)) {
            (token.styles || []).forEach(token => {
              this.pre_compose_rule(token, coords, token.selector);
            });
          }
          break;
        }
      }
    });

    if (this.seed) {
      coords.update_random(this.seed);
    }
  }

  compose_cond(token, coords) {
    let composed_selector = token.name + ' ' + token.segments.map(n => {
      if (n.keyword) return n.keyword;
      if (Array.isArray(n.arguments)) {
        let names = n.arguments.map(arg => {
          return this.compose_argument(arg, coords).value;
        }).join(', ');
        return '(' + names + ')';
      }
      return '';
    }).join(' ');

    let rules = '';

    token.styles.forEach(t => {
      if (t.type === 'rule') {
        rules += this.compose_rule(t, coords);
      }
      if (t.type === 'pseudo' && t.selector) {
        for (let selector of t.selectors) {
          let styles = join(t.styles.map(s => this.compose_rule(s, coords, selector)));
          rules += `${this.compose_selector(coords, selector)} {${styles}}`;
        }
      }
      if (t.type === 'cond') {
        rules += this.compose_cond(t, coords);
      }
    });
    return `${composed_selector} {${rules}}`;
  }

  compose(coords, tokens) {
    this.coords.push(coords);
    for (let token of (tokens || this.tokens)) {
      if (this.skips.has(token)) continue;
      if (token.property === '@gap' && this.is_gap_set) {
        continue;
      }
      if (token.property === '@grid' && this.is_grid_set) {
        continue;
      }
      switch (token.type) {
        case 'rule': {
          this.add_rule(
            this.compose_selector(coords),
            this.compose_rule(token, coords, token)
          );
          break;
        }

        case 'pseudo': {
          let special = is_special_selector(token.selector);
          if (special) {
            this.skips.add(token);
          }
          token.selectors.forEach(selector => {
            let composed = special
              ? selector
              : this.compose_selector(coords, selector);

            token.styles.forEach(s => {
              if (s.type === 'rule') {
                this.add_rule(composed, this.compose_rule(s, coords, selector));
              }
              if (s.type === 'pseudo') {
                let result = s.styles.map(_s =>
                  this.compose_rule(_s, coords, composed)
                );
                this.add_rule(composed + s.selector, result);
              }
              if (s.type === 'cond' && s.name.startsWith('&')) {
                let result = s.styles.map(_s =>
                  this.compose_rule(_s, coords, composed)
                ).join('');
                this.add_rule(composed, s.name + '{' + result + '}');
              }
            });
          });

          break;
        }

        case 'cond': {
          let name = token.name.slice(1);
          let fn = Selector[name];
          if (fn) {
            let group = token.segments.find(n => n.arguments);
            let args = group
              ? group.arguments.map(arg => this.compose_argument(arg, coords))
              : [];
            coords.position = token.position;
            let cond = this.apply_func(fn, coords, args, name);
            if (token.segments && token.segments[0] && token.segments[0].keyword === 'not') {
              cond = !cond;
            }
            if (cond) {
              this.compose(coords, token.styles);
            }
          } else {
            this.add_rule(':top:', this.compose_cond(token, coords));
          }
          break;
        }

        case 'keyframes': {
          if (!this.keyframes[token.name]) {
            const compose_steps = coords => css`
              ${join(token.steps.map(step => css`
                ${this.get_composed_value(step.name, coords).value} {
                  ${join(step.styles.map(s => this.compose_rule(s, coords)))}
                }
              `))}
            `;
            // a keyframes body without functions reads the same for
            // every cell; compose it once
            let is_static = token.steps.every(step =>
              step.name.every(group => group.every(n => n.type === 'text'))
              && step.styles.every(is_static_rule));
            if (is_static) {
              let body = null;
              this.keyframes[token.name] = coords => body ??= compose_steps(coords);
            } else {
              this.keyframes[token.name] = compose_steps;
            }
          }
          break;
        }

        case 'at-rule': {
          this.add_rule(':top:', token.value);
          break;
        }
      }
    }
  }

  output() {
    for (let [selector, rule] of this.rules) {
      if (is_parent_selector(selector)) {
        let name = selector.replace(/^:container\(?/, 'cssd-grid').replace(/\)?$/, '');
        this.styles.container += `${name} {${join(rule)}}`;
      } else if (selector === ':top:') {
        this.styles.top += join(rule);
      } else if (selector === ':gf:') {
        this.styles.gf = rule;
      } else {
        let target = (selector === 'b') ? 'backdrop'
          : is_host_selector(selector) ? 'host' : 'cells';
        let value = join(rule).trim();
        if (value.length) {
          let name = (target === 'host') ? `${selector},.host` : selector;
          this.styles[target] += `${name} {${value}}`;
        }
      }
    }

    if (this.uniforms.time) {
      let n = 'animation-name';
      let t = utime.ticks;
      let un = utime.name;
      let Un = UTime.name;
      this.styles.container += css`
        :host,.host {
          animation:${utime.animation()},${UTime.animation(DELAY + 'ms')};
        }
      `;
      this.styles.keyframes += css`
        @keyframes ${utime[n]} {
          from {--${un}:0} to {--${un}:${t}}
        }
        @keyframes ${UTime[n]} {
          from {--${Un}:0} to {--${Un}:${t}}
        }
      `;
    }

    this.coords.forEach((coords, i) => {
      for (let [name, keyframe] of Object.entries(this.keyframes)) {
        let aname = this.compose_aname(name, coords.count);
        this.styles.keyframes += css`
          ${i === 0 ? `@keyframes ${name} {${keyframe(coords)}}` : ''}
          @keyframes ${aname} {${keyframe(coords)}}
        `;
      }
    });

    let { keyframes, host, container, cells, backdrop, top, gf } = this.styles;
    let main = keyframes + host + container;

    return {
      props: this.props,
      styles: { main, cells, container, backdrop, gf, top, all: main + backdrop + cells },
      grid: this.grid,
      seed: this.seed,
      random: this.random,
      doodles: this.doodles,
      shaders: this.shaders,
      pattern: this.pattern,
      uniforms: this.uniforms,
      content: this.content,
    }
  }

}

function remove_quotes(input) {
  let remove = (input.startsWith('"') && input.endsWith('"'))
    || (input.startsWith("'") && input.endsWith("'"));
  if (remove) {
    return input.substring(1, input.length - 1);
  }
  return input;
}

export default function generate_css(tokens, grid_size, seed_value, max_grid, seed_random, upextra = []) {
  let rules = new Rules(tokens);
  let context = {};
  let R = create_random(seed_random || String(seed_value));
  let { rand, pick, shuffle, update_random } = R;

  rules.pre_compose({
    x: 1, y: 1, z: 1, count: 1, context: {}, extra: [],
    grid: { x: 1, y: 1, z: 1, count: 1 },
    random: R.random, rand, pick, shuffle,
    max_grid, update_random,
    seed_value,
    rules,
    upextra,
  });

  let { grid, seed } = rules.output();

  if (grid) {
    grid_size = grid;
  }

  if (seed) {
    update_random(seed);
  } else {
    seed = seed_value;
  }

  if (is_nil(seed)) {
    seed = Date.now();
    update_random(seed);
  }

  seed = String(seed);
  rules.seed = seed;
  rules.random = R.random;
  rules.reset();

  let count = 0;
  function compose_cell(x, y, z) {
    rules.compose({
      x, y, z,
      count: ++count, grid: grid_size, context, extra: [],
      rand, pick, shuffle,
      random: R.random, seed,
      max_grid,
      upextra,
      rules,
    });
  }

  if (grid_size.z == 1) {
    for (let y = 1; y <= grid_size.y; ++y) {
      for (let x = 1; x <= grid_size.x; ++x) {
        compose_cell(x, y, 1);
      }
    }
  }
  else {
    for (let z = 1; z <= grid_size.z; ++z) {
      compose_cell(1, 1, z);
    }
  }
  return rules.output();
}
