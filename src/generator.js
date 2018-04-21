import Func from './function';
import Property from './property';
import Selector from './selector';
import MathFunc from './math';
import {
  join_line, make_array, apply_args, only_if, prefix
} from './utils';

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

  compose_selector(count, psuedo = '') {
    return `.cell:nth-of-type(${ count })${ psuedo }`;
  }

  compose_argument(argument, coords) {
    let result = argument.map(arg => {
      if (arg.type == 'text') {
        return arg.value;
      }
      else if (arg.type == 'func') {
        let fn = this.pick_func(arg.name.substr(1));
        if (fn) {
          let args = arg.arguments.map(n => {
            return this.compose_argument(n, coords);
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
            let args = val.arguments.map(arg => {
              if (fn.lazy) {
                return () => this.compose_argument(arg, coords);
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

  compose_rule(token, coords, selector) {
    let prop = token.property;
    let value = this.compose_value(token.value, coords);
    let rule = `${ prop }: ${ value };`

    if (prop == 'transition') {
      this.props.has_transition = true;
    }

    if (prop == 'mask' || prop == 'clip-path') {
      rule = prefix(rule);
    }

    if (prop == 'clip-path') {
      // fix clip bug
      rule += ';overflow: hidden;';
    }

    if (prop == 'width' || prop == 'height') {
      if (!is_special_selector(selector)) {
        rule += `--internal-cell-${ prop }: ${ value };`;
      }
    }

    if (/^animation(\-name)?$/.test(prop)) {
      this.props.has_animation = true;
      if (coords.count > 1) {
        let { count } = coords;
        switch (prop) {
          case 'animation-name': {
            rule = `${ prop }: ${ this.compose_aname(value, count) };`;
            break;
          }
          case 'animation': {
            let group = (value || '').split(/\s+/);
            group[0] = this.compose_aname(group[0], count);
            rule = `${ prop }: ${ group.join(' ') };`;
          }
        }
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
            this.compose_selector(coords.count),
            this.compose_rule(token, coords)
          );
          break;

        case 'psuedo': {
          if (token.selector.startsWith(':doodle')) {
            token.selector = token.selector.replace(/^\:+doodle/, ':host');
          }

          let special = is_special_selector(token.selector);

          if (special) {
            token.skip = true;
          }

          let psuedo = token.styles.map(s =>
            this.compose_rule(s, coords, token.selector)
          );

          let selector = special
            ? token.selector
            : this.compose_selector(coords.count, token.selector);

          this.add_rule(selector, psuedo);
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
              ${ join_line(token.steps.map(step => `
                ${ step.name } {
                  ${ join_line(
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
            ${ join_line(this.rules[selector]) }
          }
        `;
      } else {
        let target = is_host_selector(selector) ? 'host' : 'cells';
        this.styles[target] += `
          ${ selector } {
            ${ join_line(this.rules[selector]) }
          }
        `;
      }
    });

    let keyframes = Object.keys(this.keyframes);
    this.coords.forEach((coords, i) => {
      keyframes.forEach(name => {
        let aname = this.compose_aname(name, coords.count);
        this.styles.keyframes += `
          ${ only_if(i == 0,
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
  rules.compose({
    x : 1, y: 1, count: 1,
    grid: { x : 1, y: 1, count: 1 }
  });
  let { grid } = rules.output();
  if (grid) grid_size = grid;
  rules.reset();
  for (let x = 1, count = 0; x <= grid_size.x; ++x) {
    for (let y = 1; y <= grid_size.y; ++y) {
      rules.compose({ x, y, count: ++count, grid: grid_size });
    }
  }
  return rules.output();
}
