import Func from '../function.js';
import Property from '../property.js';
import Selector from '../selector.js';
import parse_value_group from '../parser/parse-value-group.js';
import { uniform_time } from '../uniforms.js';
import { prefixer } from '../utils/prefixer.js';
import calc from '../calc.js';

import { maybe, cell_id, is_nil, get_value, lerp, unique_id } from '../utils/index.js';
import { join, make_array, remove_empty_values } from '../utils/list.js'

function is_host_selector(s) {
  return /^\:(host|doodle)/.test(s);
}

function is_parent_selector(s) {
  return /^\:(container|parent)/.test(s);
}

function is_special_selector(s) {
  return is_host_selector(s) || is_parent_selector(s);
}

const MathFunc = {};
for (let name of Object.getOwnPropertyNames(Math)) {
  MathFunc[name] = () => (...args) => {
    if (typeof Math[name] === 'number') {
      return Math[name];
    }
    args = args.map(n => calc(get_value(n)));
    return Math[name](...args);
  }
}

class Rules {

  constructor(tokens) {
    this.tokens = tokens;
    this.rules = {};
    this.props = {};
    this.keyframes = {};
    this.grid = null;
    this.is_grid_defined = false;
    this.coords = [];
    this.doodles = {};
    this.canvas = {};
    this.pattern = {};
    this.shaders = {};
    this.reset();
    this.custom_properties = {};
    this.uniforms = {};
  }

  reset() {
    this.styles = {
      host: '',
      container: '',
      cells: '',
      keyframes: ''
    }
    this.coords = [];
    this.doodles = {};
    this.canvas = {};
    this.pattern = {};
    this.shaders = {};
    for (let key in this.rules) {
      if (key.startsWith('#c')) {
        delete this.rules[key];
      }
    }
  }

  add_rule(selector, rule) {
    let rules = this.rules[selector];
    if (!rules) {
      rules = this.rules[selector] = [];
    }
    rules.push.apply(rules, make_array(rule));
  }

  pick_func(name) {
    return Func[name] || MathFunc[name];
  }

  apply_func(fn, coords, args) {
    let _fn = fn(...make_array(coords));
    let input = [];
    args.forEach(arg => {
      let type = typeof arg.value;
      let is_string_or_number = (type === 'number' || type === 'string');
      if (!arg.cluster && (is_string_or_number)) {
        input.push(...parse_value_group(arg.value, true));
      }
      else {
        if (typeof arg === 'function') {
          input.push(arg);
        }
        else if (!is_nil(arg.value)) {
          let value = get_value(arg.value);
          input.push(value);
        }
      }
    });
    input = remove_empty_values(input);
    let result = _fn(...make_array(input));
    return result;
  }

  compose_aname(...args) {
    return args.join('-');
  }

  compose_selector({ x, y, z}, pseudo = '') {
    return `#${ cell_id(x, y, z) }${ pseudo }`;
  }

  is_composable(name) {
    return ['doodle', 'shaders', 'canvas', 'pattern'].includes(name);
  }

  compose_argument(argument, coords, extra = []) {
    let result = argument.map(arg => {
      if (arg.type === 'text') {
        return arg.value;
      }
      else if (arg.type === 'func') {
        let fname = arg.name.substr(1);
        let fn = this.pick_func(fname);
        if (typeof fn === 'function') {
          this.check_uniforms(fname);
          if (this.is_composable(fname)) {
            let value = get_value((arg.arguments[0] || [])[0]);
            if (!is_nil(value)) {
              switch (fname) {
                case 'doodle':
                  return this.compose_doodle(value);
                case 'shaders':
                  return this.compose_shaders(value, coords);
                case 'canvas':
                  return this.compose_canvas(value, arg.arguments.slice(1));
                case 'pattern':
                  return this.compose_pattern(value, coords);
              }
            }
          }
          coords.extra = extra;
          coords.position = arg.position;
          let args = arg.arguments.map(n => {
            return fn.lazy
              ? (...extra) => this.compose_argument(n, coords, extra)
              : this.compose_argument(n, coords, extra);
          });
          let value = this.apply_func(fn, coords, args);
          return value;
        } else {
          return arg.name;
        }
      }
    });

    return {
      cluster: argument.cluster,
      value: (result.length >= 2 ? ({ value: result.join('') }) : result[0])
    }
  }

  compose_doodle(doodle) {
    let id = unique_id('doodle');
    this.doodles[id] = doodle;
    return '${' + id + '}';
  }

  compose_shaders(shader, {x, y, z}) {
    let id = unique_id('shader');
    this.shaders[id] = {
      shader,
      cell: cell_id(x, y, z)
    };
    return '${' + id + '}';
  }

  compose_pattern(code, {x, y, z}) {
    let id = unique_id('pattern');
    this.pattern[id] = {
      code,
      cell: cell_id(x, y, z)
    };
    return '${' + id + '}';
  }

  compose_canvas(code, rest = []) {
    let commands = code;
    let result = rest.map(group => get_value(group[0])).join(',');
    if (result.length) {
      commands = code + ',' + result;
    }
    let id = unique_id('canvas');
    this.canvas[id] = { code: commands };
    return '${' + id + '}';
  }

