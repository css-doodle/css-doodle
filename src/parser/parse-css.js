// I need to rewrite this

import parse_var from './parse-var.js';
import parse_svg from './parse-svg.js';
import generate_svg_extended from '../generator/svg-extended.js';
import { first, last, clone } from '../utils/list.js';

const Tokens = {
  func(name = '') {
    return {
      type: 'func',
      name,
      arguments: []
    };
  },
  argument() {
    return {
      type: 'argument',
      value: []
    };
  },
  text(value = '') {
    return {
      type: 'text',
      value
    };
  },
  pseudo(selector = '') {
    return {
      type: 'pseudo',
      selector,
      styles: []
    };
  },
  cond(name = '') {
    return {
      type: 'cond',
      name,
      styles: [],
      arguments: []
    };
  },
  rule(property = '') {
    return {
      type: 'rule',
      property,
      value: []
    };
  },
  keyframes(name = '') {
    return {
      type: 'keyframes',
      name,
      steps: []
    }
  },

  step(name = '') {
    return {
      type: 'step',
      name,
      styles: []
    }
  }
};

const is = {
  white_space(c) {
    return /[\s\n\t]/.test(c);
  },
  line_break(c) {
    return /\n/.test(c);
  },
  number(n) {
    return !isNaN(n);
  },
  pair(n) {
    return ['"', '(', ')', "'"].includes(n);
  },
  pair_of(c, n) {
    return ({ '"': '"', "'": "'", '(': ')' })[c] == n;
  }
};

// This should not be in the parser
// but I'll leave it here until the rewriting
const symbols = {
  'π': Math.PI,
  '∏': Math.PI
};

function composible(name) {
  return /^@(canvas|shaders|doodle)/.test(name);
}

function iterator(input = '') {
  let index = 0, col = 1, line = 1;
  return {
    curr(n = 0) {
      return input[index + n];
    },
    end() {
      return input.length <= index;
    },
    info() {
      return { index, col, line };
    },
    index(n) {
      return (n === undefined ? index : index = n);
    },
    range(start, end) {
      return input.substring(start, end);
    },
    next() {
      let next = input[index++];
      if (next == '\n') line++, col = 0;
      else col++;
      return next;
    }
  };
}

function throw_error(msg, { col, line }) {
  console.warn(
    `(at line ${ line }, column ${ col }) ${ msg }`
  );
}

function get_text_value(input) {
  if (input.trim().length) {
    return is.number(+input) ? +input : input.trim()
  } else {
    return input;
  }
}

function read_until(fn) {
  return function(it, reset) {
    let index = it.index();
    let word = '';
    while (!it.end()) {
      let c = it.next();
      if (fn(c)) break;
      else word += c;
    }
    if (reset) {
      it.index(index);
    }
    return word;
  }
}

function read_word(it, reset) {
  let check = c => /[^\w@]/.test(c);
  return read_until(check)(it, reset);
}

