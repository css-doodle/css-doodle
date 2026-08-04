/**
 * AST:
 *   rule       { type: 'rule', property, value: Group[] }
 *              plus raw() and rawValue() reading the source span
 *   at-rule    { type: 'at-rule', property: '', value: string }
 *   pseudo     { type: 'pseudo', selector, selectors: string[], styles }
 *   cond       { type: 'cond', name, addition, segments, position, styles }
 *   keyframes  { type: 'keyframes', name, steps }
 *   step       { type: 'step', name: Group[], styles }
 *   func       { type: 'func', name, arguments: Argument[], position,
 *                variables? (when an argument list was consumed) }
 *   text       { type: 'text', value }
 */
import { scan, Token } from './tokenizer.js';
import parse_var from './parse-var.js';
import parse_svg from './parse-svg.js';
import parse_value_group from './parse-value-group.js';
import generate_svg_extended from '../generator/svg-extended.js';

const PI = String(Math.PI);
const RE_NAME_TOKEN = /^[0-9a-zA-Z_\-.%]+$/;
const RE_FUNC_START = /[0-9a-zA-Z_\-(%]/;

class Cursor {
  constructor(source, ctx) {
    this.source = source;
    this.tokens = scan(source);
    this.ctx = ctx;
    this.i = 0;
  }
  peek(n = 0) {
    return this.tokens[this.i + n];
  }
  next() {
    return this.tokens[this.i++];
  }
  end() {
    return this.i >= this.tokens.length;
  }
  head_index() {
    let t = this.tokens[this.i];
    return t ? t.index : this.source.length;
  }
  tail_end() {
    let t = this.tokens[this.i - 1];
    return t ? token_end(t) : 0;
  }
  position() {
    return ++this.ctx.position;
  }
}

function token_end(token) {
  return token.index + token.value.length;
}

function adjacent(a, b) {
  return token_end(a) === b.index;
}

function throw_error(msg, pos = []) {
  console.warn(`(at line ${pos[1] + 1}, column ${pos[0] + 1}) ${msg}`);
}

function is_number(n) {
  return !isNaN(n);
}

function get_text_value(input) {
  if (input.trim().length) {
    return is_number(+input) ? +input : input.trim();
  }
  return input;
}

function is_pair_of(c, n) {
  return ({ '"': '"', "'": "'", '(': ')' })[c] == n;
}

function is_svg(name) {
  return /^@svg$/i.test(name);
}

function composible(name) {
  return /^@(canvas|shaders|doodle)/.test(name);
}

function substitute_pi(input, prev) {
  if (!input.includes('π')) return input;
  let result = '';
  for (let i = 0; i < input.length; ++i) {
    let c = input[i];
    if (c === 'π') {
      let p = i > 0 ? input[i - 1] : prev;
      result += (p >= '0' && p <= '9') ? c : PI;
    } else {
      result += c;
    }
  }
  return result;
}

function seperate_func_name(name) {
  let fname = '', extra = '';
  if ((/\D$/.test(name) && !/\d+[x-]\d+/.test(name)) || Math[name.slice(1)]) {
    return { fname: name, extra };
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

const Node = {
  text(value) {
    return { type: 'text', value };
  },
  func(name = '') {
    return { type: 'func', name, arguments: [] };
  },
  argument(values, cluster = false) {
    return { values, cluster };
  },
};

function probe_selector(cur) {
  let paren = 0, quote = false;
  for (let i = cur.i; i < cur.tokens.length; ++i) {
    let t = cur.tokens[i];
    if (t.status === 'open') quote = true;
    else if (t.status === 'close') quote = false;
    if (t.isSymbol('(')) paren++;
    else if (t.isSymbol(')')) paren = Math.max(0, paren - 1);
    else if (paren === 0 && !quote) {
      if (t.isSymbol('{')) return true;
      if (t.isSymbol(';', '}')) return false;
    }
  }
  return false;
}

function probe_block(cur) {
  let paren = 0, quote = false;
  for (let i = cur.i; i < cur.tokens.length; ++i) {
    let t = cur.tokens[i];
    if (t.status === 'open') quote = true;
    else if (t.status === 'close') quote = false;
    if (t.isSymbol('(')) paren++;
    else if (t.isSymbol(')')) paren = Math.max(0, paren - 1);
    else if (paren === 0 && !quote && t.isSymbol(':', ';', '{', '}')) {
      return t.value;
    }
  }
  return '';
}

function is_keyframes_at(cur) {
  let at = cur.peek();
  let word = cur.peek(1);
  if (!at || !word) return false;
  if (!at.isSymbol('@') || !word.isWord() || word.value !== 'keyframes') {
    return false;
  }
  if (!adjacent(at, word)) return false;
  let after = cur.peek(2);
  // '@keyframes2' reads as a longer word in the legacy grammar
  if (after && adjacent(word, after) && /^[\w@]/.test(after.value)) {
    return false;
  }
  return true;
}

function parse_value(cur, extra, break_on) {
  let groups = [[]];
  let group = groups[0];
  let buf = '';
  let skip = true;
  let paren = 0;
  let quote = false;

  const flush = () => {
    if (buf.length) {
      group.push(Node.text(buf));
      buf = '';
    }
  };

  while (!cur.end()) {
    let tok = cur.peek();
    let v = tok.value;

    if (tok.isSpace()) {
      if (skip) {
        cur.next();
        continue;
      }
      cur.next();
      buf += quote ? v : ' ';
      continue;
    }
    skip = false;

    if (split_dollar(cur)) {
      continue;
    }

    if (tok.isSymbol()) {
      if (!quote && (v === ';' || v === '}' || v === '<' || v === break_on)) {
        break;
      }
      if (v === ',' && paren === 0) {
        cur.next();
        flush();
        group = [];
        groups.push(group);
        skip = true;
        continue;
      }
      if ((v === '@' || v === '$') && is_func_start(cur)) {
        flush();
        group.push(parse_func(cur, extra));
        continue;
      }
      if (tok.status === 'open') quote = true;
      else if (tok.status === 'close') quote = false;
      if (v === '(') paren++;
      else if (v === ')') paren = Math.max(0, paren - 1);
      cur.next();
      if (v === 'π') {
        let prev = cur.source[tok.index - 1];
        buf += (prev >= '0' && prev <= '9') ? v : PI;
      } else {
        buf += v;
      }
      continue;
    }

    cur.next();
    if (quote && tok.isWord() && cur.source[tok.index] === '\\') {
      buf += '\\' + v;
    } else {
      buf += v;
    }
  }

  flush();
  return groups;
}

function is_func_start(cur) {
  let tok = cur.peek();
  let next = cur.peek(1);
  return !!(next && adjacent(tok, next) && RE_FUNC_START.test(next.value[0]));
}

function split_dollar(cur) {
  let tok = cur.peek();
  if (!tok || !tok.isWord() || !tok.value.includes('$')) return false;
  let k = tok.value.indexOf('$');
  let parts = [];
  if (k > 0) {
    parts.push(new Token({
      type: 'Word', value: tok.value.slice(0, k), pos: tok.pos, index: tok.index
    }));
  }
  parts.push(new Token({
    type: 'Symbol', value: '$', pos: tok.pos, index: tok.index + k
  }));
  if (k + 1 < tok.value.length) {
    parts.push(new Token({
      type: 'Word', value: tok.value.slice(k + 1), pos: tok.pos, index: tok.index + k + 1
    }));
  }
  cur.tokens.splice(cur.i, 1, ...parts);
  return true;
}

function parse_func(cur, extra, variables = {}) {
  let tok = cur.next(); // '@' or '$'
  let is_calc = tok.isSymbol('$');
  let name = '@';
  let end = tok.index + 1;

  while (!cur.end()) {
    let t = cur.peek();
    if (t.index !== end) break;
    if (t.isWord() && t.value.includes('$') && split_dollar(cur)) {
      t = cur.peek();
    }
    if (t.isSymbol('(') || !RE_NAME_TOKEN.test(t.value)) {
      break;
    }
    name += t.value;
    end += t.value.length;
    cur.next();
  }
  return finish_func(cur, name, end, is_calc, extra, variables);
}

function finish_func(cur, name, end, is_calc, extra, variables) {
  let func = Node.func();
  let has_arguments = false;

  let dot = find_composition_dot(name, cur, end);
  if (dot > 0) {
    let inner;
    if (dot < name.length - 1) {
      inner = finish_func(cur, '@' + name.slice(dot + 1), end, false, extra, variables);
    } else {
      inner = parse_func(cur, extra);
    }
    name = name.slice(0, dot);
    func.arguments = [Node.argument([inner])];
    func.variables = variables;
    has_arguments = true;
  }
  else {
    let paren = cur.peek();
    if (paren && paren.index === end && paren.isSymbol('(')) {
      cur.next();
      if (composible(name)) {
        func.arguments = parse_doodle_body(cur, paren.index + 1);
      } else {
        let closed = parse_arguments(cur, paren.index + 1, extra, variables);
        func.arguments = closed.args;
        if (is_svg(name)) {
          func.arguments = expand_svg(
            cur, cur.source.slice(paren.index + 1, closed.end), closed.args, extra, variables);
        }
      }
      func.variables = variables;
      has_arguments = true;
    }
  }

  let { fname, extra: extra_args } = seperate_func_name(name);
  func.name = is_calc ? '@$' + name.slice(1) : fname;
  if (extra_args.length) {
    func.arguments.unshift(Node.argument([Node.text(extra_args)]));
  }

  if (is_calc && func.name.length > 2) {
    if (!func.arguments.length) {
      let value = func.name.substring(2);
      func.name = func.name.substring(0, 2);
      func.arguments.push(Node.argument([Node.text(value)]));
    }
    if (/\d$/.test(func.name)) {
      let value = func.name.substring(2);
      func.name = func.name.substring(0, 2);
      func.arguments[0].values[0].value = value;
    }
  }

  func.position = cur.position();
  return func;
}

function find_composition_dot(name, cur, end) {
  for (let i = 1; i < name.length; ++i) {
    if (name[i] === '.') {
      let next = name[i + 1];
      if (next === undefined) {
        let t = cur.peek();
        if (t && t.index === end && t.isSymbol('@', '$')) {
          return i;
        }
        return -1;
      }
      if (/[a-zA-Z]/.test(next)) {
        return i;
      }
    }
  }
  return -1;
}

function parse_arguments(cur, start, extra, variables) {
  let args = [];
  let values = [];
  let run_start = start;
  let last_run = '';
  let paren = 0;
  let quote = false;
  let end = cur.source.length;

  const flush_text = (to, at_func) => {
    let text = substitute_pi(cur.source.slice(run_start, to), cur.source[run_start - 1]);
    last_run = text;
    if (!text.length) return;
    if (values.length === 0) {
      if (at_func) {
        text = text.trimStart();
        if (text.length) values.push(Node.text(text));
      } else {
        values.push(Node.text(get_text_value(text)));
      }
    } else if (at_func || /\S/.test(text)) {
      values.push(Node.text(text));
    }
  };

  const push_argument = () => {
    // ±x expands into two arguments: -x and x
    if (last_run.trim().startsWith('±') && values.length) {
      let raw = last_run.trim().slice(1);
      let cloned = structuredClone(values);
      cloned[cloned.length - 1].value = '-' + raw;
      args.push(normalize_argument(cloned));
      values[values.length - 1].value = raw;
    }
    args.push(normalize_argument(values));
    values = [];
    last_run = '';
  };

  while (!cur.end()) {
    let tok = cur.peek();
    if (tok.status === 'open') {
      quote = true;
      cur.next();
      continue;
    }
    if (tok.status === 'close') {
      quote = false;
      cur.next();
      continue;
    }
    // functions fire inside quotes too, like everywhere else
    if (tok.isSymbol('@', '$')) {
      flush_text(tok.index, true);
      values.push(parse_func(cur, extra, variables));
      run_start = cur.tail_end();
      continue;
    }
    if (split_dollar(cur)) {
      continue;
    }
    if (!quote && tok.isSymbol()) {
      let v = tok.value;
      if (v === '(') {
        paren++;
        cur.next();
        continue;
      }
      if (v === ')') {
        if (paren > 0) {
          paren--;
          cur.next();
          continue;
        }
        flush_text(tok.index, false);
        push_argument();
        end = tok.index;
        cur.next();
        return { args: skip_last_empty_args(args), end };
      }
      if (v === ',' && paren === 0) {
        flush_text(tok.index, false);
        push_argument();
        cur.next();
        run_start = tok.index + 1;
        continue;
      }
    }
    cur.next();
  }
  // unterminated argument list: pending values are dropped like before
  return { args: skip_last_empty_args(args), end };
}

function skip_last_empty_args(args) {
  let first = args[0];
  if (first) {
    let last = first.values[first.values.length - 1];
    if (last && last.type === 'text' && !String(last.value).trim().length) {
      first.values = first.values.slice(0, -1);
    }
  }
  return args;
}

function normalize_argument(values) {
  for (let v of values) {
    if (v.type === 'text' && typeof v.value === 'string' && v.value.includes('`')) {
      v.value = v.value.replace(/`/g, '"');
    }
  }
  let cluster = false;
  let ft = values[0];
  let ed = values[values.length - 1];
  if (ft && ed && ft.type === 'text' && ed.type === 'text'
      && typeof ft.value === 'string' && typeof ed.value === 'string') {
    let cf = ft.value[0];
    let ce = ed.value[ed.value.length - 1];
    // Only strip a surrounding pair when it actually wraps the whole argument
    if (is_pair_of(cf, ce) && (cf !== '(' || parens_wrap_whole(values))) {
      ft.value = ft.value.slice(1);
      ed.value = ed.value.slice(0, ed.value.length - 1);
      cluster = true;
    }
  }
  return Node.argument(values, cluster);
}

function parens_wrap_whole(values) {
  let str = values
    .filter(v => v.type === 'text' && typeof v.value === 'string')
    .map(v => v.value)
    .join('');
  let depth = 0;
  for (let i = 0; i < str.length; ++i) {
    let c = str[i];
    if (c === '(') depth++;
    else if (c === ')') {
      depth--;
      if (depth === 0 && i !== str.length - 1) return false;
    }
  }
  return depth === 0;
}

function parse_doodle_body(cur, start) {
  let paren = 0;
  let quote = false;
  while (!cur.end()) {
    let tok = cur.peek();
    if (tok.status === 'open') {
      quote = true;
    } else if (tok.status === 'close') {
      quote = false;
    } else if (!quote && tok.isSymbol('(')) {
      paren++;
    } else if (!quote && tok.isSymbol(')')) {
      if (paren === 0) {
        let body = substitute_pi(cur.source.slice(start, tok.index), cur.source[start - 1]);
        cur.next();
        return [normalize_argument([Node.text(get_text_value(body))])];
      }
      paren--;
    }
    cur.next();
  }
  let body = substitute_pi(cur.source.slice(start), cur.source[start - 1]);
  return [normalize_argument([Node.text(get_text_value(body))])];
}

function expand_svg(cur, raw, args, extra, variables) {
  let parsed_svg = parse_svg(raw);
  for (let item of parsed_svg.value) {
    if (item.variable) {
      let rules = parse_source(`${item.name}: ${item.value}`, extra, cur.ctx);
      if (rules[0]) {
        variables[item.name] = rules[0].value;
      }
    }
  }
  if (/\d\s*{/.test(raw) && has_times_syntax(parsed_svg)) {
    let svg = generate_svg_extended(parsed_svg) + ')';
    let sub = new Cursor(svg, cur.ctx);
    return parse_arguments(sub, 0, extra, variables).args;
  }
  return args;
}

function parse_rule(cur, extra) {
  let rule = { type: 'rule', property: '', value: [] };
  let source = cur.source;
  let start = cur.head_index();
  let colon = -1;
  let end = -1;
  let buf = '';
  let paren = 0;
  let quote = false;

  while (!cur.end()) {
    let tok = cur.peek();
    let v = tok.value;
    if (tok.status === 'open') quote = true;
    else if (tok.status === 'close') quote = false;

    if (!quote && paren === 0 && tok.isSymbol()) {
      if (v === '}') {
        end = tok.index;
        break;
      }
      if (v === ';') {
        if (buf.trim().length && !rule.property.length) {
          rule.type = 'at-rule';
          rule.value = buf + ';';
          cur.next();
          end = tok.index + 1;
          break;
        }
        buf += v;
        cur.next();
        continue;
      }
      if (v === ':') {
        rule.property = buf.trim();
        colon = tok.index;
        if (rule.property === '@use') {
          rule.value = parse_use(cur, extra);
        } else {
          cur.next();
          rule.value = parse_value(cur, extra);
        }
        end = cur.head_index();
        if (!cur.end() && cur.peek().isSymbol(';')) {
          cur.next();
        }
        break;
      }
    }
    if (!quote) {
      if (tok.isSymbol('(')) paren++;
      else if (tok.isSymbol(')')) paren = Math.max(0, paren - 1);
    }
    cur.next();
    buf += tok.isSpace() ? ' ' : v;
  }

  if (end < 0) end = source.length;
  rule.raw = () => source.slice(start, end).trim();
  rule.rawValue = colon < 0
    ? () => ''
    : () => source.slice(colon + 1, end).trim();
  return rule;
}

function parse_use(cur, extra) {
  cur.next(); // ':'
  let groups = parse_value(cur, extra);
  let result = [];
  for (let group of groups) {
    evaluate_value(group, extra, cur.ctx);
    let [token] = group;
    if (token && token.value && token.value.length) {
      result.push(...token.value);
    }
  }
  return result;
}

function read_variable(extra, name) {
  return (extra && extra.get_variable) ? extra.get_variable(name) : '';
}

function evaluate_value(values, extra, ctx) {
  for (let v of values) {
    if (v.type === 'text' && v.value) {
      let vars = parse_var(v.value);
      v.value = vars.reduce((ret, p) => {
        let rule = read_variable(extra, p.name);
        if (!rule && p.fallback) {
          p.fallback.every(n => {
            let other = read_variable(extra, n.name);
            if (other) {
              rule = other;
              return false;
            }
            return true;
          });
        }
        let parsed;
        try {
          parsed = parse_source(rule, extra, ctx);
        } catch (e) {}
        if (parsed) {
          ret.push(...parsed);
        }
        return ret;
      }, []);
    }
    if (v.type === 'func' && v.arguments) {
      for (let arg of v.arguments) {
        evaluate_value(arg.values, extra, ctx);
      }
    }
  }
}

function parse_pseudo(cur, extra) {
  let pseudo = { type: 'pseudo', selector: '', selectors: [], styles: [] };
  let start = cur.head_index();

  // selector runs to the first '{'
  while (!cur.end() && !cur.peek().isSymbol('{')) {
    cur.next();
  }
  let selector = cur.source.slice(start, cur.head_index()).trim();
  if (cur.end() || !selector) {
    cur.next();
    return pseudo;
  }
  cur.next(); // '{'

  if (selector.startsWith(':doodle')) {
    selector = selector.replace(/^\:+doodle/, ':host');
  }
  pseudo.selector = selector;
  pseudo.selectors = parse_value_group(selector);

  while (!cur.end()) {
    let tok = cur.peek();
    if (tok.isSpace()) {
      cur.next();
      continue;
    }
    if (tok.isSymbol('}')) {
      cur.next();
      break;
    }
    if (tok.isSymbol(':')) {
      let nested = parse_pseudo(cur, extra);
      if (nested.selector) pseudo.styles.push(nested);
      continue;
    }
    if (tok.isSymbol('&')) {
      pseudo.styles.push(parse_cond(cur, extra));
      continue;
    }
    let rule = parse_rule(cur, extra);
    if (rule.property === '@use') {
      pseudo.styles.push(...rule.value);
    } else if (rule.property) {
      pseudo.styles.push(rule);
    }
  }
  return pseudo;
}

function parse_cond(cur, extra) {
  let cond = { type: 'cond', name: '', styles: [] };
  Object.assign(cond, parse_cond_selector(cur));
  if (cur.end()) return cond;
  cur.next(); // '{'

  while (!cur.end()) {
    let tok = cur.peek();
    if (tok.isSpace()) {
      cur.next();
      continue;
    }
    if (tok.isSymbol('}')) {
      cur.next();
      break;
    }
    if (tok.isSymbol(':')) {
      let pseudo = parse_pseudo(cur, extra);
      if (pseudo.selector) cond.styles.push(pseudo);
      continue;
    }
    if (tok.isSymbol('&')) {
      cond.styles.push(parse_cond(cur, extra));
      continue;
    }
    if (is_keyframes_at(cur)) {
      cond.styles.push(parse_keyframes(cur, extra));
      continue;
    }
    if (tok.isSymbol('@') && probe_block(cur) === '{') {
      cond.styles.push(parse_cond(cur, extra));
      continue;
    }
    if (probe_selector(cur)) {
      let nested = parse_cond(cur, extra);
      if (nested.name.length) cond.styles.push(nested);
      continue;
    }
    let rule = parse_rule(cur, extra);
    if (rule.property) cond.styles.push(rule);
  }
  return cond;
}

function parse_cond_selector(cur) {
  let name = '';
  let keyword = '';
  let segments = [];

  const flush = () => {
    if (keyword.length) {
      if (name) {
        segments.push({ keyword });
      } else {
        name = keyword;
      }
      keyword = '';
    }
  };

  while (!cur.end()) {
    let tok = cur.peek();
    if (tok.isSymbol('(')) {
      flush();
      cur.next();
      let args = parse_arguments(cur, tok.index + 1, undefined, {}).args;
      segments.push({ arguments: args });
      continue;
    }
    if (tok.isSymbol('{')) {
      flush();
      break;
    }
    if (tok.isSymbol(')')) {
      flush();
      cur.next();
      break;
    }
    if (tok.isSpace()) {
      flush();
      cur.next();
      continue;
    }
    keyword += tok.value;
    cur.next();
  }

  let [n, ...addition] = (name || '').trim().split(/\s+/);
  return { name: n, addition, segments, position: cur.position() };
}

function parse_keyframes(cur, extra) {
  let keyframes = { type: 'keyframes', name: '', steps: [] };
  cur.next(); // '@'
  cur.next(); // 'keyframes'

  while (!cur.end() && cur.peek().isSpace()) cur.next();

  // name runs to the next gap or '{'
  let start = cur.peek();
  if (start && !start.isSymbol('{')) {
    let end = start.index;
    while (!cur.end()) {
      let t = cur.peek();
      if (t.index !== end || t.isSymbol('{') || t.isSpace()) break;
      end += t.value.length;
      cur.next();
    }
    keyframes.name = cur.source.slice(start.index, end);
  }
  if (!keyframes.name.length) {
    throw_error('missing keyframes name', start && start.pos);
    return keyframes;
  }

  while (!cur.end() && !cur.peek().isSymbol('{')) cur.next();
  cur.next(); // '{'

  while (!cur.end()) {
    let tok = cur.peek();
    if (tok.isSpace()) {
      cur.next();
      continue;
    }
    if (tok.isSymbol('}')) {
      cur.next();
      break;
    }
    keyframes.steps.push(parse_step(cur, extra));
  }
  return keyframes;
}

function parse_step(cur, extra) {
  let step = { type: 'step', name: '', styles: [] };
  step.name = parse_value(cur, extra, '{');
  cur.next(); // '{'
  while (!cur.end()) {
    let tok = cur.peek();
    if (tok.isSpace()) {
      cur.next();
      continue;
    }
    if (tok.isSymbol('}')) {
      cur.next();
      break;
    }
    step.styles.push(parse_rule(cur, extra));
  }
  return step;
}

function skip_tag(cur) {
  while (!cur.end() && !cur.peek().isSymbol('>')) {
    cur.next();
  }
  cur.next();
}

function parse_statements(cur, extra) {
  let statements = [];
  while (!cur.end()) {
    let tok = cur.peek();
    if (tok.isSpace()) {
      cur.next();
      continue;
    }
    if (tok.isSymbol(':')) {
      let pseudo = parse_pseudo(cur, extra);
      if (pseudo.selector) statements.push(pseudo);
      continue;
    }
    if (is_keyframes_at(cur)) {
      statements.push(parse_keyframes(cur, extra));
      continue;
    }
    if (tok.isSymbol('<')) {
      skip_tag(cur);
      continue;
    }
    if (tok.isSymbol('}')) {
      cur.next();
      continue;
    }
    if (probe_selector(cur)) {
      let cond = parse_cond(cur, extra);
      if (cond.name.length) statements.push(cond);
      continue;
    }
    let rule = parse_rule(cur, extra);
    if (rule.property || rule.type === 'at-rule') {
      statements.push(rule);
    }
  }
  return statements;
}

function parse_source(input, extra, ctx) {
  let source = String(input === undefined || input === null ? '' : input).trim();
  return parse_statements(new Cursor(source, ctx), extra);
}

export default function parse(input, extra) {
  return parse_source(input, extra, { position: 0 });
}