  check_uniforms(name) {
    switch (name) {
      case 'ut': case 't': this.uniforms.time = true; break;
      case 'ux': this.uniforms.mousex = true; break;
      case 'uy': this.uniforms.mousey = true; break;
      case 'uw': this.uniforms.width = true; break;
      case 'uh': this.uniforms.height = true; break;
    }
  }

  compose_value(value, coords) {
    if (!Array.isArray(value)) {
      return {
        value: '',
        extra: '',
      }
    }
    let extra = '';
    let output = value.reduce((result, val) => {
      switch (val.type) {
        case 'text': {
          result += val.value;
          break;
        }
        case 'func': {
          let fname = val.name.substr(1);
          let fn = this.pick_func(fname);
          if (typeof fn === 'function') {
            this.check_uniforms(fname);
            if (this.is_composable(fname)) {
              let value = get_value((val.arguments[0] || [])[0]);
              if (!is_nil(value)) {
                switch (fname) {
                  case 'doodle':
                    result += this.compose_doodle(value); break;
                  case 'shaders':
                    result += this.compose_shaders(value, coords); break;
                  case 'pattern':
                    result += this.compose_pattern(value, coords); break;
                  case 'canvas':
                    result += this.compose_canvas(value, val.arguments.slice(1)); break;
                }
              }
            } else {
              coords.position = val.position;
              let args = val.arguments.map(arg => {
                return fn.lazy
                  ? (...extra) => this.compose_argument(arg, coords, extra)
                  : this.compose_argument(arg, coords);
              });

              let output = this.apply_func(fn, coords, args);
              if (!is_nil(output)) {
                result += output;
              }
              if (output.extra) {
                extra = output.extra;
              }
            }
          }
        }
      }
      return result;
    }, '');

    return {
      value: output,
      extra: extra,
    }
  }