function read_keyframe_name(it) {
  return read_until(c => /[\s\{]/.test(c))(it);
}

function read_line(it, reset) {
  let check = c => is.line_break(c) || c == '{';
  return read_until(check)(it, reset);
}

function read_step(it, extra) {
  let c, step = Tokens.step();
  while (!it.end()) {
    if ((c = it.curr()) == '}') break;
    if (is.white_space(c)) {
      it.next();
      continue;
    }
    else if (!step.name.length) {
      step.name = read_selector(it);
    }
    else {
      step.styles.push(read_rule(it, extra));
      if (it.curr() == '}') break;
    }
    it.next();
  }
  return step;
}

function read_steps(it, extra) {
  const steps = [];
  let c;
  while (!it.end()) {
    if ((c = it.curr()) == '}') break;
    else if (is.white_space(c)) {
      it.next();
      continue;
    }
    else {
      steps.push(read_step(it, extra));
    }
    it.next();
  }
  return steps;
}

function read_keyframes(it, extra) {
  let keyframes = Tokens.keyframes(), c;
  while (!it.end()) {
    if ((c = it.curr()) == '}') break;
    else if (!keyframes.name.length) {
      read_word(it);
      keyframes.name = read_keyframe_name(it);
      if (!keyframes.name.length) {
        throw_error('missing keyframes name', it.info());
        break;
      }
      continue;
    }
    else if (c == '{' || it.curr(-1) == '{') {
      it.next();
      keyframes.steps = read_steps(it, extra);
      break;
    }
    it.next();
  }
  return keyframes;
}

function read_comments(it, flag = {}) {
  it.next();
  while (!it.end()) {
    let c = it.curr();
    if (flag.inline) {
      if (c == '\n') break;
    }
    else {
      if ((c = it.curr()) == '*' && it.curr(1) == '/') break;
    }
    it.next();
  }
  if (!flag.inline) {
    it.next(); it.next();
  }
}

function skip_tag(it) {
  it.next();
  while(!it.end()) {
    let c = it.curr();
    if (c == '>') break;
    it.next();
  }
}

function read_property(it) {
  let prop = '', c;
  while (!it.end()) {
    if ((c = it.curr()) == ':') break;
    else if (!is.white_space(c)) prop += c;
    it.next();
  }
  return prop;
}

function read_arguments(it, composition, doodle, variables = {}) {
  let args = [], group = [], stack = [], arg = '', c;
  let raw = '';
  while (!it.end()) {
    c = it.curr();
    let prev = it.curr(-1);
    let start = it.index();
    if ((/[\('"`]/.test(c) && prev !== '\\')) {
      if (stack.length) {
        /*
        if ((c !== '(') && last(stack) === '(') {
          stack.pop();
        }
        */
        if (c !== '(' && c === last(stack)) {
          stack.pop();
        } else {
          stack.push(c);
        }
      } else {
        stack.push(c);
      }
      arg += c;
    }
    else if (!doodle && ((c == '@' || c === '$') || (prev === '.' && composition))) {
      if (!group.length) {
        arg = arg.trimLeft();
      }
      if (arg.length) {
        group.push(Tokens.text(arg));
        arg = '';
      }
      group.push(read_func(it, variables));
    }
    else if (doodle && /[)]/.test(c) || (!doodle && /[,)]/.test(c))) {
      if (stack.length) {
        if (c == ')' && last(stack) === '(') {
          stack.pop();
        }
        arg += c;
      }
      else {
        if (arg.length) {
          if (!group.length) {
            group.push(Tokens.text(get_text_value(arg)));
          } else if (/\S/.test(arg)) {
            group.push(Tokens.text(arg));
          }
          if (arg.startsWith('±') && !doodle) {
            let raw = arg.substr(1);
            let cloned = clone(group);
            last(cloned).value = '-' + raw;
            args.push(normalize_argument(cloned));
            last(group).value = raw;
          }
        }

        args.push(normalize_argument(group));

        [group, arg] = [[], ''];

        if (c == ')') break;
      }
    }
    else {
      if (symbols[c] && !/[0-9]/.test(it.curr(-1))) {
        c = symbols[c];
      }
      arg += c;
    }
    if (composition && ((it.curr(1) == ')' || it.curr(1) == ';') || !/[0-9a-zA-Z_\-.]/.test(it.curr())) && !stack.length) {
      if (group.length) {
        args.push(normalize_argument(group));
      }
      break;
    }
    else {
      raw += it.range(start, it.index() + 1);
      it.next();
    }
  }
  return [skip_last_empty_args(args), raw];
}

function skip_last_empty_args(args) {
  let arg = last(args[0]);
  if (arg && arg.type === 'text' && !String(arg.value).trim().length) {
    args[0] = args[0].slice(0, -1);
  }
  return args;
}

function normalize_argument(group) {
  let result = group.map(arg => {
    if (arg.type == 'text' && typeof arg.value == 'string') {
      let value = String(arg.value);
      if (value.includes('`')) {
        arg.value = value = value.replace(/`/g, '"');
      }
      arg.value = value;
    }
    return arg;
  });

  let ft = first(result) || {};
  let ed = last(result) || {};
  if (ft.type == 'text' && ed.type == 'text') {
    let cf = first(ft.value);
    let ce  = last(ed.value);
    if (typeof ft.value == 'string' && typeof ed.value == 'string') {
      if (is.pair_of(cf, ce)) {
        ft.value = ft.value.slice(1);
        ed.value = ed.value.slice(0, ed.value.length - 1);
        result.cluster = true;
      }
    }
  }

  return result;
}

function seperate_func_name(name) {
  let fname = '', extra = '';
  if ((/\D$/.test(name) && !/\d+[x-]\d+/.test(name)) || Math[name.substr(1)]) {
    return { fname: name, extra }
  }
  for (let i = name.length - 1; i >= 0; i--) {
    let c = name[i];
    let prev = name[i - 1];
    let next = name[i + 1];
    if (/[\d.]/.test(c) || ((c == 'x' || c == '-') && /\d/.test(prev) && /\d/.test(next))) {
      extra = c + extra;
    } else {
      fname = name.substring(0, i + 1);
      break;
    }
  }
  return { fname, extra };
}

function has_times_syntax(token) {
  let str = JSON.stringify(token);
  return str.includes('pureName') && str.includes('times');
}

function is_svg(name) {
  return /^@svg$/i.test(name);
}

function read_func(it, variables = {}) {
  let func = Tokens.func();
  let name = it.curr(), c;
  let has_argument = false;
  let is_calc = name === '$';;
  if (name === '@') {
    it.next();
  } else {
    name = '@';
  }
  while (!it.end()) {
    c = it.curr();
    let next = it.curr(1);
    let composition = (c == '.' && (/[a-zA-Z@$]/.test(next)));
    if (c == '(' || composition) {
      has_argument = true;
      it.next();
      let [args, raw_args] = read_arguments(it, composition, composible(name), variables);
      if (is_svg(name)) {
        let parsed_svg = parse_svg(raw_args);
        let line = 0;
        for (let item of parsed_svg.value) {
          if (item.variable) {
            variables[item.name] = (parse(`${'\n'.repeat(line++)} ${item.name}: ${item.value}`))[0].value;
          }
        }
        if (/\d\s*{/.test(raw_args) && has_times_syntax(parsed_svg)) {
          let svg = generate_svg_extended(parsed_svg);
          // compatible with old iterator
          svg += ')';
          let extended = read_arguments(iterator(svg), composition, composible(name), variables);
          args = extended[0];
        }
      }
      func.arguments = args;
      func.variables = variables;
      break;
    } else if (/[0-9a-zA-Z_\-.%]/.test(c)) {
      name += c;
    }
    if (!has_argument && next !== '(' && !/[0-9a-zA-Z_\-.%]/.test(next)) {
      break;
    }
    it.next();
  }
  let { fname, extra } = seperate_func_name(name);
  func.name = is_calc ? '@$' + name.substr(1) : fname;
  if (extra.length) {
    func.arguments.unshift([{
      type: 'text',
      value: extra
    }]);
  }

  if (is_calc && func.name.length > 2) {
    if (!func.arguments.length) {
      let name = func.name.substring(0, 2);
      let value = func.name.substring(2);
      func.name = name;
      func.arguments.push(
        [{ type: 'text', value: value }]
      );
    }
    if (/\d$/.test(func.name)) {
      let name = func.name.substring(0, 2);
      let value = func.name.substring(2);
      func.name = name;
      func.arguments[0][0].value = value;
    }
  }

  func.position = it.info().index;
  return func;
}

function read_value(it) {
  let text = Tokens.text(), idx = 0, skip = true, c;
  const value = [];
  value[idx] = [];
  let stack = [], quote_stack = [];

  while (!it.end()) {
    c = it.curr();

    if (skip && is.white_space(c)) {
      it.next();
      continue;
    } else {
      skip = false;
    }

    if (c == '\n' && !is.white_space(it.curr(-1))) {
      text.value += ' ';
    }
    else if (c == ',' && !stack.length) {
      if (text.value.length) {
        value[idx].push(text);
        text = Tokens.text();
      }
      value[++idx] = [];
      skip = true;
    }
    else if (/[;}<]/.test(c) && !quote_stack.length) {
      if (text.value.length) {
        value[idx].push(text);
        text = Tokens.text();
      }
      break;
    }
    else if ((c === '@' || c === '$') && /[\w-\(%]/.test(it.curr(1))) {
      if (text.value.length) {
        value[idx].push(text);
        text = Tokens.text();
      }
      value[idx].push(read_func(it));
    }
    else if (c === '"' || c === "'") {
      let quote = last(quote_stack);
      if (c === quote) {
        quote_stack.pop();
      } else if (!quote_stack.length) {
        quote_stack.push(c);
      }
      text.value += c;
    }
    else if (!is.white_space(c) || !is.white_space(it.curr(-1))) {
      if (c == '(') stack.push(c);
      if (c == ')') stack.pop();

      if (symbols[c] && !/[0-9]/.test(it.curr(-1))) {
        c = symbols[c];
      }
      text.value += c;
    }
    if ((it.curr() === ';' || it.curr() == '}') && !quote_stack.length) {
      break;
    }
    it.next();
  }
  if (text.value.length) {
    value[idx].push(text);
  }
  return value;
}

function read_selector(it) {
  let selector = '', c;
  while (!it.end()) {
    if ((c = it.curr()) == '{') break;
    else {
      selector += c;
    }
    it.next();
  }
  selector = selector.trim();
  return selector;
}

function read_cond_selector(it) {
  let selector = { name: '', arguments: [] }, c;
  while (!it.end()) {
    if ((c = it.curr()) == '(') {
      it.next();
      selector.arguments = read_arguments(it)[0];
    }
    else if (/[){]/.test(c)) break;
    else selector.name += c;
    it.next();
  }
  let [name, ...addition] = selector.name.trim().split(/\s+/);
  selector.name = name;
  selector.addition = addition;
  return selector;
}

function read_pseudo(it, extra) {
  let pseudo = Tokens.pseudo(), c;
  while (!it.end()) {
    c = it.curr();
    if (c == '/' && it.curr(1) == '*') {
      read_comments(it);
    }
    else if (c == '}') {
      break;
    }
    else if (is.white_space(c)) {
      it.next();
      continue;
    }
    else if (!pseudo.selector) {
      pseudo.selector = read_selector(it);
    }
    else {
      let rule = read_rule(it, extra);
      if (rule.property == '@use') {
        pseudo.styles = pseudo.styles.concat(
          rule.value
        );
      } else if (rule.property) {
        pseudo.styles.push(rule);
      }
      if (it.curr() == '}') break;
    }
    it.next();
  }
  return pseudo;
}

function read_rule(it, extra) {
  let rule = Tokens.rule(), c;
  let start = it.index();
  while (!it.end()) {
    c = it.curr();
    if (c == '/' && it.curr(1) == '*') {
      read_comments(it);
    }
    else if (c == ';') {
      break;
    }
    else if (!rule.property.length) {
      rule.property = read_property(it);
      if (rule.property == '@use') {
        rule.value = read_var(it, extra);
        break;
      }
    }
    else {
      rule.value = read_value(it);
      break;
    }
    it.next();
  }
  let end = it.index();
  rule.raw = () => it.range(start, end).trim();
  return rule;
}

function read_cond(it, extra) {
  let cond = Tokens.cond(), c;
  while (!it.end()) {
    c = it.curr();
    if (c == '/' && it.curr(1) == '*') {
      read_comments(it);
    }
    else if (c == '}') {
      break;
    }
    else if (!cond.name.length) {
      Object.assign(cond, read_cond_selector(it));
    }
    else if (c == ':') {
      let pseudo = read_pseudo(it);
      if (pseudo.selector) cond.styles.push(pseudo);
    }
    else if (c == '@' && !read_line(it, true).includes(':')) {
      cond.styles.push(read_cond(it));
    }
    else if (!is.white_space(c)) {
      let rule = read_rule(it, extra);
      if (rule.property) cond.styles.push(rule);
      if (it.curr() == '}') break;
    }
    it.next();
  }
  return cond;
}

function read_variable(extra, name) {
  let rule = '';
  if (extra && extra.get_variable) {
    rule = extra.get_variable(name);
  }
  return rule;
}

function evaluate_value(values, extra) {
  values.forEach && values.forEach(v => {
    if (v.type == 'text' && v.value) {
      let vars = parse_var(v.value);
      v.value = vars.reduce((ret, p) => {
        let rule = '', other = '', parsed;
        rule = read_variable(extra, p.name);
        if (!rule && p.fallback) {
          p.fallback.every(n => {
            other = read_variable(extra, n.name);
            if (other) {
              rule = other;
              return false;
            }
          });
        }
        try {
          parsed = parse(rule, extra);
        } catch (e) { }
        if (parsed) {
          ret.push.apply(ret, parsed);
        }
        return ret;
      }, []);
    }
    if (v.type == 'func' && v.arguments) {
      v.arguments.forEach(arg => {
        evaluate_value(arg, extra);
      });
    }
  });
}

function read_var(it, extra) {
  it.next();
  let groups = read_value(it) || [];
  return groups.reduce((ret, group) => {
    evaluate_value(group, extra);
    let [token] = group;
    if (token.value && token.value.length) {
      ret.push(...token.value);
    }
    return ret;
  }, []);
}

export default function parse(input, extra) {
  const it = iterator(input);
  const Tokens = [];
  while (!it.end()) {
    let c = it.curr();
    if (is.white_space(c)) {
      it.next();
      continue;
    }
    else if (c == '/' && it.curr(1) == '*') {
      read_comments(it);
    }
    else if (c == ':') {
      let pseudo = read_pseudo(it, extra);
      if (pseudo.selector) Tokens.push(pseudo);
    }
    else if (c == '@' && read_word(it, true) === '@keyframes') {
      let keyframes = read_keyframes(it, extra);
      Tokens.push(keyframes);
    }
    else if (c == '@' && !read_line(it, true).includes(':')) {
      let cond = read_cond(it, extra);
      if (cond.name.length) Tokens.push(cond);
    }
    else if (c == '<') {
      skip_tag(it);
    }
    else if (!is.white_space(c)) {
      let rule = read_rule(it, extra);
      if (rule.property) Tokens.push(rule);
    }
    it.next();
  }
  return Tokens;
}
