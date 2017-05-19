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
    let rules = this.rules[selector];
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
          let fn = func[val.name.substr(1)];
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
    let property = token.property;
    let value = this.compose_value(token.value, coords);
    if (property == 'transition') {
      this.props.has_transition = true;
    }
    return `${ property }: ${ value };`;
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

          let is_host_selector =
            token.selector.startsWith(':host');

          if (is_host_selector) {
            token.skip = true;
          }

          let psudo_rules = token.styles.map(s =>
            this.compose_rule(s, coords)
          );

          let selector = is_host_selector
            ? token.selector
            : this.compose_selector(coords.count, token.selector);

          this.add_rule(selector, psudo_rules);
          break;
        }

        case 'cond':
          let fn = cond[token.name.substr(1)];
          if (fn) {
            let result = utils.apply_args(fn, coords, token.arguments);
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
      let is_host = selector.startsWith(':host');
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
  let rules = new Rules(tokens);
  for (let x = 1, count = 0; x <= size.x; ++x) {
    for (let y = 1; y <= size.y; ++y) {
      rules.compose({ x, y, count: ++count});
    }
  }
  return rules.output();
}
