(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? factory() :
  typeof define === 'function' && define.amd ? define(factory) :
  (factory());
}(this, (function () { 'use strict';

function nth(x, y, count) {
  return n => n == count;
}

function at(x, y) {
  return (x1, y1) => (x == x1 && y == y1);
}

function row(x) {
  return n => n == x;
}

function col(x, y) {
  return n => n == y;
}

function even(x, y, count) {
  return _ => !(count % 2);
}

function odd(x, y, count) {
  return _ => !!(count % 2);
}


var cond = Object.freeze({
	nth: nth,
	at: at,
	row: row,
	col: col,
	even: even,
	odd: odd
});

function index(x, y, count) {
  return _ => count;
}

function row$1(x) {
  return _ => x;
}

function col$1(x, y) {
  return _ => y;
}

function any() {
  return function(...args) {
    return random.apply(null, args);
  }
}

function rand() {
  return function(...args) {
    return random(memo(unitify(range)).apply(null, args));
  }
}

function random(...items) {
  let args = items.reduce((ret, n) => ret.concat(n), []);
  return args[Math.floor(Math.random() * args.length)];
}

function memo(fn) {
  return function(...args) {
    const memo = {};
    let key = args.join('-');
    if (memo[key]) return memo[key];
    return (memo[key] = fn.apply(null, args));
  }
}

function range(start, stop, step) {
  let length = arguments.length;
  if (length == 1) [start, stop] = [0, start];
  if (length < 3) step = (stop > 0 && stop < 1) ? .1 : 1;
  let range = [];
  while ((step > 0 && start < stop)
    || (step < 0 && start > stop)) {
    range.push(start);
    start += step;
  }
  return range;
}

function unitify(fn) {
  return function(...args) {
    let unit = get_unit(args[0]);
    if (unit) {
      args = args.map(remove_unit);
      return add_unit(fn, unit).apply(null, args);
    }
    return fn.apply(null, args);
  }
}

function add_unit(fn, unit) {
  return function(...args) {
    args = args.map(remove_unit);
    let result = fn.apply(null, args);
    if (unit) {
      result = result.map(n => n + unit);
    }
    return result;
  }
}

function get_unit(str) {
  if (!str) return '';
  let unit = /(%|cm|em|ex|in|mm|pc|pt|px|vh|vw|vmin|deg)$/;
  let matched = ''.trim.call(str).match(unit);
  return matched ? matched[0] : '';
}

function remove_unit(str) {
  let unit = get_unit(str);
  return unit ? +(str.replace(unit, '')) : str;
}


var func = Object.freeze({
	index: index,
	row: row$1,
	col: col$1,
	any: any,
	rand: rand
});

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
  tokens.forEach(token => {
    switch (token.type) {
      case 'rule':
        set.add(
          compose_selector(coords.count),
          compose_rule(token, coords)
        );
        break;

      case 'psudo':
        set.add(
          compose_selector(coords.count, token.selector),
          token.styles.map(s => compose_rule(s, coords))
        );
        break;

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

const struct = {
  func:  () => ({ type: 'function', name: '', arguments: [] }),
  text:  () => ({ type: 'text', value: '' }),
  psudo: () => ({ type: 'psudo', selector: '', styles: [] }),
  cond:  () => ({ type: 'cond', name: '', styles: [], arguments: [] }),
  rule:  () => ({ type: 'rule', property: '', value: [] })
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

function iterator(input) {
  let index = 0;
  return {
    curr:  (n = 0) => input[index + n],
    next:  () => input[index++],
    end:   () => input.length - 1 <= index,
    index: () => index
  };
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

function read_property(it) {
  let prop = '', c;
  while (!it.end()) {
    if ((c = it.curr()) == ':') break;
    else if (!/[a-zA-Z\-]/.test(c)) {
      throw new Error('Syntax error: Bad property name.');
    }
    else if (!is.white_space(c)) prop += c;
    it.next();
  }
  it.next();
  return prop;
}

function read_quote_block(it, quote) {
  let block = '', c;
  it.next();
  while (!it.end()) {
    if ((c = it.curr()) == quote) {
      if (it.curr(-1) !== '\\') break;
      else block += c;
    }
    else block += c;
    it.next();
  }
  return block;
}

function read_arguments(it) {
  let args = [], arg = '', c;
  while (!it.end()) {
    if (is.open_bracket(c = it.curr())) {
      arg += skip_block(it);
    }
    else if (/['"]/.test(c)) {
      arg += read_quote_block(it, c);
    }
    else if (/[,)]/.test(c)) {
      if (arg.length) {
        args.push(is.number(+arg) ? +arg : arg);
        arg = '';
      }
      if (c == ')') break;
    }
    else if (!is.white_space(c)) {
      arg += c;
    }
    it.next();
  }
  return args;
}

function read_func(it) {
  let func = struct.func(), name = '', c;
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
  let text = struct.text(), c;
  const value = [];
  while (!it.end()) {
    if ((c = it.curr()) == '\n') {
      it.next();
      continue;
    }
    else if (/[;}]/.test(c)) {
      if (text.value.length) value.push(text);
      break;
    }
    else if (c == '@') {
      if (text.value.length) value.push(text);
      text = struct.text();
      value.push(read_func(it));
    }
    else if (!is.white_space(c) || !is.white_space(it.curr(-1))) {
      text.value += c;
    }
    it.next();
  }
  return value;
}

function read_selector(it) {
  let selector = '', c;
  while (!it.end()) {
    if ((c = it.curr())== '{') break;
    else if (!is.white_space(c)) selector += c;
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

function read_psudo(it) {
  let psudo = struct.psudo(), c;
  while (!it.end()) {
    if ((c = it.curr())== '}') break;
    if (is.white_space(c)) {
      it.next();
      continue;
    }
    else if (!psudo.selector) psudo.selector = read_selector(it);
    else psudo.styles.push(read_rule(it));
    it.next();
  }
  return psudo;
}

function read_rule(it) {
  let rule = struct.rule(), c;
  while (!it.end()) {
    if ((c = it.curr()) == ';') break;
    else if (!rule.property.length) {
      rule.property = read_property(it);
    }
    else {
      rule.value = read_value(it);
      break;
    }
    it.next();
  }
  return rule;
}

function read_cond(it) {
  let cond = struct.cond(), c;
  while (!it.end()) {
    if ((c = it.curr()) == '}') break;
    else if (!cond.name.length) {
      Object.assign(cond, read_cond_selector(it));
    }
    else if (c == ':') {
      let psudo = read_psudo(it);
      if (psudo.selector) cond.styles.push(psudo);
    }
    else if (c == '@') {
      cond.styles.push(read_cond(it));
    }
    else if (!is.white_space(c)) {
      let rule = read_rule(it);
      if (rule.property) cond.styles.push(rule);
    }
    it.next();
  }
  return cond;
}

function tokenizer(input) {
  const it = iterator(input);
  const tokens = [];
  while (!it.end()) {
    let c = it.curr();
    if (is.white_space(c)) {
      it.next();
      continue;
    }
    else if (c == ':') {
      let psudo = read_psudo(it);
      if (psudo.selector) tokens.push(psudo);
    }
    else if (c == '@') {
      let cond = read_cond(it);
      if (cond.name.length) tokens.push(cond);
    }
    else if (!is.white_space(c)) {
      let rule = read_rule(it);
      if (rule.property) tokens.push(rule);
    }
    it.next();
  }
  return tokens;
}

function compile(input, size) {
  return generator(tokenizer(input), size);
}

function clamp(num, min, max) {
  return (num <= min) ? min : ((num >= max) ? max : num);
}

function parse_size(size) {
  const split = size
    .replace(/\s+/g, '')
    .replace(/[,，xX]+/, 'x')
    .split('x');
  const ret = {
    x: clamp(parseInt(split[0], 10), 1, 16),
    y: clamp(parseInt(split[1] || split[0]), 1, 16)
  };
  return {
    x: ret.x,
    y: ret.y,
    count: ret.x * ret.y
  };
}

class Doodle extends HTMLElement {
  constructor() {
    super();
  }
  connectedCallback() {
    this.size = parse_size(
      this.getAttribute('grid') || '1x1'
    );
    const cell_styles = compile(this.innerHTML, this.size);
    const basic_styles = `
      *, *:after, *:before {
        box-sizing: border-box;
      }
      :host {
        display: inline-block;
        width: 1em;
        height: 1em;
      }
      .container {
        position: relative;
        width: 100%;
        height: 100%;
      }
      .container:after {
        content: '';
        display: block;
        clear: both;
        visibility: hidden;
      }
      .cell {
        position: relative;
        width: ${ 100 / this.size.x + '%' };
        height: ${ 100 / this.size.y + '%' };
        float: left;
        line-height: 0;
      }
      .shape {
        line-height: 0;
        position: absolute;
        width: 100%;
        height: 100%;
        transform-origin: center center;
        z-index: 1;
        display: flex;
        align-items: center;
        justify-content: center;
      }
    `;
    const cell =  `
      <div class="cell">
        <div class="shape"></div>
      </div>
    `;

    this.attachShadow({ mode: 'open' })
      .innerHTML = `
        <style> ${ basic_styles } </style>
        <style> ${ cell_styles } </style>
        <div class="container">
          ${ cell.repeat(this.size.count) }
        </div>
      `;
  }
}

customElements.define('css-doodle', Doodle);

})));
