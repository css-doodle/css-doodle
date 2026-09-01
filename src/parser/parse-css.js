// AST:
//   rule       { type: 'rule', property, value: Group[] }
//              plus raw() and rawValue() reading the source span
//   at-rule    { type: 'at-rule', property: '', value: string }
//   pseudo     { type: 'pseudo', selector, selectors: string[], styles }
//   cond       { type: 'cond', name, addition, segments, position, styles }
//   keyframes  { type: 'keyframes', name, steps }
//   step       { type: 'step', name: Group[], styles }
//   func       { type: 'func', name, arguments: Argument[], position,
//                variables? (when an argument list was consumed) }
//   text       { type: 'text', value }
import { scan, Token } from './tokenizer.js';
import parseVar from './parse-var.js';
import parseSvg from './parse-svg.js';
import parseValueGroup from './parse-value-group.js';
import generateSvgExtended from '../generator/svg-extended.js';

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
    headIndex() {
        let t = this.tokens[this.i];
        return t ? t.index : this.source.length;
    }
    tailEnd() {
        let t = this.tokens[this.i - 1];
        return t ? tokenEnd(t) : 0;
    }
    position() {
        return ++this.ctx.position;
    }
}

function tokenEnd(token) {
    return token.index + token.value.length;
}

function adjacent(a, b) {
    return tokenEnd(a) === b.index;
}

function throwError(msg, pos = []) {
    console.warn(`(at line ${pos[1] + 1}, column ${pos[0] + 1}) ${msg}`);
}

function isNumber(n) {
    return !isNaN(n);
}

function getTextValue(input) {
    if (input.trim().length) {
        return isNumber(+input) ? +input : input.trim();
    }
    return input;
}

function isPairOf(c, n) {
    return ({ '"': '"', "'": "'", '(': ')' })[c] == n;
}

function isSvg(name) {
    return /^@svg$/i.test(name);
}

function composible(name) {
    return /^@(canvas|shaders|doodle)/.test(name);
}

