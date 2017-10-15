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
    this.reset();
  }

  reset() {
    this.styles = {
      host: '',
      container: '',
      cells: '',
      keyframes: ''
    }
  }

  add_rule(selector, rule) {
    var rules = this.rules[selector];
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
    var result = argument.map(arg => {
      if (arg.type == 'text') {
        return arg.value;
      }
      else if (arg.type == 'func') {
        var fn = this.pick_func(arg.name.substr(1));
        if (fn) {
          var args = arg.arguments.map(n => {
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
          var fn = this.pick_func(val.name.substr(1));
          if (fn) {
            var args = val.arguments.map(arg => {
              return this.compose_argument(arg, coords);
            });
            result += apply_args(fn, coords, args);
          }
        }
      }
      return result;
    }, '');
  }

  compose_rule(token, coords, selector) {
    var prop = token.property;
    var value = this.compose_value(token.value, coords);
    var rule = `${ prop }: ${ value };`

    if (prop == 'transition') {
      this.props.has_transition = true;
    }

    if (prop == 'clip-path') {
      rule = prefix(rule);
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
        var { count } = coords;
        switch (prop) {
          case 'animation-name': {
            rule = `${ prop }: ${ this.compose_aname(value, count) };`;
            break;
          }
          case 'animation': {
            var group = (value || '').split(/\s+/);
            group[0] = this.compose_aname(group[0], count);
            rule = `${ prop }: ${ group.join(' ') };`;
          }
        }
      }
    }

    if (Property[prop]) {
      var transformed = Property[prop](value, {
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

          var special = is_special_selector(token.selector);

          if (special) {
            token.skip = true;
          }

          var psuedo = token.styles.map(s =>
            this.compose_rule(s, coords, token.selector)
          );

          var selector = special
            ? token.selector
            : this.compose_selector(coords.count, token.selector);

          this.add_rule(selector, psuedo);
          break;
        }

        case 'cond': {
          var fn = Selector[token.name.substr(1)];
          if (fn) {
            var args = token.arguments.map(arg => {
              return this.compose_argument(arg, coords);
            });
            var result = apply_args(fn, coords, args);
            if (result) {
              this.compose(coords, token.styles);
            }
          }
          break;
        }

        case 'keyframes': {
          if (!this.keyframes[token.name]) {
            this.keyframes[token.name] = () => `
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
        var target = is_host_selector(selector) ? 'host' : 'cells';
        this.styles[target] += `
          ${ selector } {
            ${ join_line(this.rules[selector]) }
          }
        `;
      }

      Object.keys(this.keyframes).forEach(name => {
        var aname = this.compose_aname(name, i + 1);
        this.styles.keyframes += `
          ${ only_if(i == 0,
            `@keyframes ${ name } {
              ${ this.keyframes[name]() }
            }`
          )}
          @keyframes ${ aname } {
            ${ this.keyframes[name]() }
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
  var rules = new Rules(tokens);
  rules.compose({ x : 1, y: 1, count: 1 });
  var { grid } = rules.output();
  if (grid) grid_size = grid;
  rules.reset();
  for (var x = 1, count = 0; x <= grid_size.x; ++x) {
    for (var y = 1; y <= grid_size.y; ++y) {
      rules.compose({ x, y, count: ++count});
    }
  }
  return rules.output();
}
