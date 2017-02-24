import * as cond from './cond';
import * as func from './function';

function values(obj) {
  return Array.isArray(obj)
    ? obj : Object.keys(obj).map(k => obj[k]);
}

function with_args(fn, ...args) {
  return args.reduce((f, arg) => f.apply(null, values(arg)), fn);
}

function join_line(arr) {
  return (arr || []).join('\n');
}

function rule_set() {
  const set = {};
  return {
    add(selector, rule) {
      let rules = set[selector];
      if (!rules) rules = set[selector] = [];
      rules.push.apply(
        rules,
        Array.isArray(rule) ? rule : [rule]
      );
    },
    output() {
      return join_line(Object.keys(set).map(selector => `
        ${ selector } {
          ${ join_line(set[selector]) }
        }
      `));
    }
  }
}

function compose_selector(count, psudo = '') {
  return `.cell:nth-of-type(${ count }) .shape${ psudo }`;
}

function compose_value(value, coords) {
  return value.map(val => {
    switch (val.type) {
      case 'text': {
        return val.value;
      }
      case 'function': {
        let fn = func[val.name.substr(1)];
        if (fn) {
          return with_args(fn, coords, val.arguments);
        }
      }
      default: return '';
    }
  }).join('');
}

function compose_rule(token, coords) {
  let property = token.property;
  let value = compose_value(token.value, coords);
  return `${ property }: ${ value };`;
}

function compose_tokens(tokens, set, coords) {
  tokens.forEach((token, i) => {
    if (token.skip) return false;

    switch (token.type) {
      case 'rule':
        set.add(
          compose_selector(coords.count),
          compose_rule(token, coords)
        );
        break;

      case 'psudo': {
        let is_host_selector =
          token.selector.startsWith(':host');

        if (is_host_selector) {
          token.skip = true;
        }

        let psudo_rules =
          token.styles.map(s => compose_rule(s, coords));

        let selector = is_host_selector
          ? token.selector
          : compose_selector(coords.count, token.selector);

        set.add(selector, psudo_rules);
        break;
      }

      case 'cond':
        let fn = cond[token.name.substr(1)];
        if (fn) {
          let result = with_args(fn, coords, token.arguments);
          if (result) {
            compose_tokens(token.styles, set, coords);
          }
        }
        break;
    }
  });
}

function generator(tokens, size) {
  let set = rule_set();
  let count = 0;
  for (let x = 1; x <= size.x; ++x) {
    for (let y = 1; y <= size.y; ++y) {
      count++;
      compose_tokens(tokens, set, { x, y, count});
    }
  }
  return set.output();
}

export default generator;