function substitutePi(input, prev) {
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

function separateFuncName(name) {
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

function hasTimesSyntax(token) {
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

// first top-level, unquoted terminator symbol ahead of the cursor
function probe(cur, ...terminators) {
    let paren = 0, quote = false;
    for (let i = cur.i; i < cur.tokens.length; ++i) {
        let t = cur.tokens[i];
        if (t.status === 'open') quote = true;
        else if (t.status === 'close') quote = false;
        if (!quote && t.isSymbol('(')) paren++;
        else if (!quote && t.isSymbol(')')) paren = Math.max(0, paren - 1);
        else if (paren === 0 && !quote && t.isSymbol(...terminators)) {
            return t.value;
        }
    }
    return '';
}

function probeSelector(cur) {
    return probe(cur, '{', ';', '}') === '{';
}

function probeBlock(cur) {
    return probe(cur, ':', ';', '{', '}');
}

function isKeyframesAt(cur) {
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

function parseValue(cur, extra, breakOn) {
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

        if (splitDollar(cur)) {
            continue;
        }

        if (tok.isSymbol()) {
            if (!quote && (v === ';' || v === '}' || v === '<' || v === breakOn)) {
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
            if ((v === '@' || v === '$') && isFuncStart(cur)) {
                flush();
                group.push(parseFunc(cur, extra));
                continue;
            }
            if (tok.status === 'open') quote = true;
            else if (tok.status === 'close') quote = false;
            if (v === '(') paren++;
            else if (v === ')') paren = Math.max(0, paren - 1);
            cur.next();
            buf += (v === 'π') ? substitutePi(v, cur.source[tok.index - 1]) : v;
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

function isFuncStart(cur) {
    let tok = cur.peek();
    let next = cur.peek(1);
    return !!(next && adjacent(tok, next) && RE_FUNC_START.test(next.value[0]));
}

function splitDollar(cur) {
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

function parseFunc(cur, extra, variables = {}) {
    let tok = cur.next(); // '@' or '$'
    let isCalc = tok.isSymbol('$');
    let name = '@';
    let end = tok.index + 1;

    while (!cur.end()) {
        let t = cur.peek();
        if (t.index !== end) break;
        if (t.isWord() && t.value.includes('$') && splitDollar(cur)) {
            t = cur.peek();
        }
        if (t.isSymbol('(') || !RE_NAME_TOKEN.test(t.value)) {
            break;
        }
        name += t.value;
        end += t.value.length;
        cur.next();
    }
    return finishFunc(cur, name, end, isCalc, extra, variables);
}

function finishFunc(cur, name, end, isCalc, extra, variables) {
    let func = Node.func();
    let hasArguments = false;

    let dot = findCompositionDot(name, cur, end);
    if (dot > 0) {
        let inner;
        if (dot < name.length - 1) {
            inner = finishFunc(cur, '@' + name.slice(dot + 1), end, false, extra, variables);
        } else {
            inner = parseFunc(cur, extra);
        }
        name = name.slice(0, dot);
        func.arguments = [Node.argument([inner])];
        func.variables = variables;
        hasArguments = true;
    }
    else {
        let paren = cur.peek();
        if (paren && paren.index === end && paren.isSymbol('(')) {
            cur.next();
            if (composible(name)) {
                func.arguments = parseDoodleBody(cur, paren.index + 1);
            } else {
                let closed = parseArguments(cur, paren.index + 1, extra, variables);
                func.arguments = closed.args;
                if (isSvg(name)) {
                    func.arguments = expandSvg(
                        cur, cur.source.slice(paren.index + 1, closed.end), closed.args, extra, variables);
                }
            }
            func.variables = variables;
            hasArguments = true;
        }
    }

    let { fname, extra: extraArgs } = separateFuncName(name);
    func.name = isCalc ? '@$' + name.slice(1) : fname;
    if (extraArgs.length) {
        func.arguments.unshift(Node.argument([Node.text(extraArgs)]));
    }

    if (isCalc && func.name.length > 2) {
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

function findCompositionDot(name, cur, end) {
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

function parseArguments(cur, start, extra, variables) {
    let args = [];
    let values = [];
    let runStart = start;
    let lastRun = '';
    let paren = 0;
    let quote = false;
    let end = cur.source.length;

    const flushText = (to, atFunc) => {
        let text = substitutePi(cur.source.slice(runStart, to), cur.source[runStart - 1]);
        lastRun = text;
        if (!text.length) return;
        if (values.length === 0) {
            if (atFunc) {
                text = text.trimStart();
                if (text.length) values.push(Node.text(text));
            } else {
                values.push(Node.text(getTextValue(text)));
            }
        } else if (atFunc || /\S/.test(text)) {
            values.push(Node.text(text));
        }
    };

    const pushArgument = () => {
        // ±x expands into two arguments: -x and x
        if (lastRun.trim().startsWith('±') && values.length) {
            let raw = lastRun.trim().slice(1);
            let cloned = structuredClone(values);
            cloned[cloned.length - 1].value = '-' + raw;
            args.push(normalizeArgument(cloned));
            values[values.length - 1].value = raw;
        }
        args.push(normalizeArgument(values));
        values = [];
        lastRun = '';
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
            flushText(tok.index, true);
            values.push(parseFunc(cur, extra, variables));
            runStart = cur.tailEnd();
            continue;
        }
        if (splitDollar(cur)) {
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
                flushText(tok.index, false);
                pushArgument();
                end = tok.index;
                cur.next();
                return { args: skipLastEmptyArgs(args), end };
            }
            if (v === ',' && paren === 0) {
                flushText(tok.index, false);
                pushArgument();
                cur.next();
                runStart = tok.index + 1;
                continue;
            }
        }
        cur.next();
    }
    // unterminated argument list: pending values are dropped like before
    return { args: skipLastEmptyArgs(args), end };
}

function skipLastEmptyArgs(args) {
    let first = args[0];
    if (first) {
        let last = first.values[first.values.length - 1];
        if (last && last.type === 'text' && !String(last.value).trim().length) {
            first.values = first.values.slice(0, -1);
        }
    }
    return args;
}

function normalizeArgument(values) {
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
    if (isPairOf(cf, ce) && (cf !== '(' || parensWrapWhole(values))) {
      ft.value = ft.value.slice(1);
      ed.value = ed.value.slice(0, ed.value.length - 1);
      cluster = true;
    }
  }
  return Node.argument(values, cluster);
}

function parensWrapWhole(values) {
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

function parseDoodleBody(cur, start) {
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
        let body = substitutePi(cur.source.slice(start, tok.index), cur.source[start - 1]);
        cur.next();
        return [normalizeArgument([Node.text(getTextValue(body))])];
      }
      paren--;
    }
    cur.next();
  }
  let body = substitutePi(cur.source.slice(start), cur.source[start - 1]);
  return [normalizeArgument([Node.text(getTextValue(body))])];
}

function expandSvg(cur, raw, args, extra, variables) {
  let parsedSvg = parseSvg(raw);
  for (let item of parsedSvg.value) {
    if (item.variable) {
      let rules = parseSource(`${item.name}: ${item.value}`, extra, cur.ctx);
      if (rules[0]) {
        variables[item.name] = rules[0].value;
      }
    }
  }
  if (/\d\s*{/.test(raw) && hasTimesSyntax(parsedSvg)) {
    let svg = generateSvgExtended(parsedSvg) + ')';
    let sub = new Cursor(svg, cur.ctx);
    return parseArguments(sub, 0, extra, variables).args;
  }
  return args;
}

function parseRule(cur, extra) {
  let rule = { type: 'rule', property: '', value: [] };
  let source = cur.source;
  let start = cur.headIndex();
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
          rule.value = parseUse(cur, extra);
        } else {
          cur.next();
          rule.value = parseValue(cur, extra);
        }
        end = cur.headIndex();
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

function parseUse(cur, extra) {
  cur.next(); // ':'
  let groups = parseValue(cur, extra);
  let result = [];
  for (let group of groups) {
    evaluateValue(group, extra, cur.ctx);
    let [token] = group;
    if (token && token.value && token.value.length) {
      result.push(...token.value);
    }
  }
  return result;
}

function readVariable(extra, name) {
  return (extra && extra.getVariable) ? extra.getVariable(name) : '';
}

function evaluateValue(values, extra, ctx) {
  for (let v of values) {
    if (v.type === 'text' && v.value) {
      let vars = parseVar(v.value);
      v.value = vars.reduce((ret, p) => {
        let rule = readVariable(extra, p.name);
        if (!rule && p.fallback) {
          p.fallback.every(n => {
            let other = readVariable(extra, n.name);
            if (other) {
              rule = other;
              return false;
            }
            return true;
          });
        }
        let parsed;
        try {
          parsed = parseSource(rule, extra, ctx);
        } catch (e) {}
        if (parsed) {
          ret.push(...parsed);
        }
        return ret;
      }, []);
    }
    if (v.type === 'func' && v.arguments) {
      for (let arg of v.arguments) {
        evaluateValue(arg.values, extra, ctx);
      }
    }
  }
}

// Shared block-body loop. `level` selects the few branches that differ:
// 'pseudo' spreads @use and takes no nested conds/keyframes,
// 'top' has no '&', skips tags and stray '}', and keeps at-rules.
function parseBlockBody(cur, extra, level) {
  let styles = [];
  while (!cur.end()) {
    let tok = cur.peek();
    if (tok.isSpace()) {
      cur.next();
      continue;
    }
    if (tok.isSymbol('}')) {
      cur.next();
      if (level === 'top') continue;
      break;
    }
    if (tok.isSymbol(':')) {
      let pseudo = parsePseudo(cur, extra);
      if (pseudo.selector) styles.push(pseudo);
      continue;
    }
    if (tok.isSymbol('&') && level !== 'top') {
      styles.push(parseCond(cur, extra));
      continue;
    }
    if (level !== 'pseudo') {
      if (isKeyframesAt(cur)) {
        styles.push(parseKeyframes(cur, extra));
        continue;
      }
      if (level === 'top' && tok.isSymbol('<')) {
        skipTag(cur);
        continue;
      }
      if (level === 'cond' && tok.isSymbol('@') && probeBlock(cur) === '{') {
        styles.push(parseCond(cur, extra));
        continue;
      }
      if (probeSelector(cur)) {
        let nested = parseCond(cur, extra);
        if (nested.name.length) styles.push(nested);
        continue;
      }
    }
    let rule = parseRule(cur, extra);
    if (level === 'pseudo' && rule.property === '@use') {
      styles.push(...rule.value);
    } else if (rule.property || (level === 'top' && rule.type === 'at-rule')) {
      styles.push(rule);
    }
  }
  return styles;
}

function parsePseudo(cur, extra) {
  let pseudo = { type: 'pseudo', selector: '', selectors: [], styles: [] };
  let start = cur.headIndex();

  // selector runs to the first '{'
  while (!cur.end() && !cur.peek().isSymbol('{')) {
    cur.next();
  }
  let selector = cur.source.slice(start, cur.headIndex()).trim();
  if (cur.end() || !selector) {
    cur.next();
    return pseudo;
  }
  cur.next(); // '{'

  if (selector.startsWith(':doodle')) {
    selector = selector.replace(/^\:+doodle/, ':host');
  }
  pseudo.selector = selector;
  pseudo.selectors = parseValueGroup(selector);
  pseudo.styles = parseBlockBody(cur, extra, 'pseudo');
  return pseudo;
}

function parseCond(cur, extra) {
  let cond = { type: 'cond', name: '', styles: [] };
  Object.assign(cond, parseCondSelector(cur));
  if (cur.end()) return cond;
  cur.next(); // '{'
  cond.styles = parseBlockBody(cur, extra, 'cond');
  return cond;
}

function parseCondSelector(cur) {
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
      let args = parseArguments(cur, tok.index + 1, undefined, {}).args;
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

function parseKeyframes(cur, extra) {
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
    throwError('missing keyframes name', start && start.pos);
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
    keyframes.steps.push(parseStep(cur, extra));
  }
  return keyframes;
}

function parseStep(cur, extra) {
  let step = { type: 'step', name: '', styles: [] };
  step.name = parseValue(cur, extra, '{');
  if (cur.end()) return step;
  // the name may also stop at ';' or '}': only '{' opens a body, and a
  // '}' stays put so the keyframes loop can close the block instead of
  // the step swallowing everything after it
  if (!cur.peek().isSymbol('{')) {
    if (!cur.peek().isSymbol('}')) cur.next();
    return step;
  }
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
    step.styles.push(parseRule(cur, extra));
  }
  return step;
}

function skipTag(cur) {
  while (!cur.end() && !cur.peek().isSymbol('>')) {
    cur.next();
  }
  cur.next();
}

function parseStatements(cur, extra) {
  return parseBlockBody(cur, extra, 'top');
}

function parseSource(input, extra, ctx) {
  let source = String(input === undefined || input === null ? '' : input).trim();
  return parseStatements(new Cursor(source, ctx), extra);
}

export default function parse(input, extra) {
  return parseSource(input, extra, { position: 0 });
}
