import * as cond from './cond';
import * as func from './function';
import * as utils from './utils';

class Rules {
  constructor(tokens) {
    this.tokens = tokens;
    this.rules = {};
    this.props = {};
    this.styles = {
      host: '', cells: ''
    }
  }
  add_rule(selector, rule) {
    var rules = this.rules[selector];
    if (!rules) {
      rules = this.rules[selector] = [];
    }
    rules.push.apply(rules, utils.make_array(rule));
  }
  compose_selector(count, psudo = '') {
    return `.cell:nth-of-type(${ count }) .shape${ psudo }`;
  }
  compose_value(value, coords) {
    return value.reduce((result, val) => {
      switch (val.type) {
        case 'text': {
          result += val.value;
          break;
        }
        case 'function': {
          var fn = func[val.name.substr(1)];
          if (fn) {
            result += utils.apply_args(
              fn, coords, val.arguments
            );
          }
        }
      }
      return result;
    }, '');
  }
  compose_rule(token, coords) {
    var property = token.property;
    var value = this.compose_value(token.value, coords);
    if (property == 'transition') {
      this.props.has_transition = true;
    }
    var rule = `${ property }: ${ value };`
    if (property == 'clip-path') {
      rule = utils.prefix(rule);
    }
    if (property == 'size') {
      rule = `width: ${ value }; height: ${ value };`;
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

        case 'psudo': {
          if (token.selector.startsWith(':doodle')) {
            token.selector =
              token.selector.replace(/^\:+doodle/, ':host');
          }

          var is_host_selector =
            token.selector.startsWith(':host');

          if (is_host_selector) {
            token.skip = true;
          }

          var psudo_rules = token.styles.map(s =>
            this.compose_rule(s, coords)
          );

          var selector = is_host_selector
            ? token.selector
            : this.compose_selector(coords.count, token.selector);

          this.add_rule(selector, psudo_rules);
          break;
        }

        case 'cond':
          var fn = cond[token.name.substr(1)];
          if (fn) {
            var result = utils.apply_args(fn, coords, token.arguments);
            if (result) {
              this.compose(coords, token.styles);
            }
          }
          break;
      }
    });
  }

  output() {
    Object.keys(this.rules).forEach(selector => {
      var is_host = selector.startsWith(':host');
      const target = is_host ? 'host': 'cells';
      this.styles[target] += `
        ${ selector } {
          ${ utils.join_line(this.rules[selector]) }
        }
      `;
    });
    return {
      props: this.props,
      styles: this.styles
    }
  }
}

export default
function generator(tokens, size) {
  var rules = new Rules(tokens);
  for (var x = 1, count = 0; x <= size.x; ++x) {
    for (var y = 1; y <= size.y; ++y) {
      rules.compose({ x, y, count: ++count});
    }
  }
  return rules.output();
}
