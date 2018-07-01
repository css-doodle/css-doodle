import iterator from './iterator';
import parse_var from './parse-var';

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
  comment(value) {
    return {
      type: 'comment',
      value
    }
  },
  psuedo(selector = '') {
    return {
      type: 'psuedo',
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

const bracket_pair = {
  '(': ')',
  '[': ']',
  '{': '}'
};

const is = {
  white_space(c) {
    return /[\s\n\t]/.test(c);
  },
  line_break(c) {
    return /\n/.test(c);
  },
  open_bracket(c) {
    return bracket_pair.hasOwnProperty(c);
  },
  close_bracket_of(c) {
    let pair = bracket_pair[c];
    return p => p == pair;
  },
  number(n) {
    return !isNaN(n);
  }
};

function throw_error(msg, { col, line }) {
  throw new Error(
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

function skip_block(it) {
  let [skipped, c] = [it.curr(), it.curr()];
  let is_close_bracket = is.close_bracket_of(c);
  it.next();
  while (!it.end()) {
    if (is_close_bracket(c = it.curr())) {
      skipped += c;
      break;
    }
    else if (is.open_bracket(c)) {
      skipped += skip_block(it);
    } else {
      skipped += c;
    }
    it.next();
  }
  return skipped;
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
      keyframes.name = read_word(it);
      if (keyframes.name == '{') {
        throw_error('missing keyframes name', it.info());
        break;
      }
      continue;
    }
    else if (c == '{') {
      it.next();
      keyframes.steps = read_steps(it, extra);
      break;
    }
    it.next();
  }
  return keyframes;
}

function read_comments(it, flag = {}) {
  let comment = Tokens.comment();
  let c = it.curr();
  if (c != '#') it.next();
  it.next();
  while (!it.end()) {
    if ((c = it.curr()) == '*' && it.curr(1) == '/') break;
    else comment.value += c;
    c = it.curr();
    if (flag.inline) {
      if (c == '\n') return comment;
    } else {
      if (c == '*' && it.curr(1) == '/') break;
    }
    comment.value += c;
    it.next();
  }
  it.next(); it.next();
  return comment;
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

function read_arguments(it) {
  let args = [], group = [], stack = [], arg = '', c;
  while (!it.end()) {
    c = it.curr();
    if (/['"]/.test(c) && it.curr(-1) !== '\\') {
      if (stack.length && c == stack[stack.length - 1]) {
        stack.pop();
      } else {
        stack.push(c);
      }
      arg += c;
    }

    else if (c == '@') {
      if (!group.length) {
        arg = arg.trimLeft();
      }
      if (arg.length) {
        group.push(Tokens.text(arg));
        arg = '';
      }
      group.push(read_func(it));
    }

    else if (/[,)]/.test(c) && !stack.length) {
      if (arg.length) {
        if (!group.length) {
          group.push(Tokens.text(get_text_value(arg)));
        } else {
          if (arg.length) {
            group.push(Tokens.text(arg));
          }
        }
      }

      let this_group = remove_arg_quotes(group);
      args.push(this_group);
      [group, arg] = [[], ''];

      if (c == ')') break;
    }
    else {
      arg += c;
    }

    it.next();
  }
  return args;
}

function remove_arg_quotes(array) {
  let group = array.slice();

  let first = group[0];
  if (first && first.type == 'text' && /^['"]/.test(first.value))  {
    first.value = first.value.substr(1);
  }

  let last = group[group.length - 1];
  if (last && last.type == 'text' && /['"]$/.test(last.value)) {
    last.value = last.value.substr(0, last.value.length - 1);
  }
  return group;
}

function read_func(it) {
  let func = Tokens.func(), name = '', c;
  while (!it.end()) {
    if ((c = it.curr()) == ')') break;
    if (c == '(') {
      it.next();
      func.name = name;
      func.arguments = read_arguments(it);
      break;
    }
    else name += c;
    it.next();
  }
  return func;
}

function read_value(it) {
  let text = Tokens.text(), c;
  const value = [];
  while (!it.end()) {
    if ((c = it.curr()) == '\n') {
      it.next();
      continue;
    }
    else if (/[;}]/.test(c)) {
      if (text.value.length) value.push(text);
      text = Tokens.text();
      break;
    }
    else if (c == '@') {
      if (text.value.length) value.push(text);
      text = Tokens.text();
      value.push(read_func(it));
    }
    else if (!is.white_space(c) || !is.white_space(it.curr(-1))) {
      text.value += c;
    }
    it.next();
  }

  if (text.value.length) value.push(text);

  if (value.length && value[0].value) {
    value[0].value = value[0].value.trimLeft();
  }

  return value;
}

function read_selector(it) {
  let selector = '', c;
  while (!it.end()) {
    if ((c = it.curr()) == '{') break;
    else if (!is.white_space(c)) {
      selector += c;
    }
    it.next();
  }
  return selector;
}

function read_cond_selector(it) {
  let selector = { name: '', arguments: [] }, c;
  while (!it.end()) {
    if ((c = it.curr()) == '(') {
      it.next();
      selector.arguments = read_arguments(it);
    }
    else if (/[){]/.test(c)) break;
    else if (!is.white_space(c)) selector.name += c;
    it.next();
  }
  return selector;
}

function read_psuedo(it, extra) {
  let psuedo = Tokens.psuedo(), c;
  while (!it.end()) {
    if ((c = it.curr()) == '}') break;
    if (is.white_space(c)) {
      it.next();
      continue;
    }
    else if (!psuedo.selector) {
      psuedo.selector = read_selector(it);
    }
    else {
      let rule = read_rule(it, extra);
      if (rule.property == '@use') {
        psuedo.styles = psuedo.styles.concat(
          rule.value
        );
      } else {
        psuedo.styles.push(rule);
      }
      if (it.curr() == '}') break;
    }
    it.next();
  }
  return psuedo;
}

function read_rule(it, extra) {
  let rule = Tokens.rule(), c;
  while (!it.end()) {
    if ((c = it.curr()) == ';') break;
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
  return rule;
}

function read_cond(it, extra) {
  let cond = Tokens.cond(), c;
  while (!it.end()) {
    if ((c = it.curr()) == '}') break;
    else if (!cond.name.length) {
      Object.assign(cond, read_cond_selector(it));
    }
    else if (c == ':') {
      let psuedo = read_psuedo(it);
      if (psuedo.selector) cond.styles.push(psuedo);
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

function read_property_value(extra, name) {
  let rule = '';
  if (extra && extra.get_custom_property_value) {
    rule = extra.get_custom_property_value(name);
  }
  return rule;
}

function evaluate_value(values, extra) {
  values.forEach(v => {
    if (v.type == 'text' && v.value) {
      let vars = parse_var(v.value);
      v.value = vars.reduce((ret, p) => {
        let rule = '', other = '', parsed;
        rule = read_property_value(extra, p.name);
        if (!rule && p.alternative) {
          p.alternative.every(n => {
            other = read_property_value(extra, n.name);
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
  let values = read_value(it);
  evaluate_value(values, extra);
  if (values.length > 1) {
    // Todo: support function call
  }
  return values[0].value || [];
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
      Tokens.push(read_comments(it));
    }
    else if (c == '#' || (c == '/' && it.curr(1) == '/')) {
      Tokens.push(read_comments(it, { inline: true }));
    }
    else if (c == ':') {
      let psuedo = read_psuedo(it, extra);
      if (psuedo.selector) Tokens.push(psuedo);
    }
    else if (c == '@' && read_word(it, true) === '@keyframes') {
      let keyframes = read_keyframes(it, extra);
      Tokens.push(keyframes);
    }
    else if (c == '@' && !read_line(it, true).includes(':')) {
      let cond = read_cond(it, extra);
      if (cond.name.length) Tokens.push(cond);
    }
    else if (!is.white_space(c)) {
      let rule = read_rule(it, extra);
      if (rule.property) Tokens.push(rule);
    }
    it.next();
  }
  return Tokens;
}
