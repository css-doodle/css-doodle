import Func from '../function.js';
import Property from '../property.js';
import Selector from '../selector.js';
import parse_value_group from '../parser/parse-value-group.js';

import calc from '../calc.js';
import { uniform_time } from '../uniforms.js';
import { seedrandom } from '../lib/seedrandom.js';

import { prefixer } from '../utils/prefixer.js';
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

function is_pseudo_selecotr(s) {
  return /\:before|\:after/.test(s);
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
    this.seed = null;
    this.is_grid_defined = false;
    this.is_gap_defined = false;
    this.coords = [];
    this.doodles = {};
    this.canvas = {};
    this.pattern = {};
    this.shaders = {};
    this.reset();
    this.custom_properties = {};
    this.uniforms = {};
    this.content = {};
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
    this.content = {};
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
    if (name.startsWith('$')) name = 'calc';
    return Func[name] || MathFunc[name];
  }

  apply_func(fn, coords, args, fname) {
    let _fn = fn(...make_array(coords));
    let input = [];
    args.forEach(arg => {
      let type = typeof arg.value;
      let is_string_or_number = (type === 'number' || type === 'string');
      if (!arg.cluster && (is_string_or_number)) {
        input.push(...parse_value_group(arg.value, { noSpace: true }));
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
    input = make_array(remove_empty_values(input));
    if (typeof _fn === 'function') {
      if (fname.startsWith('$')) {
        let group = Object.assign({},
          this.custom_properties['host'],
          this.custom_properties['container'],
          this.custom_properties[coords.count]
        );
        let context = {};
        let unit = '';
        for (let [name, key] of Object.entries(group)) {
          context[name.substr(2)] = key;
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

  compose_selector({ x, y, z}, pseudo = '') {
    return `#${ cell_id(x, y, z) }${ pseudo }`;
  }

  is_composable(name) {
    return ['doodle', 'shaders', 'canvas', 'pattern'].includes(name);
  }

  read_var(value, coords) {
    let count = coords.count;
    let group = Object.assign({},
      this.custom_properties['host'],
      this.custom_properties['container'],
      this.custom_properties[count]
    );
    if (group[value] !== undefined) {
      let result = String(group[value]).trim();
      if (result[0] == '(') {
        let last = result[result.length - 1];
        if (last === ')') {
          result = result.substring(1, result.length - 1);
        }
      }
      return result.replace(/;+$/g, '');
    }
    return value;
  }

  compose_argument(argument, coords, extra = [], parent) {
    if (!coords.extra) coords.extra = [];
    coords.extra.push(extra);
    let result = argument.map(arg => {
      if (arg.type === 'text') {
        if (/^\-\-\w/.test(arg.value)) {
          if (parent && parent.name === '@var') {
            return arg.value;
          }
          return this.read_var(arg.value, coords);
        }
        return arg.value;
      }
      else if (arg.type === 'func') {
        let fname = arg.name.substr(1);
        let fn = this.pick_func(fname);
        if (typeof fn === 'function') {
          this.check_uniforms(fname);
          if (this.is_composable(fname)) {
            let value = get_value((arg.arguments[0] || [])[0]);
            let temp_arg;
            if (fname === 'doodle') {
              if (/^\d/.test(value)) {
                temp_arg = value;
                value = get_value((val.arguments[1] || [])[0]);
              }
            }
            if (!is_nil(value)) {
              switch (fname) {
                case 'doodle':
                  return this.compose_doodle(this.inject_variables(value, coords.count), temp_arg);
                case 'shaders':
                  return this.compose_shaders(value, coords);
                case 'canvas':
                  return this.compose_canvas(value, arg.arguments.slice(1));
                case 'pattern':
                  return this.compose_pattern(value, coords);
              }
            }
          }
          coords.position = arg.position;
          let args = arg.arguments.map(n => {
            return fn.lazy
              ? (...extra) => this.compose_argument(n, coords, extra, arg)
              : this.compose_argument(n, coords, extra, arg);
          });
          let value = this.apply_func(fn, coords, args, fname);
          return value;
        } else {
          return arg.name;
        }
      }
    });

    coords.extra.pop();

    return {
      cluster: argument.cluster,
      value: (result.length >= 2 ? ({ value: result.join('') }) : result[0])
    }
  }

  compose_doodle(doodle, arg) {
    let id = unique_id('doodle');
    this.doodles[id] = { doodle, arg };
    return '${' + id + '}';
  }

  compose_shaders(shader, {x, y, z}) {
    let id = unique_id('shader');
    this.shaders[id] = {
      id: '--' + id,
      shader,
      cell: cell_id(x, y, z)
    };
    return '${' + id + '}';
  }

  compose_pattern(code, {x, y, z}) {
    let id = unique_id('pattern');
    this.pattern[id] = {
      id: '--' + id,
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

  inject_variables(value, count) {
    let group = Object.assign({},
      this.custom_properties['host'],
      this.custom_properties['container'],
      this.custom_properties[count]
    );
    let variables = [];
    for (let [name, key] of Object.entries(group)) {
      variables.push(`${name}: ${key};`);
    }
    variables = variables.join('');
    if (variables.length) {
      return `:doodle { ${variables} }` + value;
    }
    return value;
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
              let temp_arg;
              if (fname === 'doodle') {
                if (/^\d/.test(value)) {
                  temp_arg = value;
                  value = get_value((val.arguments[1] || [])[0]);
                }
              }
              if (!is_nil(value)) {
                switch (fname) {
                  case 'doodle':
                    result += this.compose_doodle(this.inject_variables(value, coords.count), temp_arg); break;
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
                  ? (...extra) => this.compose_argument(arg, coords, extra, val)
                  : this.compose_argument(arg, coords, [], val);
              });

              let output = this.apply_func(fn, coords, args, fname);
              if (!is_nil(output)) {
                result += output;
                if (output.extra) {
                  extra = output.extra;
                }
              }
            }
          } else {
            result += val.name;
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

  add_grid_style({ fill, clip, rotate, scale, translate, flexRow, flexColumn }) {
    if (fill) {
      this.add_rule(':host', `background-color: ${fill};`);
    }
    if (!clip) {
      this.add_rule(':host', 'contain: none;');
    }
    if (rotate) {
      this.add_rule(':container', `rotate: ${rotate};`);
    }
    if (scale) {
      this.add_rule(':container', `scale: ${scale};`);
    }
    if (translate) {
      this.add_rule(':container', `translate: ${translate};`);
    }
    if (flexRow) {
      this.add_rule(':container', `display: flex;`);
      this.add_rule('cell', `flex: 1;`);
    }
    if (flexColumn) {
      this.add_rule(':container', `display: flex; flex-direction: column;`);
      this.add_rule('cell', `flex: 1;`);
    }
  }

  compose_rule(token, _coords, selector) {
    let coords = Object.assign({}, _coords);
    let prop = token.property;
    let extra;
    if (prop === '@seed') {
      return '';
    }
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
      if (!/["']|^none\s?$|^(var|counter|counters|attr|url)\(/.test(value)) {
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

    let is_image = (
      /^(background|background\-image)$/.test(prop) &&
      /\$\{(canvas|shader|pattern)/.test(value)
    );
    if (is_image) {
      rule += 'background-size: 100% 100%;';
    }

    if (/^\-\-/.test(prop)) {
      let key = _coords.count;
      if (is_parent_selector(selector)) {
        key = 'container';
      }
      if (is_host_selector(selector)) {
        key = 'host';
      }
      if (!this.custom_properties[key]) {
        this.custom_properties[key] = {};
      }
      this.custom_properties[key][prop] = value;
    }

    if (/^@/.test(prop) && Property[prop.substr(1)]) {
      let name = prop.substr(1);
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
            if (!this.is_grid_defined) {
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
          this.is_grid_defined = true;
          break;
        }
        case 'gap': {
          rule = '';
          if (!this.is_gap_defined) {
            this.add_rule(':container', `gap: ${transformed};`);
            this.is_gap_defined = true;
          }
          break;
        }
        case 'content': {
          rule = '';
          let key = this.compose_selector(coords);
          if (transformed !== undefined && !is_pseudo_selecotr(selector) && !is_parent_selector(selector)) {
            this.content[key] = remove_quotes(String(transformed));
          }
          this.content[key] = Func.raw({
            rules: {
              doodles: this.doodles
            }
          })(this.content[key] || '');
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

    return rule;
  }

  get_raw_value(token) {
    let raw = token.raw();
    if (is_nil(raw)){
      raw = '';
    }
    let [_, ...rest] = raw.split(token.property);
    // It's not accurate, will be solved after the rewrite of css parser.
    rest = rest.join(token.property)
      .replace(/^\s*:\s*/, '')
      .replace(/[;}<]$/, '').trim()
      .replace(/[;}<]$/, '');
    return rest;
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
        let transformed = Property[name](value, {
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
          this.seed = this.get_raw_value(token);
        }
        if (token.type === 'pseudo' && is_host_selector(token.selector)) {
          for (let t of make_array(token.styles)) {
            if (t.type === 'rule' && t.property === '@seed') {
              this.seed = this.get_raw_value(t);
            }
          }
        }
      });
      if (is_nil(this.seed)) {
        //this.seed = coords.seed_value;
      } else {
        coords.update_random(this.seed);
      }
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
          let name = token.name.substr(1);
          let fn = Selector[name];
          if (fn) {
            let args = token.arguments.map(arg => {
              return this.compose_argument(arg, coords);
            });
            let cond = this.apply_func(fn, coords, args, name);
            if (Array.isArray(token.addition)) {
              for (let c of token.addition) {
                if (c === 'not') cond = !cond;
              }
            }
            if (cond) {
              if (cond.selector) {
                token.styles.forEach(_token => {
                  if (_token.type === 'rule') {
                    this.add_rule(
                      cond.selector.replaceAll('$', this.compose_selector(coords)),
                      this.compose_rule(_token, coords)
                    )
                  }
                  if (_token.type === 'pseudo') {
                    _token.selector.split(',').forEach(selector => {
                      let pseudo = _token.styles.map(s =>
                        this.compose_rule(s, coords, selector)
                      );
                      this.add_rule(
                        (cond.selector + selector).replaceAll('$', this.compose_selector(coords)),
                        pseudo
                      );
                    });
                  }
                });
              } else {
                this.compose(coords, token.styles);
              }
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
        if (value.length) {
          let name = (target === 'host') ? `${ selector }, .host` : selector;
          this.styles[target] += `${ name } { ${ value  } }`;
        }
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
      seed: this.seed,
      random: this.random,
      doodles: this.doodles,
      shaders: this.shaders,
      canvas: this.canvas,
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

function generate_css(tokens, grid_size, seed_value, max_grid, seed_random) {
  let rules = new Rules(tokens);
  let random = seed_random || seedrandom(String(seed_value));
  let context = {};

  function update_random(seed) {
    random = seedrandom(String(seed));
  }

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
    max_grid, update_random,
    seed_value,
    rules,
  });

  let { grid, seed } = rules.output();

  if (grid) {
    grid_size = grid;
  }

  if (seed) {
    seed = String(seed);
    random = seedrandom(seed);
  } else {
    seed = seed_value;
  }

  if (is_nil(seed)) {
    seed = Date.now();
    random = seedrandom(seed);
  }

  seed = String(seed);
  rules.seed = seed;
  rules.random = random;
  rules.reset();

  if (grid_size.z == 1) {
    for (let y = 1, count = 0; y <= grid_size.y; ++y) {
      for (let x = 1; x <= grid_size.x; ++x) {
        rules.compose({
          x, y, z: 1,
          count: ++count, grid: grid_size, context,
          rand, pick, shuffle,
          random, seed,
          max_grid,
          rules,
        });
      }
    }
  }
  else {
    for (let z = 1, count = 0; z <= grid_size.z; ++z) {
      rules.compose({
        x: 1, y: 1, z,
        count: ++count, grid: grid_size, context,
        rand, pick, shuffle,
        random, seed,
        max_grid,
        rules,
      });
    }
  }

  return rules.output();
}

export {
  generate_css,
}