  compose_rule(token, _coords, selector) {
    let coords = Object.assign({}, _coords);
    let prop = token.property;
    let extra;
    let value_group = token.value.reduce((ret, v) => {
      let composed = this.compose_value(v, coords);
      if (composed) {
        if (composed.value) {
          ret.push(composed.value);
        }
        if (composed.extra) {
          extra = composed.extra;
        }
      }
      return ret;
    }, []);

    let value = value_group.join(', ');

    if (/^animation(\-name)?$/.test(prop)) {
      this.props.has_animation = true;

      if (is_host_selector(selector)) {
        let prefix = uniform_time[prop];
        if (prefix && value) {
          value =  prefix + ',' + value;
        }
      }

      if (coords.count > 1) {
        let { count } = coords;
        switch (prop) {
          case 'animation-name': {
            value = value_group
              .map(n => this.compose_aname(n, count))
              .join(', ');
            break;
          }
          case 'animation': {
            value = value_group
              .map(n => {
                let group = (n || '').split(/\s+/);
                group[0] = this.compose_aname(group[0], count);
                return group.join(' ');
              })
              .join(', ');
          }
        }
      }
    }

    if (prop === 'content') {
      if (!/["']|^none$|^(var|counter|counters|attr|url)\(/.test(value)) {
        value = `'${ value }'`;
      }
    }

    if (prop === 'transition') {
      this.props.has_transition = true;
    }

    let rule = `${ prop }: ${ value };`
    rule = prefixer(prop, rule);

    if (prop === 'clip-path') {
      // fix clip bug
      rule += ';overflow: hidden;';
    }

    if (prop === 'width' || prop === 'height') {
      if (!is_special_selector(selector)) {
        rule += `--internal-cell-${ prop }: ${ value };`;
      }
    }

    if (prop === 'background' && (value.includes('shader') || value.includes('canvas') || value.includes('pattern'))) {
      rule += 'background-size: 100% 100%;';
    }

    if (/^\-\-/.test(prop)) {
      this.custom_properties[prop] = value;
    }

    if (/^@/.test(prop) && Property[prop.substr(1)]) {
      let name = prop.substr(1);
      let transformed = Property[name](value, {
        is_special_selector: is_special_selector(selector),
        grid: coords.grid,
        extra
      });
      switch (name) {
        case 'grid': {
          if (is_host_selector(selector)) {
            rule = transformed.size || '';
          } else {
            rule = '';
            if (!this.is_grid_defined) {
              transformed = Property[name](value, {
                is_special_selector: true,
                grid: coords.grid
              });
              this.add_rule(':host', transformed.size || '');
            }
          }
          this.grid = coords.grid;
          this.is_grid_defined = true;
          break;
        }
        case 'place-cell':
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

    return rule;
  }

  pre_compose_rule(token, _coords) {
    let coords = Object.assign({}, _coords);
    let prop = token.property;

    switch (prop) {
      case '@grid': {
        let value_group = token.value.reduce((ret, v) => {
          let composed = this.compose_value(v, coords);
          if (composed && composed.value) ret.push(composed.value);
          return ret;
        }, []);
        let value = value_group.join(', ');
        let name = prop.substr(1);
        let transformed = Property[name](value, {});
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
    (tokens || this.tokens).forEach(token => {
      switch (token.type) {
        case 'rule': {
          this.pre_compose_rule(token, coords)
          break;
        }
        case 'pseudo': {
          if (is_host_selector(token.selector)) {
            (token.styles || []).forEach(token => {
              this.pre_compose_rule(token, coords);
            });
          }
          break;
        }
      }
    });
  }

  compose(coords, tokens, initial) {
    this.coords.push(coords);
    (tokens || this.tokens).forEach((token, i) => {
      if (token.skip) return false;
      if (initial && this.grid) return false;

      switch (token.type) {
        case 'rule': {
          this.add_rule(
            this.compose_selector(coords),
            this.compose_rule(token, coords)
          );
          break;
        }

        case 'pseudo': {
          if (token.selector.startsWith(':doodle')) {
            token.selector = token.selector.replace(/^\:+doodle/, ':host');
          }
          let special = is_special_selector(token.selector);
          if (special) {
            token.skip = true;
          }
          token.selector.split(',').forEach(selector => {
            let pseudo = token.styles.map(s =>
              this.compose_rule(s, coords, selector)
            );
            let composed = special
              ? selector
              : this.compose_selector(coords, selector);
            this.add_rule(composed, pseudo);
          });

          break;
        }

        case 'cond': {
          let fn = Selector[token.name.substr(1)];
          if (fn) {
            let args = token.arguments.map(arg => {
              return this.compose_argument(arg, coords);
            });
            let result = this.apply_func(fn, coords, args);
            if (result) {
              this.compose(coords, token.styles);
            }
          }
          break;
        }

        case 'keyframes': {
          if (!this.keyframes[token.name]) {
            this.keyframes[token.name] = coords => `
              ${ join(token.steps.map(step => `
                ${ step.name } {
                  ${ join(
                    step.styles.map(s => this.compose_rule(s, coords))
                  )}
                }
              `)) }
            `;
          }
        }
      }
    });
  }

  output() {
    for (let [selector, rule] of Object.entries(this.rules)) {
      if (is_parent_selector(selector)) {
        this.styles.container += `
          .container {
            ${ join(rule) }
          }
        `;
      } else {
        let target = is_host_selector(selector) ? 'host' : 'cells';
        let value = join(rule).trim();
        let name = (target === 'host') ? `${ selector }, .host` : selector;
        this.styles[target] += `${ name } { ${ value  } }`;
      }
    }

    if (this.uniforms.time) {
      this.styles.container += `
        :host, .host {
          animation: ${ uniform_time.animation };
        }
      `;
      this.styles.keyframes += `
       @keyframes ${ uniform_time['animation-name'] } {
         from { --${ uniform_time.name }: 0 }
         to { --${ uniform_time.name }: ${ uniform_time['animation-duration'] / 10 } }
       }
      `;
    }

    this.coords.forEach((coords, i) => {
      for (let [name, keyframe] of Object.entries(this.keyframes)) {
        let aname = this.compose_aname(name, coords.count);
        this.styles.keyframes += `
          ${ maybe(i === 0, `@keyframes ${ name } { ${ keyframe(coords) } }`)}
          @keyframes ${ aname } {
            ${ keyframe(coords) }
          }
        `;
      }
    });

    return {
      props: this.props,
      styles: this.styles,
      grid: this.grid,
      doodles: this.doodles,
      shaders: this.shaders,
      canvas: this.canvas,
      pattern: this.pattern,
      uniforms: this.uniforms
    }
  }

}

function generate_css(tokens, grid_size, random) {
  let rules = new Rules(tokens);
  let context = {};

  function rand(start = 0, end) {
    if (arguments.length == 1) {
      [start, end] = [0, start];
    }
    return lerp(random(), start, end);
  }

  function pick(...items) {
    let args = items.reduce((acc, n) => acc.concat(n), []);
    return args[~~(random() * args.length)];
  }

  function shuffle(arr) {
    let ret = [...arr];
    let m = arr.length;
    while (m) {
      let i = ~~(random() * m--);
      let t = ret[m];
      ret[m] = ret[i];
      ret[i] = t;
    }
    return ret;
  }

  rules.pre_compose({
    x: 1, y: 1, z: 1, count: 1, context: {},
    grid: { x: 1, y: 1, z: 1, count: 1 },
    random, rand, pick, shuffle,
  });

  let { grid } = rules.output();
  if (grid) grid_size = grid;
  rules.reset();

  if (grid_size.z == 1) {
    for (let y = 1, count = 0; y <= grid_size.y; ++y) {
      for (let x = 1; x <= grid_size.x; ++x) {
        rules.compose({
          x, y, z: 1,
          count: ++count, grid: grid_size, context,
          random, rand, pick, shuffle,
        });
      }
    }
  }
  else {
    for (let z = 1, count = 0; z <= grid_size.z; ++z) {
      rules.compose({
        x: 1, y: 1, z,
        count: ++count, grid: grid_size, context,
        random, rand, pick, shuffle,
      });
    }
  }

  return rules.output();
}

export {
  generate_css,
}
