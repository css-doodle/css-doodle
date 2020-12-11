/*! css-doodle@0.11.2 */
(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? module.exports = factory() :
  typeof define === 'function' && define.amd ? define(factory) :
  (global = typeof globalThis !== 'undefined' ? globalThis : global || self, global.CSSDoodle = factory());
}(this, (function () { 'use strict';

  function iterator(input) {
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
      next() {
        let next = input[index++];
        if (next == '\n') line++, col = 0;
        else col++;
        return next;
      }
    };
  }

  // I'll make it work first
  function parse(it) {
    let word = '', marks = [];
    let groups = [], result = {};

    while(!it.end()) {
      let c = it.curr();
      if (c == '(') {
        marks.push(c);
        word = '';
      }
      else if (c == ')' || c == ',') {
        if (/^\-\-.+/.test(word)) {
          if (!result.name) {
            result.name = word;
          } else {
            if (!result.alternative) {
              result.alternative = [];
            }
            result.alternative.push({
              name: word
            });
          }
        }

        if (c == ')') {
          if (marks[marks.length - 1] == '(') {
            marks.pop();
          } else {
            throw new Error('bad match');
          }
        }

        if (c == ',') {
          if (!marks.length) {
            groups.push(result);
            result = {};
          }
        }

        word = '';
      }
      else if (!/\s/.test(c)) {
        word += c;
      }
      it.next();
    }

    if (marks.length) {
      return [];
    }

    if (result.name) {
      groups.push(result);
    }
    return groups;
  }

  function parse_var(input) {
    input = input.trim();
    let result = [];
    if (!/^var\(/.test(input)) {
      return result;
    }
    let it = iterator(input);
    try {
      result = parse(it);
    } catch (e) {
      console.warn(e && e.message || 'Bad variables.');
    }
    return result;
  }

  function List(random) {

    function make_array(arr) {
      return Array.isArray(arr) ? arr : [arr];
    }

    function join(arr, spliter = '\n') {
      return (arr || []).join(spliter);
    }

    function last(arr, n = 1) {
      return arr[arr.length - n];
    }

    function first(arr) {
      return arr[0];
    }

    function clone(arr) {
      return JSON.parse(JSON.stringify(arr));
    }

    function shuffle(arr) {
      let ret = Array.from ? Array.from(arr) : arr.slice();
      let m = arr.length;
      while (m) {
        let i = ~~(random() * m--);
        let t = ret[m];
        ret[m] = ret[i];
        ret[i] = t;
      }
      return ret;
    }

    function flat_map(arr, fn) {
      if (Array.prototype.flatMap) return arr.flatMap(fn);
      return arr.reduce((acc, x) => acc.concat(fn(x)), []);
    }

    function remove_empty_values(arr) {
      return arr.filter(v => (
        v !== undefined &&
        v !== null &&
        String(v).trim().length
      ));
    }

    return {
      make_array,
      join,
      last,
      first,
      clone,
      shuffle,
      flat_map,
      remove_empty_values
    }
  }

  let { first, last, clone } = List();

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

  function read_property(it) {
    let prop = '', c;
    while (!it.end()) {
      if ((c = it.curr()) == ':') break;
      else if (!is.white_space(c)) prop += c;
      it.next();
    }
    return prop;
  }

  function read_arguments(it, composition) {
    let args = [], group = [], stack = [], arg = '', c;
    while (!it.end()) {
      c = it.curr();
      if ((/[\('"`]/.test(c) && it.curr(-1) !== '\\')) {
        if (stack.length) {
          if (c != '(' && c === last(stack)) {
            stack.pop();
          } else {
            stack.push(c);
          }
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
      else if (/[,)]/.test(c)) {
        if (stack.length) {
          if (c == ')') {
            stack.pop();
          }
          arg += c;
        }

        else {
          if (arg.length) {
            if (!group.length) {
              group.push(Tokens.text(get_text_value(arg)));
            } else {
              group.push(Tokens.text(arg));
            }

            if (arg.startsWith('±')) {
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
        if (symbols[c]) {
          c = symbols[c];
        }
        arg += c;
      }

      if (composition && it.curr() == ')' && !stack.length) {
        if (group.length) {
          args.push(normalize_argument(group));
        }
        break;
      }
      else {
        it.next();
      }
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
        arg.value = value.replace(/\n+|\s+/g, ' ');
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
    if ((/\D$/.test(name) && !/\d+x\d+/.test(name)) || Math[name.substr(1)]) {
      return { fname: name, extra }
    }
    for (let i = name.length - 1; i >= 0; i--) {
      let c = name[i];
      let prev = name[i - 1];
      let next = name[i + 1];
      if (/[\d.]/.test(c) || ((c == 'x') && /\d/.test(prev) && /\d/.test(next))) {
        extra = c + extra;
      } else {
        fname = name.substring(0, i + 1);
        break;
      }
    }
    return { fname, extra };
  }

  function read_func(it) {
    let func = Tokens.func();
    let name = '@', c;
    let has_argument = false;
    it.next();

    while (!it.end()) {
      c = it.curr();
      let composition = (c == '.' && it.curr(1) == '@');
      let next = it.curr(1);
      if (c == '(' || composition) {
        has_argument = true;
        it.next();
        func.arguments = read_arguments(it, composition);
        break;
      } else if (!has_argument && next !== '(' && !/[0-9a-zA-Z_\-.]/.test(next)) {
        name += c;
        break;
      }
      else {
        name += c;
      }
      it.next();
    }

    let { fname, extra } = seperate_func_name(name);
    func.name = fname;

    if (extra.length) {
      func.arguments.unshift([{
        type: 'text',
        value: extra
      }]);
    }

    func.position = it.info().index;
    return func;
  }

  function read_value(it) {
    let text = Tokens.text(), idx = 0, skip = true, c;
    const value = [], stack = [];
    value[idx] = [];

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
      else if (/[;}]/.test(c)) {
        if (text.value.length) {
          value[idx].push(text);
          text = Tokens.text();
        }
        break;
      }
      else if (c == '@') {
        if (text.value.length) {
          value[idx].push(text);
          text = Tokens.text();
        }
        value[idx].push(read_func(it));
      }
      else if (!is.white_space(c) || !is.white_space(it.curr(-1))) {
        if (c == '(') stack.push(c);
        if (c == ')') stack.pop();

        if (symbols[c]) {
          c = symbols[c];
        }

        text.value += c;
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

  function read_pseudo(it, extra) {
    let pseudo = Tokens.pseudo(), c;
    while (!it.end()) {
      if ((c = it.curr()) == '}') break;
      if (is.white_space(c)) {
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
        } else {
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
          if (!rule && p.alternative) {
            p.alternative.every(n => {
              other = read_variable(extra, n.name);
              if (other) {
                rule = other;
                return false;
              }
            });
          }
          try {
            parsed = parse$1(rule, extra);
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

  function parse$1(input, extra) {
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
      else if (c == '/' && it.curr(1) == '/') {
        read_comments(it, { inline: true });
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
      else if (!is.white_space(c)) {
        let rule = read_rule(it, extra);
        if (rule.property) Tokens.push(rule);
      }
      it.next();
    }
    return Tokens;
  }

  function clamp(num, min, max) {
    return Math.max(min, Math.min(max, num));
  }

  function maybe(cond, value) {
    if (!cond) return '';
    return (typeof value === 'function') ? value() : value;
  }

  function range(start, stop, step) {
    let count = 0, old = start;
    let initial = n => (n > 0 && n < 1) ? .1 : 1;
    let length = arguments.length;
    if (length == 1) [start, stop] = [initial(start), start];
    if (length < 3) step = initial(start);
    let range = [];
    while ((step >= 0 && start <= stop)
      || (step < 0 && start > stop)) {
      range.push(start);
      start += step;
      if (count++ >= 1000) break;
    }
    if (!range.length) range.push(old);
    return range;
  }

  function alias_for(obj, names) {
    Object.keys(names).forEach(n => {
      obj[n] = obj[names[n]];
    });
    return obj;
  }

  function is_letter(c) {
    return /^[a-zA-Z]$/.test(c);
  }

  function is_nil(s) {
    return s === undefined || s === null;
  }

  function lazy(fn) {
    let wrap = () => fn;
    wrap.lazy = true;
    return wrap;
  }

  function sequence(count, fn) {
    let [x, y = 1] = String(count).split('x');
    x = clamp(parseInt(x) || 1, 1, 65536);
    y = clamp(parseInt(y) || 1, 1, 65536);
    let max = x * y;
    let ret = [];
    let index = 1;
    for (let i = 1; i <= y; ++i) {
      for (let j = 1; j <= x; ++j) {
        ret.push(fn(index++, j, i, max));
      }
    }
    return ret;
  }

  function cell_id(x, y, z) {
    return 'c-' + x + '-' + y + '-' + z;
  }

  function get_value(input) {
    while (input && input.value) {
      return get_value(input.value);
    }
    return is_nil(input) ? '' : input;
  }

  function normalize_png_name(name) {
    let prefix = is_nil(name)
      ? Date.now()
      : String(name).replace(/\/.png$/g, '');
    return prefix + '.png';
  }

  const [ min, max, total ] = [ 1, 32, 32 * 32 ];

  function parse_grid(size) {
    let [x, y, z] = (size + '')
      .replace(/\s+/g, '')
      .replace(/[,，xX]+/g, 'x')
      .split('x')
      .map(Number);

    const max_xy = (x == 1 || y == 1) ? total : max;
    const max_z = (x == 1 && y == 1) ? total : min;

    const ret = {
      x: clamp(x || min, 1, max_xy),
      y: clamp(y || x || min, 1, max_xy),
      z: clamp(z || min, 1, max_z)
    };

    return Object.assign({}, ret,
      { count: ret.x * ret.y * ret.z }
    );
  }

  function create_svg_url(svg, id) {
    let encoded = encodeURIComponent(svg) + (id ? `#${ id }` : '');
    return `url("data:image/svg+xml;utf8,${ encoded }")`;
  }

  function normalize_svg(input) {
    const xmlns = 'xmlns="http://www.w3.org/2000/svg"';
    if (!input.includes('<svg')) {
      input = `<svg ${ xmlns }>${ input }</svg>`;
    }
    if (!input.includes('xmlns')) {
      input = input.replace(/<svg([\s>])/, `<svg ${ xmlns }$1`);
    }
    return input;
  }

  function svg_to_png(svg, width, height) {
    return new Promise((resolve, reject) => {
      let source = `data:image/svg+xml;utf8,${ encodeURIComponent(svg) }`;
      let img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = source;
      img.onload = () => {
        let canvas = document.createElement('canvas');
        let ctx = canvas.getContext('2d');

        let scale = window.devicePixelRatio || 1;
        canvas.width = Math.floor(width * scale);
        canvas.height = Math.floor(height * scale);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        canvas.toBlob(blob => {
          try {
            resolve({
              blob,
              source,
              url: URL.createObjectURL(blob)
            });
          } catch (e) {
            reject(e);
          }
        });
      };
    });
  }

  function random_func(random) {

    function lerp(start, end, t) {
      return start * (1 - t) + end * t;
    }

    function rand(start = 0, end = start) {
      if (arguments.length == 1) {
        if (start == 1) start = 0;
        else if (start < 1) start /= 10;
        else start = 1;
      }
      return lerp(start, end, random());
    }

    function pick( ...items) {
      let args = items.reduce((acc, n) => acc.concat(n), []);
      return args[~~(random() * args.length)];
    }

    function unique_id(prefix = '') {
      return prefix + random().toString(32).substr(2);
    }

    return {
      lerp,
      rand,
      pick,
      unique_id
    };

  }

  function by_unit(fn) {
    return (...args) => {
      let unit = get_unit(args);
      return restore(fn, unit).apply(null, args);
    }
  }

  function restore(fn, unit) {
    return (...args) => {
      args = args.map(str => Number(
        String(str).replace(/\D+$/g, '')
      ));
      let result = fn.apply(null, args);
      if (!unit.length) {
        return result;
      }
      if (Array.isArray(result)) {
        return result.map(n => n + unit);
      }
      return result + unit;
    }
  }

  function get_unit(values) {
    let unit = '';
    values.some(str => {
      let input = String(str).trim();
      if (!input) return '';
      let matched = input.match(/\d(\D+)$/);
      return (unit = matched ? matched[1] : '');
    });
    return unit;
  }

  function by_charcode(fn) {
    return (...args) => {
      let codes = args.map(n => String(n).charCodeAt(0));
      let result = fn.apply(null, codes);
      return Array.isArray(result)
        ? result.map(n => String.fromCharCode(n))
        : String.fromCharCode(result);
    }
  }

  /**
   * Based on the Shunting-yard algorithm.
   */
  let { last: last$1 } = List();

  function calc(input) {
    const expr = infix_to_postfix(input), stack = [];
    while (expr.length) {
      let top = expr.shift();
      if (/\d+/.test(top)) stack.push(top);
      else {
        let right = stack.pop();
        let left = stack.pop();
        stack.push(compute(
          top, Number(left), Number(right)
        ));
      }
    }
    return stack[0];
  }

  const operator = {
    '*': 3, '/': 3, '%': 3,
    '+': 2, '-': 2,
    '(': 1, ')': 1
  };

  function get_tokens(input) {
    let expr = String(input);
    let tokens = [], num = '';

    for (let i = 0; i < expr.length; ++i) {
      let c = expr[i];

      if (operator[c]) {
        if (c == '-' && expr[i - 1] == 'e') {
          num += c;
        }
        else if (!tokens.length && !num.length && /[+-]/.test(c)) {
          num += c;
        } else {
          let { type, value } = last$1(tokens) || {};
          if (type == 'operator'
              && !num.length
              && /[^()]/.test(c)
              && /[^()]/.test(value)) {
            num += c;
          } else {
            if (num.length) {
              tokens.push({ type: 'number', value: num });
              num = '';
            }
            tokens.push({ type: 'operator', value: c });
          }
        }
      }

      else if (/\S/.test(c)) {
        num += c;
      }
    }

    if (num.length) {
      tokens.push({ type: 'number', value: num });
    }

    return tokens;
  }

  function infix_to_postfix(input) {
    let tokens = get_tokens(input);
    const op_stack = [], expr = [];

    for (let i = 0; i < tokens.length; ++i) {
      let { type, value } = tokens[i];
      if (type == 'number') {
        expr.push(value);
      }

      else if (type == 'operator') {
        if (value == '(') {
          op_stack.push(value);
        }

        else if (value == ')') {
          while (op_stack.length && last$1(op_stack) != '(') {
            expr.push(op_stack.pop());
          }
          op_stack.pop();
        }

        else {
          while (op_stack.length && operator[last$1(op_stack)] >= operator[value]) {
            let op = op_stack.pop();
            if (!/[()]/.test(op)) expr.push(op);
          }
          op_stack.push(value);
        }
      }
    }

    while (op_stack.length) {
      expr.push(op_stack.pop());
    }

    return expr;
  }

  function compute(op, a, b) {
    switch (op) {
      case '+': return a + b;
      case '-': return a - b;
      case '*': return a * b;
      case '/': return a / b;
      case '%': return a % b;
    }
  }

  const store = {};

  function memo$1(prefix, fn) {
    return (...args) => {
      let key = prefix + args.join('-');
      if (store[key]) return store[key];
      return (store[key] = fn.apply(null, args));
    }
  }

  const { last: last$2, flat_map } = List();

  function expand(fn) {
    return (...args) => fn.apply(null, flat_map(args, n =>
      String(n).startsWith('[') ? build_range(n) : n
    ));
  }

  function Type(type, value) {
    return { type, value };
  }

  function get_tokens$1(input) {
    let expr = String(input);
    let tokens = [], stack = [];
    if (!expr.startsWith('[') || !expr.endsWith(']')) {
      return tokens;
    }

    for (let i = 1; i < expr.length - 1; ++i) {
      let c = expr[i];
      if (c == '-' && expr[i - 1] == '-') {
        continue;
      }
      if (c == '-') {
        stack.push(c);
        continue;
      }
      if (last$2(stack) == '-') {
        stack.pop();
        let from = stack.pop();
        tokens.push(from
          ? Type('range', [ from, c ])
          : Type('char', c)
        );
        continue;
      }
      if (stack.length) {
        tokens.push(Type('char', stack.pop()));
      }
      stack.push(c);
    }
    if (stack.length) {
      tokens.push(Type('char', stack.pop()));
    }
    return tokens;
  }

  const build_range = memo$1('build_range', (input) => {
    let tokens = get_tokens$1(input);
    return flat_map(tokens, ({ type, value }) => {
      if (type == 'char') return value;
      let [ from, to ] = value;
      let reverse = false;
      if (from > to) {
        [from, to] = [ to, from ];
        reverse = true;
      }
      let result = by_charcode(range)(from, to);
      if (reverse) result.reverse();
      return result;
    });
  });

  class Node {
    constructor(data) {
      this.prev = this.next = null;
      this.data = data;
    }
  }

  class Stack {
    constructor(limit = 20) {
      this._limit = limit;
      this._size = 0;
    }

    push(data) {
      if (this._size >= this._limit) {
        this.root = this.root.next;
        this.root.prev = null;
      }

      let node = new Node(data);

      if (!this.root) {
        this.root = this.tail = node;
      } else {
        node.prev = this.tail;
        this.tail.next = node;
        this.tail = node;
      }

      this._size++;
    }

    last(n = 1) {
      let node = this.tail;
      while (--n) {
        if (!node.prev) break;
        node = node.prev;
      }
      return node.data;
    }
  }

  const { cos, sin, sqrt, pow, PI } = Math;
  const DEG = PI / 180;

  function polygon(option, fn) {
    if (typeof arguments[0] == 'function') {
      fn = option;
      option = {};
    }

    if (!fn) {
      fn = t => [ cos(t), sin(t) ];
    }

    let split = option.split || 120;
    let scale = option.scale || 1;
    let start = DEG * (option.start || 0);
    let deg = option.deg ? (option.deg * DEG) : (PI / (split / 2));
    let points = [];

    for (let i = 0; i < split; ++i) {
      let t = start + deg * i;
      let [x, y] = fn(t);
      points.push(
        ((x * 50 * scale) + 50 + '% ') +
        ((y * 50 * scale) + 50 + '%')
      );
    }

    return option.type
      ? `polygon(${ option.type }, ${ points.join(',') })`
      : `polygon(${ points.join(',') })`;
  }

  function rotate(x, y, deg) {
    let rad = DEG * deg;
    return [
      x * cos(rad) - y * sin(rad),
      y * cos(rad) + x * sin(rad)
    ];
  }

  const shapes =  {

    circle() {
      return 'circle(49%)';
    },

    triangle() {
      return polygon({ split: 3, start: -90 }, t => [
        cos(t) * 1.1,
        sin(t) * 1.1 + .2
      ]);
    },

    rhombus() {
      return polygon({ split: 4 });
    },

    pentagon() {
      return polygon({ split: 5, start: 54 });
    },

    hexgon() {
      return polygon({ split: 6, start: 30 });
    },

    hexagon() {
      return polygon({ split: 6, start: 30 });
    },

    heptagon() {
      return polygon({ split: 7, start: -90 });
    },

    octagon() {
      return polygon({ split: 8, start: 22.5 });
    },

    star() {
      return polygon({ split: 5, start: 54, deg: 144 });
    },

    diamond() {
      return 'polygon(50% 5%, 80% 50%, 50% 95%, 20% 50%)';
    },

    cross() {
      return `polygon(
      5% 35%,  35% 35%, 35% 5%,  65% 5%,
      65% 35%, 95% 35%, 95% 65%, 65% 65%,
      65% 95%, 35% 95%, 35% 65%, 5% 65%
    )`;
    },

    clover(k = 3) {
      k = clamp(k, 3, 5);
      if (k == 4) k = 2;
      return polygon({ split: 240 }, t => {
        let x = cos(k * t) * cos(t);
        let y = cos(k * t) * sin(t);
        if (k == 3) x -= .2;
        if (k == 2) {
          x /= 1.1;
          y /= 1.1;
        }
        return [x, y];
      });
    },

    hypocycloid(k = 3) {
      k = clamp(k, 3, 6);
      let m = 1 - k;
      return polygon({ scale: 1 / k  }, t => {
        let x = m * cos(t) + cos(m * (t - PI));
        let y = m * sin(t) + sin(m * (t - PI));
        if (k == 3) {
          x = x * 1.1 - .6;
          y = y * 1.1;
        }
        return [x, y];
      });
    },

    astroid() {
      return shapes.hypocycloid(4);
    },

    infinity() {
      return polygon(t => {
        let a = .7 * sqrt(2) * cos(t);
        let b = (pow(sin(t), 2) + 1);
        return [
          a / b,
          a * sin(t) / b
        ]
      });
    },

    heart() {
      return polygon(t => {
        let x = .75 * pow(sin(t), 3);
        let y =
            cos(1 * t) * (13 / 18)
          - cos(2 * t) * (5 / 18)
          - cos(3 * t) / 18
          - cos(4 * t) / 18;
        return rotate(
          x * 1.2,
          (y + .2) * 1.1,
          180
        );
      });
    },

    bean() {
      return polygon(t => {
        let [a, b] = [pow(sin(t), 3), pow(cos(t), 3)];
        return rotate(
          (a + b) * cos(t) * 1.3 - .45,
          (a + b) * sin(t) * 1.3 - .45,
          -90
        );
      });
    },

    bicorn() {
      return polygon(t => rotate(
        cos(t),
        pow(sin(t), 2) / (2 + sin(t)) - .5,
        180
      ));
    },

    drop() {
      return polygon(t => rotate(
        sin(t),
        (1 + sin(t)) * cos(t) / 1.4,
        90
      ));
    },

    pear() {
      return polygon(t => [
        sin(t),
        (1 + sin(t)) * cos(t) / 1.4
      ]);
    },

    fish() {
      return polygon(t => [
        cos(t) - pow(sin(t), 2) / sqrt(2),
        sin(2 * t) / 2
      ]);
    },

    whale() {
      return polygon({ split: 240 }, t => {
        let r = 3.4 * (pow(sin(t), 2) - .5) * cos(t);
        return rotate(
          cos(t) * r + .75,
          sin(t) * r * 1.2,
          180
        );
      });
    },

    bud(n = 3) {
      n = clamp(n, 3, 10);
      return polygon({ split: 240 }, t => [
        ((1 + .2 * cos(n * t)) * cos(t)) * .8,
        ((1 + .2 * cos(n * t)) * sin(t)) * .8
      ]);
    },

    alien(...args) {
      let [a = 1, b = 1, c = 1, d = 1, e = 1]
        = args.map(n => clamp(n, 1, 9));
      return polygon({ split: 480, type: 'evenodd' }, t => [
        (cos(t * a) + cos(t * c) + cos(t * e)) * .31,
        (sin(t * b) + sin(t * d) + sin(t)) * .31
      ]);
    }

  };

  function is_seperator(c, no_space) {
    if (no_space) return /[,，]/.test(c);
    else return /[,，\s]/.test(c);
  }

  function skip_seperator(it, no_space) {
    while (!it.end()) {
      if (!is_seperator(it.curr(1), no_space)) break;
      else it.next();
    }
  }

  function parse$2(input, no_space = false) {
    if (is_nil(input)) input = '';
    const it = iterator(String(input));
    const result = [], stack = [];
    let group = '';

    while (!it.end()) {
      let c = it.curr();
      if (c === undefined) break;
      if (c == '(') {
        group += c;
        stack.push(c);
      }

      else if (c == ')') {
        group += c;
        if (stack.length) {
          stack.pop();
        }
      }

      else if (stack.length) {
        group += c;
      }

      else if (is_seperator(c, no_space)) {
        result.push(group);
        group = '';
        skip_seperator(it, no_space);
      }

      else {
        group += c;
      }

      it.next();
    }

    if (!is_nil(group)) {
      result.push(group);
    }

    return result;
  }

  function get_exposed(random) {
    const { shuffle } = List(random);
    const { pick, rand, unique_id } = random_func(random);

    const Expose = {

      index({ count }) {
        return _ => count;
      },

      row({ y }) {
        return _ => y;
      },

      col({ x }) {
        return _ => x;
      },

      depth({ z }) {
        return _ => z;
      },

      size({ grid }) {
        return _ => grid.count;
      },

      ['size-row']({ grid }) {
        return _ => grid.y;
      },

      ['size-col']({ grid }) {
        return _ => grid.x;
      },

      ['size-depth']({ grid }) {
        return _ => grid.z;
      },

      id({ x, y, z }) {
        return _ => cell_id(x, y, z);
      },

      n({ extra }) {
        return _ => extra ? extra[0] : '@n';
      },

      nx({ extra }) {
        return _ => extra ? extra[1] : '@nx';
      },

      ny({ extra }) {
        return _ => extra ? extra[2] : '@ny';
      },

      N({ extra }) {
        return _ => extra ? extra[3] : '@N';
      },

      repeat: (
        make_sequence('')
      ),

      multiple: (
        make_sequence(',')
      ),

      ['multiple-with-space']: (
        make_sequence(' ')
      ),

      pick({ context }) {
        return expand((...args) => {
          return push_stack(context, 'last_pick', pick(args));
        });
      },

      ['pick-n']({ context, extra, position }) {
        let counter = 'pn-counter' + position;
        return expand((...args) => {
          if (!context[counter]) context[counter] = 0;
          context[counter] += 1;
          let max = args.length;
          let [ idx ] = extra || [];
          let pos = ((idx === undefined ? context[counter] : idx) - 1) % max;
          let value = args[pos];
          return push_stack(context, 'last_pick', value);
        });
      },

      ['pick-d']({ context, extra, position }) {
        let counter = 'pd-counter' + position;
        let values = 'pd-values' + position;
        return expand((...args) => {
          if (!context[counter]) context[counter] = 0;
          context[counter] += 1;
          if (!context[values]) {
            context[values] = shuffle(args);
          }
          let max = args.length;
          let [ idx ] = extra || [];
          let pos = ((idx === undefined ? context[counter] : idx) - 1) % max;
          let value = context[values][pos];
          return push_stack(context, 'last_pick', value);
        });
      },

      ['last-pick']({ context }) {
        return (n = 1) => {
          let stack = context.last_pick;
          return stack ? stack.last(n) : '';
        };
      },

      rand({ context }) {
        return (...args) => {
          let transform_type = args.every(is_letter)
            ? by_charcode
            : by_unit;
          let value = transform_type(rand).apply(null, args);
          return push_stack(context, 'last_rand', value);
        };
      },

      ['rand-int']({ context }) {
        return (...args) => {
          let transform_type = args.every(is_letter)
            ? by_charcode
            : by_unit;
          let value = parseInt(
            transform_type(rand).apply(null, args)
          );
          return push_stack(context, 'last_rand', value);
        }
      },

      ['last-rand']({ context }) {
        return (n = 1) => {
          let stack = context.last_rand;
          return stack ? stack.last(n) : '';
        };
      },

      stripe() {
        return (...input) => {
          let colors = input.map(get_value);
          let max = colors.length;
          let default_count = 0;
          let custom_sizes = [];
          let prev;
          if (!max) {
            return '';
          }
          colors.forEach(step => {
            let [_, size] = parse$2(step);
            if (size !== undefined) custom_sizes.push(size);
            else default_count += 1;
          });
          let default_size = custom_sizes.length
            ? `(100% - ${custom_sizes.join(' - ')}) / ${default_count}`
            : `100% / ${max}`;
          return colors
            .map((step, i) => {
              if (custom_sizes.length) {
                let [color, size] = parse$2(step);
                let prefix = prev ? (prev + ' + ') : '';
                prev = prefix + (size !== undefined ? size : default_size);
                return `${color} 0 calc(${ prev })`
              }
              return `${step} 0 ${100 / max * (i + 1)}%`
            })
            .join(',');
        }
      },

      calc() {
        return value => calc(get_value(value));
      },

      hex() {
        return value => parseInt(get_value(value)).toString(16);
      },

      svg: lazy(input => {
        if (input === undefined) return '';
        let svg = normalize_svg(get_value(input()).trim());
        return create_svg_url(svg);
      }),

      ['svg-filter']: lazy(input => {
        if (input === undefined) return '';
        let id = unique_id('filter-');
        let svg = normalize_svg(get_value(input()).trim())
          .replace(
            /<filter([\s>])/,
            `<filter id="${ id }"$1`
          );
        return create_svg_url(svg, id);
      }),

      var() {
        return value => `var(${ get_value(value) })`;
      },

      shape() {
        return memo('shape-function', (type = '', ...args) => {
          type = type.trim();
          if (typeof shapes[type] === 'function') {
            return shapes[type](args);
          }
          return '';
        });
      },

    };

    function make_sequence(c) {
      return lazy((n, action) => {
        if (!action || !n) return '';
        let count = get_value(n());
        return sequence(count, (i, x, y, max) => get_value(action(i, x, y, max))).join(c);
      });
    }

    function push_stack(context, name, value) {
      if (!context[name]) context[name] = new Stack();
      context[name].push(value);
      return value;
    }

    return alias_for(Expose, {
      'm': 'multiple',
      'M': 'multiple-with-space',

      'r':  'rand',
      'ri': 'rand-int',
      'lr': 'last-rand',

      'p':  'pick',
      'pn': 'pick-n',
      'pd': 'pick-d',
      'lp': 'last-pick',

      'rep': 'repeat',

      'i': 'index',
      'x': 'col',
      'y': 'row',
      'z': 'depth',

      'I': 'size',
      'X': 'size-col',
      'Y': 'size-row',
      'Z': 'size-depth',

      // legacy names
      'ms': 'multiple-with-space',
      's':  'size',
      'sx': 'size-col',
      'sy': 'size-row',
      'sz': 'size-depth',
      'size-x': 'size-col',
      'size-y': 'size-row',
      'size-z': 'size-depth',
      'multi': 'multiple',
      'pick-by-turn': 'pick-n',
      'max-row': 'size-row',
      'max-col': 'size-col',

      // error prone
      'stripes': 'stripe',
      'strip':   'stripe',
    });
  }

  let all = [];

  function get_props(arg) {
    if (!all.length) {
      let props = new Set();
      for (let n in document.head.style) {
        if (!n.startsWith('-')) {
          props.add(n.replace(/[A-Z]/g, '-$&').toLowerCase());
        }
      }
      if (!props.has('grid-gap')) {
        props.add('grid-gap');
      }
      all = Array.from(props);
    }
    return (arg && arg.test)
      ? all.filter(n => arg.test(n))
      : all;
  }

  function build_mapping(prefix) {
    let reg = new RegExp(`\\-?${ prefix }\\-?`);
    return get_props(reg)
      .map(n => n.replace(reg, ''))
      .reduce((obj, n) => { return obj[n] = n, obj }, {});
  }

  const props_webkit_mapping = build_mapping('webkit');
  const props_moz_mapping = build_mapping('moz');

  function prefixer(prop, rule) {
    if (props_webkit_mapping[prop]) {
      return `-webkit-${ rule } ${ rule }`;
    }
    else if (props_moz_mapping[prop]) {
      return `-moz-${ rule } ${ rule }`;
    }
    return rule;
  }

  const presets = {

   '4a0': [ 1682, 2378 ],
   '2a0': [ 1189, 1682 ],
    a0:   [ 841, 1189 ],
    a1:   [ 594, 841 ],
    a2:   [ 420, 594 ],
    a3:   [ 297, 420 ],
    a4:   [ 210, 297 ],
    a5:   [ 148, 210 ],
    a6:   [ 105, 148 ],
    a7:   [ 74, 105 ],
    a8:   [ 52, 74 ],
    a9:   [ 37, 52 ],
    a10:  [ 26, 37 ],

    b0:  [ 1000, 1414 ],
    b1:  [ 707, 1000 ],
    b2:  [ 500, 707 ],
    b3:  [ 353, 500 ],
    b4:  [ 250, 353 ],
    b5:  [ 176, 250 ],
    b6:  [ 125, 176 ],
    b7:  [ 88, 125 ],
    b8:  [ 62, 88 ],
    b9:  [ 44, 62 ],
    b10: [ 31, 44 ],
    b11: [ 22, 32 ],
    b12: [ 16, 22 ],

    c0:  [ 917, 1297 ],
    c1:  [ 648, 917 ],
    c2:  [ 458, 648 ],
    c3:  [ 324, 458 ],
    c4:  [ 229, 324 ],
    c5:  [ 162, 229 ],
    c6:  [ 114, 162 ],
    c7:  [ 81, 114 ],
    c8:  [ 57, 81 ],
    c9:  [ 40, 57 ],
    c10: [ 28, 40 ],
    c11: [ 22, 32 ],
    c12: [ 16, 22 ],

    d0: [ 764, 1064 ],
    d1: [ 532, 760 ],
    d2: [ 380, 528 ],
    d3: [ 264, 376 ],
    d4: [ 188, 260 ],
    d5: [ 130, 184 ],
    d6: [ 92, 126 ],

    letter:         [ 216, 279 ],
    legal:          [ 216, 356 ],
    'junior-legal': [ 203, 127 ],
    ledger:         [ 279, 432 ],
    tabloid:        [ 279, 432 ],
    executive:      [ 190, 254 ],

    postcard:        [ 100, 148 ],
    'business-card': [ 54, 90 ],

    poster: [ 390, 540 ],
  };

  const modes = {
    portrait: 'p',
    pt: 'p',
    p: 'p',

    landscape: 'l',
    ls: 'l',
    l: 'l',
  };

  const unit = 'mm';

  function get_preset(name, mode) {
    name = String(name).toLowerCase();

    // Default to landscape mode
    let [h, w] = presets[name] || [];

    if (modes[mode] == 'p') {
      [w, h] = [h, w];
    }

    return [w, h].map(n => n + unit);
  }

  function is_preset(name) {
    return !!presets[name];
  }

  var Property = {

    ['@size'](value, { is_special_selector }) {
      let [w, h = w] = parse$2(value);
      if (is_preset(w)) {
        [w, h] = get_preset(w, h);
      }
      return `
      width: ${ w };
      height: ${ h };
      ${ is_special_selector ? '' : `
        --internal-cell-width: ${ w };
        --internal-cell-height: ${ h };
      `}
    `;
    },

    ['@min-size'](value) {
      let [w, h = w] = parse$2(value);
      return `min-width: ${ w }; min-height: ${ h };`;
    },

    ['@max-size'](value) {
      let [w, h = w] = parse$2(value);
      return `max-width: ${ w }; max-height: ${ h };`;
    },

    ['@place-cell']: (() => {
      let map_left_right = {
        'center': '50%', '0': '0%',
        'left': '0%', 'right': '100%',
        'top': '50%', 'bottom': '50%'
      };
      let map_top_bottom = {
        'center': '50%', '0': '0%',
        'top': '0%', 'bottom': '100%',
        'left': '50%', 'right': '50%',
      };

      return value => {
        let [left, top = '50%'] = parse$2(value);
        left = map_left_right[left] || left;
        top = map_top_bottom[top] || top;
        const cw = 'var(--internal-cell-width, 25%)';
        const ch = 'var(--internal-cell-height, 25%)';
        return `
        position: absolute;
        left: ${ left };
        top: ${ top };
        width: ${ cw };
        height: ${ ch };
        margin-left: calc(${ cw } / -2) !important;
        margin-top: calc(${ ch } / -2) !important;
        grid-area: unset !important;
      `;
      }
    })(),

    ['@grid'](value, options) {
      let [grid, ...size] = value.split('/').map(s => s.trim());
      size = size.join(' / ');
      return {
        grid: parse_grid(grid),
        size: size ? this['@size'](size, options) : ''
      };
    },

    ['@shape']: memo$1('shape-property', value => {
      let [type, ...args] = parse$2(value);
      let prop = 'clip-path';
      if (!shapes[type]) return '';
      let rules = `${ prop }: ${ shapes[type].apply(null, args) };`;
      return prefixer(prop, rules) + 'overflow: hidden;';
    }),

    ['@use'](rules) {
      if (rules.length > 2) {
        return rules;
      }
    }

  };

  function build_expr(expr) {
    return n => String(expr)
      .replace(/(\d+)(n)/g, '$1*' + n)
      .replace(/n/g, n);
  }

  function nth(input, curr, max) {
    let expr = build_expr(input);
    for (let i = 0; i <= max; ++i) {
      if (calc(expr(i)) == curr) return true;
    }
  }

  const is$1 = {
    even: n => !(n % 2),
    odd:  n => !!(n % 2)
  };

  function even_or_odd(expr) {
    return /^(even|odd)$/.test(expr);
  }

  function Selector(random) {

    return {

      at({ x, y }) {
        return (x1, y1) => (x == x1 && y == y1);
      },

      nth({ count, grid }) {
        return (...exprs) => exprs.some(expr =>
          even_or_odd(expr)
            ? is$1[expr](count)
            : nth(expr, count, grid.count)
        );
      },

      row({ y, grid }) {
        return (...exprs) => exprs.some(expr =>
          even_or_odd(expr)
            ? is$1[expr](y)
            : nth(expr, y, grid.y)
        );
      },

      col({ x, grid }) {
        return (...exprs) => exprs.some(expr =>
          even_or_odd(expr)
            ? is$1[expr](x)
            : nth(expr, x, grid.x)
        );
      },

      even({ count, grid, y }) {
        return arg => {
          if (arg === 'cross' && is$1.even(grid.x)) {
            let m = is$1.even(y) ? 'odd' : 'even';
            return is$1[m](count);
          } else {
            return is$1.even(count);
          }
        }
      },

      odd({ count, grid, y}) {
        return arg => {
          if (arg === 'cross' && is$1.even(grid.x)) {
            let m = is$1.even(y) ? 'even' : 'odd';
            return is$1[m](count);
          } else {
            return is$1.odd(count);
          }
        }
      },

      random() {
        return (ratio = .5) => {
          if (ratio >= 1 && ratio <= 0) ratio = .5;
          return random() < ratio;
        }
      }

    }
  }

  // Expose all Math functions and constants.
  const methods = Object.getOwnPropertyNames(Math);

  var MathFunc = methods.reduce((expose, n) => {
    expose[n] = () => (...args) => {
      args = args.map(get_value);
      if (typeof Math[n] === 'number') return Math[n];
      return Math[n].apply(null, args.map(calc));
    };
    return expose;
  }, {});

  const initial = {
    length: '0px',
    number: 0,
    color: 'black',
    url: 'url()',
    image: 'url()',
    integer: 0,
    angle: '0deg',
    time: '0ms',
    resolution: '0dpi',
    percentage: '0%',
    'length-percentage': '0%',
    'transform-function': 'translate(0)',
    'transform-list': 'translate(0)',
    'custom-ident': '_'
  };

  function get_definition(name) {
    let type = String(name).substr(2).split('-')[0];
    if (initial[type] !== undefined) {
      return {
        name: name,
        syntax: `<${type}> | <${type}>+ | <${type}>#`,
        initialValue: initial[type],
        inherits: false
      }
    }
  }

  let { join, make_array, remove_empty_values } = List();

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
      this.reset();
      this.Func = get_exposed(random);
      this.Selector = Selector(random);
      this.custom_properties = {};
    }

    reset() {
      this.styles = {
        host: '',
        container: '',
        cells: '',
        keyframes: ''
      };
      this.coords = [];
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
          input.push(...parse$2(arg.value, true));
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
          let fn = this.pick_func(arg.name.substr(1));
          if (fn) {
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
            if (fn) {
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

      let rule = `${ prop }: ${ value };`;
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
              this.grid = transformed.grid;
              rule = transformed.size || '';
            } else {
              rule = '';            if (!this.is_grid_defined) {
                transformed = Property[prop](value, {
                  is_special_selector: true
                });
                this.grid = transformed.grid;
                this.add_rule(':host', transformed.size || '');
              }
            }
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
            this.pre_compose_rule(token, coords);
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
        definitions: definitions
      }
    }
  }

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

  function get_all_variables(element) {
    if (element.computedStyleMap) {
      return read_style_map(element);
    }
    return read_computed_stle(element);
  }

  function get_all_variables_inline(element) {
    let variables = get_all_variables(element);
    let ret = [];
    for (let prop in variables) {
      ret.push(prop + ':' + variables[prop]);
    }
    return ret.join(';');
  }

  function get_variable(element, name) {
    return getComputedStyle(element).getPropertyValue(name)
      .trim()
      .replace(/^\(|\)$/g, '');

  }

  function read_style_map(element) {
    let ret = {};
    for (const [prop, value] of element.computedStyleMap()) {
      if (prop.startsWith('--')) {
        ret[prop] = value[0][0];
      }
    }
    return ret;
  }

  function read_computed_stle(element) {
    let ret = {};
    let styles = getComputedStyle(element);
    for (let i = 0; i < styles.length; ++i) {
      let prop = styles[i];
      if (prop.startsWith('--')) {
        ret[prop] = styles.getPropertyValue(prop);
      }
    }
    return ret;
  }

  /*
  Copyright 2019 David Bau.
  Permission is hereby granted, free of charge, to any person obtaining
  a copy of this software and associated documentation files (the
  "Software"), to deal in the Software without restriction, including
  without limitation the rights to use, copy, modify, merge, publish,
  distribute, sublicense, and/or sell copies of the Software, and to
  permit persons to whom the Software is furnished to do so, subject to
  the following conditions:
  The above copyright notice and this permission notice shall be
  included in all copies or substantial portions of the Software.
  THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
  EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
  MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
  IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
  CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
  TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
  SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
  */

  var global = window;
  var math = Math;
  var pool = [];

  //
  // The following constants are related to IEEE 754 limits.
  //

  var width = 256,        // each RC4 output is 0 <= x < 256
      chunks = 6,         // at least six RC4 outputs for each double
      digits = 52,        // there are 52 significant digits in a double
      rngname = 'random', // rngname: name for Math.random and Math.seedrandom
      startdenom = math.pow(width, chunks),
      significance = math.pow(2, digits),
      overflow = significance * 2,
      mask = width - 1,
      nodecrypto;         // node.js crypto module, initialized at the bottom.

  //
  // seedrandom()
  // This is the seedrandom function described above.
  //
  function seedrandom(seed, options, callback) {
    var key = [];
    options = (options == true) ? { entropy: true } : (options || {});

    // Flatten the seed string or build one from local entropy if needed.
    var shortseed = mixkey(flatten(
      options.entropy ? [seed, tostring(pool)] :
      (seed == null) ? autoseed() : seed, 3), key);

    // Use the seed to initialize an ARC4 generator.
    var arc4 = new ARC4(key);

    // This function returns a random double in [0, 1) that contains
    // randomness in every bit of the mantissa of the IEEE 754 value.
    var prng = function() {
      var n = arc4.g(chunks),             // Start with a numerator n < 2 ^ 48
          d = startdenom,                 //   and denominator d = 2 ^ 48.
          x = 0;                          //   and no 'extra last byte'.
      while (n < significance) {          // Fill up all significant digits by
        n = (n + x) * width;              //   shifting numerator and
        d *= width;                       //   denominator and generating a
        x = arc4.g(1);                    //   new least-significant-byte.
      }
      while (n >= overflow) {             // To avoid rounding up, before adding
        n /= 2;                           //   last byte, shift everything
        d /= 2;                           //   right using integer math until
        x >>>= 1;                         //   we have exactly the desired bits.
      }
      return (n + x) / d;                 // Form the number within [0, 1).
    };

    prng.int32 = function() { return arc4.g(4) | 0; };
    prng.quick = function() { return arc4.g(4) / 0x100000000; };
    prng.double = prng;

    // Mix the randomness into accumulated entropy.
    mixkey(tostring(arc4.S), pool);

    // Calling convention: what to return as a function of prng, seed, is_math.
    return (options.pass || callback ||
        function(prng, seed, is_math_call, state) {
          if (state) {
            // Load the arc4 state from the given state if it has an S array.
            if (state.S) { copy(state, arc4); }
            // Only provide the .state method if requested via options.state.
            prng.state = function() { return copy(arc4, {}); };
          }

          // If called as a method of Math (Math.seedrandom()), mutate
          // Math.random because that is how seedrandom.js has worked since v1.0.
          if (is_math_call) { math[rngname] = prng; return seed; }

          // Otherwise, it is a newer calling convention, so return the
          // prng directly.
          else return prng;
        })(
    prng,
    shortseed,
    'global' in options ? options.global : (this == math),
    options.state);
  }

  //
  // ARC4
  //
  // An ARC4 implementation.  The constructor takes a key in the form of
  // an array of at most (width) integers that should be 0 <= x < (width).
  //
  // The g(count) method returns a pseudorandom integer that concatenates
  // the next (count) outputs from ARC4.  Its return value is a number x
  // that is in the range 0 <= x < (width ^ count).
  //
  function ARC4(key) {
    var t, keylen = key.length,
        me = this, i = 0, j = me.i = me.j = 0, s = me.S = [];

    // The empty key [] is treated as [0].
    if (!keylen) { key = [keylen++]; }

    // Set up S using the standard key scheduling algorithm.
    while (i < width) {
      s[i] = i++;
    }
    for (i = 0; i < width; i++) {
      s[i] = s[j = mask & (j + key[i % keylen] + (t = s[i]))];
      s[j] = t;
    }

    // The "g" method returns the next (count) outputs as one number.
    (me.g = function(count) {
      // Using instance members instead of closure state nearly doubles speed.
      var t, r = 0,
          i = me.i, j = me.j, s = me.S;
      while (count--) {
        t = s[i = mask & (i + 1)];
        r = r * width + s[mask & ((s[i] = s[j = mask & (j + t)]) + (s[j] = t))];
      }
      me.i = i; me.j = j;
      return r;
      // For robust unpredictability, the function call below automatically
      // discards an initial batch of values.  This is called RC4-drop[256].
      // See http://google.com/search?q=rsa+fluhrer+response&btnI
    })(width);
  }

  //
  // copy()
  // Copies internal state of ARC4 to or from a plain object.
  //
  function copy(f, t) {
    t.i = f.i;
    t.j = f.j;
    t.S = f.S.slice();
    return t;
  }
  //
  // flatten()
  // Converts an object tree to nested arrays of strings.
  //
  function flatten(obj, depth) {
    var result = [], typ = (typeof obj), prop;
    if (depth && typ == 'object') {
      for (prop in obj) {
        try { result.push(flatten(obj[prop], depth - 1)); } catch (e) {}
      }
    }
    return (result.length ? result : typ == 'string' ? obj : obj + '\0');
  }

  //
  // mixkey()
  // Mixes a string seed into a key that is an array of integers, and
  // returns a shortened string seed that is equivalent to the result key.
  //
  function mixkey(seed, key) {
    var stringseed = seed + '', smear, j = 0;
    while (j < stringseed.length) {
      key[mask & j] =
        mask & ((smear ^= key[mask & j] * 19) + stringseed.charCodeAt(j++));
    }
    return tostring(key);
  }

  //
  // autoseed()
  // Returns an object for autoseeding, using window.crypto and Node crypto
  // module if available.
  //
  function autoseed() {
    try {
      var out;
      if (nodecrypto && (out = nodecrypto.randomBytes)) ; else {
        out = new Uint8Array(width);
        (global.crypto || global.msCrypto).getRandomValues(out);
      }
      return tostring(out);
    } catch (e) {
      var browser = global.navigator,
          plugins = browser && browser.plugins;
      return [+new Date, global, plugins, global.screen, tostring(pool)];
    }
  }

  //
  // tostring()
  // Converts an array of charcodes to a string
  //
  function tostring(a) {
    return String.fromCharCode.apply(0, a);
  }

  //
  // When seedrandom.js is loaded, we immediately mix a few bits
  // from the built-in RNG into the entropy pool.  Because we do
  // not want to interfere with deterministic PRNG state later,
  // seedrandom will not call math.random on its own again after
  // initialization.
  //
  mixkey(math.random(), pool);

  class Doodle extends HTMLElement {
    constructor() {
      super();
      this.doodle = this.attachShadow({ mode: 'open' });
      this.extra = {
        get_variable: name => get_variable(this, name)
      };
    }

    connectedCallback(again) {
      if (/^(complete|interactive|loaded)$/.test(document.readyState)) {
        this.load(again);
      } else {
        setTimeout(() => this.load(again));
      }
    }

    update(styles) {
      let use = this.get_use();
      if (!styles) styles = this.innerHTML;
      this.innerHTML = styles;

      if (!this.grid_size) {
        this.grid_size = this.get_grid();
      }

      let { x: gx, y: gy, z: gz } = this.grid_size;

      const compiled = this.generate(
        parse$1(use + styles, this.extra)
      );

      if (compiled.grid) {
        let { x, y, z } = compiled.grid;
        if (gx !== x || gy !== y || gz !== z) {
          Object.assign(this.grid_size, compiled.grid);
          return this.build_grid(compiled, compiled.grid);
        }
        Object.assign(this.grid_size, compiled.grid);
      }

      else {
        let grid = this.get_grid();
        let { x, y, z } = grid;
        if (gx !== x || gy !== y || gz !== z) {
          Object.assign(this.grid_size, grid);
          return this.build_grid(
            this.generate(parse$1(use + styles, this.extra)),
            grid
          );
        }
      }

      this.set_content('.style-keyframes', compiled.styles.keyframes);

      if (compiled.props.has_animation) {
        this.set_content('.style-cells', '');
        this.set_content('.style-container', '');
      }

      setTimeout(() => {
        this.set_content('.style-container',
            get_grid_styles(this.grid_size)
          + compiled.styles.host
          + compiled.styles.container
        );
        this.set_content('.style-cells', compiled.styles.cells);
      });
    }

    get grid() {
      return Object.assign({}, this.grid_size);
    }

    set grid(grid) {
      this.attr('grid', grid);
      this.connectedCallback(true);
    }

    get seed() {
      return this._seed_value;
    }

    set seed(seed) {
      this.attr('seed', seed);
      this.connectedCallback(true);
    }

    get use() {
      return this.attr('use');
    }

    set use(use) {
      this.attr('use', use);
      this.connectedCallback(true);
    }

    static get observedAttributes() {
      return ['grid', 'use', 'seed'];
    }

    attributeChangedCallback(name, old_val, new_val) {
      if (old_val == new_val) {
        return false;
      }
      let observed = ['grid', 'use', 'seed'].includes(name);
      if (observed && !is_nil(old_val)) {
        this[name] = new_val;
      }
    }

    get_grid() {
      return parse_grid(this.attr('grid'));
    }

    get_use() {
      let use = this.attr('use') || '';
      if (use) use = `@use:${ use };`;
      return use;
    }

    attr(name, value) {
      if (arguments.length === 1) {
        return this.getAttribute(name);
      }
      if (arguments.length === 2) {
        this.setAttribute(name, value);
        return value;
      }
    }

    generate(parsed) {
      let grid = this.get_grid();
      let seed = this.attr('seed') || this.attr('data-seed');

      if (is_nil(seed)) {
        seed = Date.now();
      }

      seed = String(seed);
      this._seed_value = seed;

      let random = seedrandom(seed);
      let compiled = this.compiled = generator(parsed, grid, random);
      return compiled;
    }

    load(again) {
      let use = this.get_use();
      if (!this.innerHTML.trim() && !use) {
        return false;
      }

      let parsed = parse$1(use + this.innerHTML, this.extra);
      let compiled = this.generate(parsed);

      this.grid_size = compiled.grid
        ? compiled.grid
        : this.get_grid();

      this.build_grid(compiled, this.grid_size);

      if (!again) {
        if (this.hasAttribute('click-to-update')) {
          this.addEventListener('click', e => this.update());
        }
      }
    }

    build_grid(compiled, grid) {
      const { has_transition, has_animation } = compiled.props;
      const { keyframes, host, container, cells } = compiled.styles;
      const definitions = compiled.definitions;

      this.doodle.innerHTML = `
      <style>
        ${ get_basic_styles() }
      </style>
      <style class="style-keyframes">
        ${ keyframes }
      </style>
      <style class="style-container">
        ${ get_grid_styles(grid) }
        ${ host }
        ${ container }
      </style>
      <style class="style-cells">
        ${ (has_transition || has_animation) ? '' : cells }
      </style>
      <grid class="container"></grid>
    `;

      this.doodle.querySelector('.container')
        .appendChild(create_cells(grid));

      if (has_transition || has_animation) {
        setTimeout(() => {
          this.set_content('.style-cells', cells);
        }, 50);
      }

      // might be removed in the future
      if (window.CSS && window.CSS.registerProperty) {
        try {
          definitions.forEach(CSS.registerProperty);
        } catch (e) { }
      }
    }

    export({ scale, autoSize, name, download, detail } = {}) {
      return new Promise((resolve, reject) => {
        const { has_transition, has_animation } = this.compiled.props;
        const { keyframes, host, container, cells } = this.compiled.styles;
        const grid = this.grid_size;
        let variables = get_all_variables_inline(this);

        let html = `
        <style>
          ${ get_basic_styles() }
          ${ get_grid_styles(grid) }
          ${ host }
          ${ container }
          ${ cells }
          ${ keyframes }
        </style>
        ${ this.doodle.querySelector('.container').outerHTML }
      `;

        let { width, height } = this.getBoundingClientRect();
        scale = parseInt(scale) || 1;
        let is_safari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

        let w = width * scale;
        let h = height * scale;

        let svg = minify(`
        <svg xmlns="http://www.w3.org/2000/svg"
          preserveAspectRatio="none"
          viewBox="0 0 ${ width } ${ height }"
          ${ autoSize ? '' : `
            width="${ is_safari ? width : w }px"
            height="${ is_safari ? height : h }px"
          `}
        >
          <foreignObject width="100%" height="100%">
            <div
              class="host"
              xmlns="http://www.w3.org/1999/xhtml"
              style="width: ${ width }px; height: ${ height }px; "
            >
              <style>.host { ${variables} }</style>
              ${ html }
            </div>
          </foreignObject>
        </svg>
      `);

        if (download || detail) {
          svg_to_png(svg, w, h)
            .then(({ source, url, blob }) => {
              resolve({
                width: w, height: h, svg, blob, source
              });
              if (download) {
                let a = document.createElement('a');
                a.download = normalize_png_name(name);
                a.href = url;
                a.click();
              }
            })
            .catch(error => {
              reject(error);
            });
        } else {
          resolve({
            width: w, height: h, svg: svg
          });
        }
      });
    }

    set_content(selector, styles) {
      const el = this.shadowRoot.querySelector(selector);
      el && (el.styleSheet
        ? (el.styleSheet.cssText = styles )
        : (el.innerHTML = styles));
    }
  }

  if (!customElements.get('css-doodle')) {
    customElements.define('css-doodle', Doodle);
  }

  function get_basic_styles() {
    const inherited_grid_props = get_props(/grid/)
      .map(n => `${ n }: inherit;`)
      .join('');
    return `
    * {
      box-sizing: border-box;
    }
    *::after, *::before {
      box-sizing: inherit;
    }
    :host, .host {
      display: block;
      visibility: visible;
      width: auto;
      height: auto;
    }
    .container {
      position: relative;
      width: 100%;
      height: 100%;
      display: grid;
      ${ inherited_grid_props }
    }
    .container cell:empty {
      position: relative;
      line-height: 1;
      display: grid;
      place-items: center;
    }
  `;
  }

  function get_grid_styles({x, y}) {
    return `
    :host, .host {
      grid-template-rows: repeat(${ y }, 1fr);
      grid-template-columns: repeat(${ x }, 1fr);
    }
  `;
  }

  function minify(input) {
    return input
      .replace(/\n\s+|^\s+|\n+/g, ' ')
      .trim();
  }

  function create_cell(x, y, z) {
    let cell = document.createElement('cell');
    cell.id = cell_id(x, y, z);
    return cell;
  }

  function create_cells({ x, y, z }) {
    let root = document.createDocumentFragment();
    if (z == 1) {
      for (let j = 1; j <= y; ++j) {
        for (let i = 1; i <= x; ++i) {
          root.appendChild(create_cell(i, j, 1));
        }
      }
    }
    else {
      let temp = null;
      for (let i = 1; i <= z; ++i) {
        let cell = create_cell(1, 1, i);
        (temp || root).appendChild(cell);
        temp = cell;
      }
      temp = null;
    }
    return root;
  }

  function CSSDoodle(input, ...vars) {
    let get_value = v => is_nil(v) ? '' : v;
    let rules = input.reduce((s, c, i) => s + c + get_value(vars[i]), '');
    let doodle = document.createElement('css-doodle');
    if (doodle.update) {
      doodle.update(rules);
    }
    return doodle;
  }

  return CSSDoodle;

})));
