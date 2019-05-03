import Func from './function';
import Property from './property';
import Selector from './selector';
import MathFunc from './math';
import prefixer from './prefixer';

import { apply_args, maybe, cell_id } from './utils/index.js';
import { join, make_array } from './utils/list';

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

  constructor(tokens) {
    this.tokens = tokens;
    this.rules = {};
    this.props = {};
    this.keyframes = {};
    this.grid = null;
    this.coords = [];
    this.reset();
  }

  reset() {
    this.styles = {
      host: '',
      container: '',
      cells: '',
      keyframes: ''
    }
    this.coords = [];
    for (let key in this.rules) {
      if (key.startsWith('#cell')) {
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

  compose_aname(...args) {
    return args.join('-');
  }

  compose_selector({ x, y, z}, pseudo = '') {
    return `#${ cell_id(x, y, z) }${ pseudo }`;
  }

  compose_argument(argument, coords, idx) {
    let result = argument.map(arg => {
      if (arg.type == 'text') {
        return arg.value;
      }
      else if (arg.type == 'func') {
        let fn = this.pick_func(arg.name.substr(1));
        if (fn) {
          coords.idx = idx;
          coords.position = arg.position;
          let args = arg.arguments.map(n => {
            return fn.lazy
              ? idx => this.compose_argument(n, coords, idx)
              : this.compose_argument(n, coords, idx);
          });
          return apply_args(fn, coords, args);
        }
      }
    });

    return (result.length >= 2)
      ? result.join('')
      : result[0];
  }

  compose_value(value, coords) {
    if (!value || !value.reduce) return '';
    return value.reduce((result, val) => {
      switch (val.type) {
        case 'text': {
          result += val.value;
          break;
        }
        case 'func': {
          let fname = val.name.substr(1);
          let fn = this.pick_func(fname);
          if (fn) {
            coords.position = val.position;
            let args = val.arguments.map(arg => {
              if (fn.lazy) {
                return idx => this.compose_argument(arg, coords, idx);
              } else {
                return this.compose_argument(arg, coords);
              }
            });
            result += apply_args(fn, coords, args);
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

    if (prop == 'content') {
      if (!/["']|^none$|^(var|counter|counters|attr)\(/.test(value)) {
        value = `'${ value }'`;
      }
    }

    if (prop == 'transition') {
      this.props.has_transition = true;
    }

    let rule = `${ prop }: ${ value };`
    rule = prefixer(prop, rule);

    if (prop == 'clip-path') {
      // fix clip bug
      rule += ';overflow: hidden;';
    }

    if (prop == 'width' || prop == 'height') {
      if (!is_special_selector(selector)) {
        rule += `--internal-cell-${ prop }: ${ value };`;
      }
    }

    if (Property[prop]) {
      let transformed = Property[prop](value, {
        is_special_selector: is_special_selector(selector)
      });
      switch (prop) {
        case '@grid': {
          if (is_host_selector(selector)) {
            this.grid = transformed.grid;
            rule = transformed.size || '';
          }
          break;
        }
        case '@place-cell': {
          if (!is_host_selector(selector)) {
            rule = transformed;
          }
        }
        case '@use': {
          if (token.value.length) {
            this.compose(coords, token.value);
          }
          rule = Property[prop](token.value);
        }
        default: {
          rule = transformed;
        }
      }
    }

    return rule;
  }

  compose(coords, tokens) {
    this.coords.push(coords);
    (tokens || this.tokens).forEach((token, i) => {
      if (token.skip) return false;
      switch (token.type) {
        case 'rule':
          this.add_rule(
            this.compose_selector(coords),
            this.compose_rule(token, coords)
          );
          break;

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
            let result = apply_args(fn, coords, args);
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
        this.styles[target] += `
          ${ selector } {
            ${ join(this.rules[selector]) }
          }
        `;
      }
    });

    let keyframes = Object.keys(this.keyframes);
    this.coords.forEach((coords, i) => {
      keyframes.forEach(name => {
        let aname = this.compose_aname(name, coords.count);
        this.styles.keyframes += `
          ${ maybe(i == 0,
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

    return {
      props: this.props,
      styles: this.styles,
      grid: this.grid
    }
  }
}

export default
function generator(tokens, grid_size) {
  let rules = new Rules(tokens);
  let context = {};
  rules.compose({
    x: 1, y: 1, z: 1, count: 1, context: {},
    grid: { x: 1, y: 1, z: 1, count: 1 }
  });
  let { grid } = rules.output();
  if (grid) grid_size = grid;
  rules.reset();

  if (grid_size.z == 1) {
    for (let x = 1, count = 0; x <= grid_size.x; ++x) {
      for (let y = 1; y <= grid_size.y; ++y) {
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
