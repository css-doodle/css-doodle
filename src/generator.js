import Func from './function';
import Property from './property';
import Selector from './selector';
import MathFunc from './math';
import prefixer from './prefixer';
import parse_value_group from './parser/parse-value-group';

import { maybe, cell_id, is_nil, get_value } from './utils/index.js';

import List from './utils/list';
let { join, make_array, remove_empty_values } = List();

import get_definition from './utils/get-definition';

function is_host_selector(s) {
  return /^\:(host|doodle)/.test(s);
}

function is_parent_selector(s) {
  return /^\:(container|parent)/.test(s);
}

function is_special_selector(s) {
  return is_host_selector(s) || is_parent_selector(s);
}

class Rules {

  constructor(tokens, random) {
    this.tokens = tokens;
    this.rules = {};
    this.props = {};
    this.keyframes = {};
    this.grid = null;
    this.is_grid_defined = false;
    this.coords = [];
    this.doodles = {};
    this.shaders = {};
    this.reset();
    this.Func = Func(random);
    this.Selector = Selector(random);
    this.custom_properties = {};
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
    return this.Func[name] || MathFunc[name];
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

  compose_argument(argument, coords, extra = []) {
    let result = argument.map(arg => {
      if (arg.type === 'text') {
        return arg.value;
      }
      else if (arg.type === 'func') {
        let fname = arg.name.substr(1);
        let fn = this.pick_func(fname);

        if (typeof fn === 'function') {
          if (fname === 'doodle' || fname === 'shaders') {
            let value = get_value((arg.arguments[0] || [])[0]);
            return fname === 'doodle'
              ? this.compose_doodle(value)
              : this.compose_shaders(value, coords);
          }
          coords.extra = extra;
          coords.position = arg.position;
          let args = arg.arguments.map(n => {
            return fn.lazy
              ? (...extra) => this.compose_argument(n, coords, extra)
              : this.compose_argument(n, coords, extra);
          });
          return this.apply_func(fn, coords, args)
        }
      }
    });

    return {
      cluster: argument.cluster,
      value: (result.length >= 2 ? ({ value: result.join('') }) : result[0])
    }
  }

  compose_doodle(doodle) {
    let id = 'doodle_' + Math.random().toString(32).substr(2);
    this.doodles[id] = doodle;
    return '${' + id + '}';
  }

  compose_shaders(shader, {x, y, z}) {
    let id = 'shader_' + Math.random().toString(32).substr(2);
    this.shaders[id] = {
      shader,
      cell: cell_id(x, y, z)
    };
    return '${' + id + '}';
  }

  compose_value(value, coords) {
    if (!Array.isArray(value)) {
      return '';
    }
    return value.reduce((result, val) => {
      switch (val.type) {
        case 'text': {
          result += val.value;
          break;
        }
        case 'func': {
          let fname = val.name.substr(1);
          let fn = this.pick_func(fname);
          if (typeof fn === 'function') {
            if (fname === 'doodle' || fname === 'shaders') {
              let arg = val.arguments[0] || [];
              let value = get_value(arg[0]);
              result += (fname === 'doodle')
                ? this.compose_doodle(value)
                : this.compose_shaders(value, coords);
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
            }
          }
        }
      }
      return result;
    }, '');
  }

  compose_rule(token, _coords, selector) {
    let coords = Object.assign({}, _coords);
    let prop = token.property;
    let value_group = token.value.reduce((ret, v) => {
      let composed = this.compose_value(v, coords);
      if (composed) ret.push(composed);
      return ret;
    }, []);

    let value = value_group.join(', ');

    if (/^animation(\-name)?$/.test(prop)) {
      this.props.has_animation = true;
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
      if (!/["']|^none$|^(var|counter|counters|attr)\(/.test(value)) {
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

    if (prop === 'background' && value.includes('shader')) {
      rule += 'background-size: 100% 100%;';
    }

    if (/^\-\-/.test(prop)) {
      this.custom_properties[prop] = value;
    }

    if (Property[prop]) {
      let transformed = Property[prop](value, {
        is_special_selector: is_special_selector(selector)
      });
      switch (prop) {
        case '@grid': {
          if (is_host_selector(selector)) {
            rule = transformed.size || '';
          } else {
            rule = '';;
            if (!this.is_grid_defined) {
              transformed = Property[prop](value, {
                is_special_selector: true
              });
              this.add_rule(':host', transformed.size || '');
            }
          }
          this.grid = coords.grid;
          this.is_grid_defined = true;
          break;
        }
        case '@place-cell': {
          if (!is_host_selector(selector)) {
            rule = transformed;
          }
          break;
        }
        case '@use': {
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
          if (composed) ret.push(composed);
          return ret;
        }, []);
        let value = value_group.join(', ');
        let transformed = Property[prop](value, {});
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
          let fn = this.Selector[token.name.substr(1)];
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
    Object.keys(this.rules).forEach((selector, i) => {
      if (is_parent_selector(selector)) {
        this.styles.container += `
          .container {
            ${ join(this.rules[selector]) }
          }
        `;
      } else {
        let target = is_host_selector(selector) ? 'host' : 'cells';
        let value = join(this.rules[selector]).trim();
        let name = (target === 'host') ? `${ selector }, .host` : selector;
        this.styles[target] += `${ name } { ${ value  } }`;
      }
    });

    let keyframes = Object.keys(this.keyframes);
    this.coords.forEach((coords, i) => {
      keyframes.forEach(name => {
        let aname = this.compose_aname(name, coords.count);
        this.styles.keyframes += `
          ${ maybe(i === 0,
            `@keyframes ${ name } {
              ${ this.keyframes[name](coords) }
            }`
          )}
          @keyframes ${ aname } {
            ${ this.keyframes[name](coords) }
          }
        `;
      });
    });

    let definitions = [];
    Object.keys(this.custom_properties).forEach(name => {
      let def = get_definition(name);
      if (def) {
        definitions.push(def);
      }
    });

    return {
      props: this.props,
      styles: this.styles,
      grid: this.grid,
      doodles: this.doodles,
      shaders: this.shaders,
      definitions: definitions
    }
  }

}

export default
function generator(tokens, grid_size, random) {
  let rules = new Rules(tokens, random);
  let context = {};

  rules.pre_compose({
    x: 1, y: 1, z: 1, count: 1, context: {},
    grid: { x: 1, y: 1, z: 1, count: 1 }
  });

  let { grid } = rules.output();
  if (grid) grid_size = grid;
  rules.reset();

  if (grid_size.z == 1) {
    for (let y = 1, count = 0; y <= grid_size.y; ++y) {
      for (let x = 1; x <= grid_size.x; ++x) {
        rules.compose({
          x, y, z: 1,
          count: ++count, grid: grid_size, context
        });
      }
    }
  }
  else {
    for (let z = 1, count = 0; z <= grid_size.z; ++z) {
      rules.compose({
        x: 1, y: 1, z,
        count: ++count, grid: grid_size, context
      });
    }
  }

  return rules.output();
}
