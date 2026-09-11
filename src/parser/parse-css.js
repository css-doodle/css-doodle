// AST:
//   rule       { type: 'rule', property, value: Group[] } + raw(), rawValue(); Group[] carries hasFunc
//   at-rule    { type: 'at-rule', property: '', value: string }  a statement: @import ...;
//   pseudo     { type: 'pseudo', selector, selectors, styles }  selectors resolved, '&' is the cell
//   cond       { type: 'cond', name, segments, position, styles } + raw(); segments { keyword } | { arguments }, spaced
//   keyframes  { type: 'keyframes', name, steps: [{ type: 'step', name: Group[], styles }] }
//   func       { type: 'func', name, arguments: [{ values, cluster }], position, index, variables?, unit?, size? }
//   text       { type: 'text', value }
//   var        { type: 'var', name }  a `--name` leading an argument, bare or wrapped
// The list carries warnings: [{ message, pos? }], pos a token [col, row]
import { scan, textOf, Token } from './tokenizer.js';
import parseVar from './parse-var.js';
import parseSvg from './parse-svg.js';
import svgSourceOf from './svg-source.js';
import { isSpecialSelector } from '../lib/selector.js';

const PI = String(Math.PI);
const RE_NAME_TOKEN = /^[0-9a-zA-Z_\-.%]+$/;
const RE_FUNC_START = /[0-9a-zA-Z_\-(%]/;
const RE_HOST_COMPOUND = /^:host(?:\(((?:[^()]|\((?:[^()]|\([^()]*\))*\))*)\))?((?:[.#][\w-]+|\[[^\]]*\]|:(?!before\b|after\b|first-l)[\w-]+(?:\((?:[^()]|\([^()]*\))*\))?)+)(?=$|[\s>+~,]|::|:(?:before|after|first-l))/;

class Cursor {
    constructor(source, ctx) {
        this.source = source;
        let tokens = scan(source);
        this.tokens = source.includes('$') ? splitDollars(tokens) : tokens;
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

function warn(ctx, msg, pos) {
    ctx.warnings.push(pos ? { message: msg, pos } : { message: msg });
}

function getTextValue(input) {
    let text = input.trim();
    if (!text.length) return input;
    let n = +text;
    return Number.isNaN(n) ? text : n;
}

const PAIRS = { '"': '"', "'": "'", '(': ')' };

function isPairOf(c, n) {
    return PAIRS[c] === n;
}

function isSvg(name) {
    return /^@svg$/i.test(name);
}

function composable(name) {
    return /^@(shaders|doodle|pattern)/.test(name);
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
    if (!token) return false;
    if (token.times) return true;
    let value = token.value;
    if (Array.isArray(value)) {
        return value.some(hasTimesSyntax);
    }
    if (typeof value === 'object') {
        return hasTimesSyntax(value);
    }
    return false;
}

const Node = {
    text(value) {
        return { type: 'text', value };
    },
    var(name) {
        return { type: 'var', name };
    },
    func() {
        return { type: 'func', name: '', arguments: [] };
    },
    argument(values, cluster = false) {
        return { values, cluster };
    },
};

// index of the first top-level terminator ahead, -1 if none
function probe(cur, ...terminators) {
    let paren = 0, quote = false;
    for (let i = cur.i; i < cur.tokens.length; ++i) {
        let t = cur.tokens[i];
        if (t.status === 'open') quote = true;
        else if (t.status === 'close') quote = false;
        if (!quote && t.isSymbol('(')) paren++;
        else if (!quote && t.isSymbol(')')) paren = Math.max(0, paren - 1);
        else if (paren === 0 && !quote && t.isSymbol(terminators)) {
            return i;
        }
    }
    return -1;
}

function atRuleName(cur) {
    let name = '@';
    for (let i = 1; ; ++i) {
        let t = cur.peek(i);
        if (!t || !adjacent(cur.peek(i - 1), t) || !/^[\w-]+$/.test(t.value)) break;
        name += t.value;
    }
    return name;
}

function parseValue(cur, extra, breakOn) {
    let head = cur.peek();
    let groups = [[]];
    let group = groups[0];
    let buf = '';
    let skip = true;
    let paren = 0;
    let quote = false;
    let hasFunc = false;

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
            cur.next();
            if (!skip) buf += quote ? v : ' ';
            continue;
        }
        skip = false;

        if (tok.isSymbol()) {
            if (!quote && (v === '}' || v === '<' || v === breakOn || (v === ';' && paren === 0))) {
                break;
            }
            if (v === ',' && paren === 0 && !quote) {
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
                hasFunc = true;
                continue;
            }
            if (tok.status === 'open') quote = true;
            else if (tok.status === 'close') quote = false;
            else if (!quote) {
                if (v === '(') paren++;
                else if (v === ')') paren = Math.max(0, paren - 1);
            }
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
    if (paren > 0) {
        warn(cur.ctx, 'unclosed ( in value', head && head.pos);
    }
    groups.hasFunc = hasFunc;
    return groups;
}

function isFuncStart(cur) {
    let tok = cur.peek();
    let next = cur.peek(1);
    return !!(next && adjacent(tok, next) && RE_FUNC_START.test(next.value[0]));
}

// `$` is not a tokenizer symbol: a word carrying one is split around it
function splitDollars(tokens) {
    let result = [];
    for (let tok of tokens) {
        let { value, pos, index } = tok;
        if (!tok.isWord() || !value.includes('$')) {
            result.push(tok);
            continue;
        }
        for (let k; (k = value.indexOf('$')) >= 0; ) {
            if (k > 0) {
                result.push(new Token({ type: 'Word', value: value.slice(0, k), pos, index }));
            }
            result.push(new Token({ type: 'Symbol', value: '$', pos, index: index + k }));
            value = value.slice(k + 1);
            index += k + 1;
        }
        if (value.length) {
            result.push(new Token({ type: 'Word', value, pos, index }));
        }
    }
    return result;
}

function parseFunc(cur, extra, variables = {}) {
    let tok = cur.next(); // '@' or '$'
    let isCalc = tok.isSymbol('$');
    let name = '@';
    let end = tok.index + 1;

    while (!cur.end()) {
        let t = cur.peek();
        if (t.index !== end || !RE_NAME_TOKEN.test(t.value)) break;
        name += t.value;
        end += t.value.length;
        cur.next();
    }
    return finishFunc(cur, name, end, isCalc, extra, variables, tok.index);
}

function finishFunc(cur, name, end, isCalc, extra, variables, index) {
    let func = Node.func();
    func.index = index;
    let hasArguments = false;

    let dot = findCompositionDot(name, cur, end);
    if (dot > 0) {
        let inner;
        if (dot < name.length - 1) {
            inner = finishFunc(cur, '@' + name.slice(dot + 1), end, false, extra, variables, index + dot + 1);
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
            if (composable(name)) {
                func.arguments = parseDoodleBody(cur, paren.index + 1);
            } else {
                let closed = parseArguments(cur, extra, variables);
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

    if (isCalc) {
        // $px(1+1) -> 2px, $4(1+1) -> 24, $123 -> 123
        let suffix = name.slice(1);
        func.name = '@$';
        if (suffix.length) {
            if (hasArguments) func.unit = suffix;
            else func.arguments.push(Node.argument([Node.text(suffix)]));
        }
    } else {
        let { fname, extra: extraArgs } = separateFuncName(name);
        func.name = fname;
        if (extraArgs.length) {
            if (composable(fname)) {
                func.size = extraArgs;
            } else {
                func.arguments.unshift(Node.argument([Node.text(extraArgs)]));
            }
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

function readVarName(cur) {
    let dash = cur.peek(1);
    let head = cur.peek(2);
    if (!dash || !head || !dash.isSymbol('-') || !adjacent(cur.peek(), dash)
            || !adjacent(dash, head) || !(head.isWord() || head.isSymbol('_'))) {
        return '';
    }
    let name = '--';
    let i = 2;
    while (true) {
        let t = cur.peek(i);
        if (!t || !adjacent(cur.peek(i - 1), t)
                || !(t.isWord() || t.isNumber() || t.isSymbol('-', '_'))) {
            break;
        }
        name += t.value;
        i++;
    }
    cur.i += i;
    return name;
}

function declaresVar(cur) {
    let t = cur.peek();
    if (t && t.isSpace()) t = cur.peek(1);
    return !!t && t.isSymbol(':');
}

function parseArguments(cur, extra, variables) {
    let args = [];
    let values = [];
    let buf = '';
    let last = null; // the token buf ends with
    let paren = 0;
    let quote = false;
    let end = cur.source.length;
    let head = cur.peek();

    const flush = atFunc => {
        let text = buf;
        buf = '';
        last = null;
        if (!text.length) return;
        if (values.length === 0) {
            if (atFunc) {
                text = text.trimStart();
                if (text.length) values.push(Node.text(text));
            } else if (/\S/.test(text)) {
                values.push(Node.text(getTextValue(text)));
            }
        } else if (atFunc || /\S/.test(text)) {
            values.push(Node.text(text));
        }
    };

    const pushArgument = () => {
        // ±x expands into -x and x: ±1, ±(a + 1), ±@r(10)
        let head = values[0];
        if (head && head.type === 'text' && typeof head.value === 'string' && head.value.startsWith('±')) {
            let rest = head.value.slice(1).trimStart();
            let cloned = structuredClone(values);
            cloned[0].value = '-' + rest;
            args.push(normalizeArgument(cloned));
            if (rest.length) head.value = rest;
            else values.shift();
        }
        args.push(normalizeArgument(values));
        values = [];
    };

    while (!cur.end()) {
        let tok = cur.peek();
        let v = tok.value;
        // a gap the tokenizer dropped, after ':' or ',', reads as a space
        if (!quote && last && !last.isSpace() && !tok.isSpace() && tok.index > tokenEnd(last)
                && /\s/.test(cur.source.slice(tokenEnd(last), tok.index))) {
            buf += ' ';
            last = null;
        }
        // functions fire inside quotes too
        if (tok.isSymbol('@', '$')) {
            flush(true);
            values.push(parseFunc(cur, extra, variables));
            continue;
        }
        if (!quote && tok.isSymbol()) {
            // `--name:` declares (inside @svg), anything else reads
            if (v === '-' && buf === '') {
                let at = cur.i;
                let name = readVarName(cur);
                if (name && !declaresVar(cur)) {
                    values.push(Node.var(name));
                    continue;
                }
                cur.i = at;
            }
            if (v === '(') {
                paren++;
            } else if (v === ')') {
                if (paren === 0) {
                    flush(false);
                    pushArgument();
                    end = tok.index;
                    cur.next();
                    return { args, end };
                }
                paren--;
            } else if (v === ',' && paren === 0) {
                flush(false);
                pushArgument();
                cur.next();
                continue;
            }
        }
        if (tok.status === 'open') quote = true;
        else if (tok.status === 'close') quote = false;
        cur.next();
        if (quote && tok.isWord() && cur.source[tok.index] === '\\') {
            buf += '\\' + v;
        } else {
            buf += (v === 'π') ? substitutePi(v, cur.source[tok.index - 1]) : v;
        }
        last = tok;
    }
    warn(cur.ctx, 'unterminated argument list', head && head.pos);
    return { args, end };
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
        let wraps = (cf === '(') ? parensWrapWhole(values) : quotesWrapWhole(values, cf);
        if (isPairOf(cf, ce) && wraps) {
            ft.value = ft.value.slice(1);
            ed.value = ed.value.slice(0, ed.value.length - 1);
            cluster = true;
            // (--name) reads like a bare --name
            let name = /^--[\w-]+/.exec(ft.value);
            if (name) {
                let rest = ft.value.slice(name[0].length);
                values[0] = Node.var(name[0]);
                if (rest.length) values.splice(1, 0, Node.text(rest));
            }
        }
    }
    return Node.argument(values, cluster);
}

function textOfNodes(values) {
    let str = '';
    for (let v of values) {
        if (v.type === 'text' && typeof v.value === 'string') str += v.value;
    }
    return str;
}

function parensWrapWhole(values) {
    let str = textOfNodes(values);
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

// "a" "b" is two strings, not one string a" "b
function quotesWrapWhole(values, quote) {
    let str = textOfNodes(values);
    for (let i = 1; i < str.length - 1; ++i) {
        if (str[i] === quote && str[i - 1] !== '\\') return false;
    }
    return true;
}

function parseDoodleBody(cur, start) {
    let paren = 0;
    let quote = false;
    let end = cur.source.length;
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
                end = tok.index;
                cur.next();
                break;
            }
            paren--;
        }
        cur.next();
    }
    let body = substitutePi(cur.source.slice(start, end), cur.source[start - 1]);
    return [normalizeArgument([Node.text(getTextValue(body))])];
}

function expandSvg(cur, raw, args, extra, variables) {
    let parsedSvg = parseSvg(raw);
    // `--name:` anywhere in the body declares for the whole call, last wins
    function collect(block) {
        for (let item of block.value) {
            if (item.variable) {
                let rules = parseSource(`${item.name}: ${item.value}`, extra, cur.ctx);
                if (rules[0]) {
                    variables[item.name] = rules[0].value;
                }
            } else {
                let child = item.type === 'block' ? item : item.value;
                if (child && Array.isArray(child.value)) {
                    collect(child);
                }
            }
        }
    }
    collect(parsedSvg);
    if (hasTimesSyntax(parsedSvg)) {
        let svg = svgSourceOf(parsedSvg) + ')';
        let sub = new Cursor(svg, cur.ctx);
        return parseArguments(sub, extra, variables).args;
    }
    return args;
}

function parseRule(cur, extra) {
    let rule = { type: 'rule', property: '', value: [] };
    let source = cur.source;
    let start = cur.headIndex();
    let colon = -1;
    let end = source.length;
    let stop = probe(cur, ':', ';', '}');
    if (stop < 0) stop = cur.tokens.length;
    let tok = cur.tokens[stop];
    let head = textOf(cur.tokens.slice(cur.i, stop)).trim();
    cur.i = stop;

    if (tok && tok.isSymbol(':')) {
        rule.property = head;
        colon = tok.index;
        cur.next();
        rule.value = head === '@use' ? parseUse(cur, extra) : parseValue(cur, extra);
        end = cur.headIndex();
        if (!cur.end() && cur.peek().isSymbol(';')) {
            cur.next();
        }
    } else if (tok && tok.isSymbol(';')) {
        cur.next();
        rule.type = 'at-rule';
        rule.value = head + ';';
        end = tok.index + 1;
    } else if (tok) {
        end = tok.index;
    }

    rule.raw = () => source.slice(start, end).trim();
    rule.rawValue = colon < 0
        ? () => ''
        : () => source.slice(colon + 1, end).trim();
    return rule;
}

function parseUse(cur, extra) {
    let head = cur.peek();
    let pos = head && head.pos;
    let ctx = cur.ctx;
    let read = name => (extra && extra.getVariable) ? extra.getVariable(name) : '';
    let statements = [];
    for (let [node] of parseValue(cur, extra)) {
        if (!node || node.type !== 'text') continue;
        for (let p of parseVar(node.value)) {
            let name = p.name;
            let rule = read(name);
            for (let n of p.fallback || []) {
                if (rule) break;
                name = n.name;
                rule = read(name);
            }
            // a variable already being inserted refers to itself: skip it
            if (ctx.using.includes(name)) {
                warn(ctx, 'circular @use: ' + name, pos);
                continue;
            }
            ctx.using.push(name);
            try {
                statements.push(...parseSource(rule, extra, ctx));
            } catch (e) {}
            ctx.using.pop();
        }
    }
    return statements;
}

function parseBlockBody(cur, extra, top) {
    let styles = [];
    while (!cur.end()) {
        let tok = cur.peek();
        if (tok.isSpace() || tok.isSymbol(';')) {
            cur.next();
            continue;
        }
        if (tok.isSymbol('}')) {
            cur.next();
            if (top) continue;
            break;
        }
        if (top && tok.isSymbol('<')) {
            skipTag(cur);
            continue;
        }
        let name = tok.isSymbol('@') ? atRuleName(cur) : '';
        let brace = probe(cur, '{', ';', '}');
        let opensBlock = brace >= 0 && cur.tokens[brace].isSymbol('{');
        if (!opensBlock) {
            let rule = parseRule(cur, extra);
            if (rule.property === '@use') {
                styles.push(...rule.value);
            } else if (rule.property || (top && rule.type === 'at-rule')) {
                styles.push(rule);
            }
        } else if (name === '@keyframes') {
            let keyframes = parseKeyframes(cur, extra, brace);
            if (keyframes.name) styles.push(keyframes);
        } else if (!name) {
            let pseudo = parsePseudo(cur, extra, brace);
            if (pseudo.selector) styles.push(pseudo);
        } else {
            styles.push(parseCond(cur, extra, brace));
        }
    }
    return styles;
}

function parsePseudo(cur, extra, brace) {
    let start = cur.headIndex();
    cur.i = brace;
    let selector = cur.source.slice(start, cur.headIndex()).trim();
    cur.next(); // '{'

    let ctx = cur.ctx;
    let outer = ctx.selectors;
    let selectors = ctx.selectors = nestSelectors(splitSelectors(selector), outer);
    let styles = parseBlockBody(cur, extra);
    ctx.selectors = outer;
    return { type: 'pseudo', selector, selectors, styles };
}

function nestSelectors(list, parents) {
    let result = [];
    for (let s of list) {
        s = s.replace(/^:+doodle/, ':host')
            .replace(/^:container\(((?:[^()]|\([^()]*\))*)\)/, ':container$1');
        let nested = isSpecialSelector(s) ? [s]
            : parents.map(p => s.includes('&') ? s.replaceAll('&', p)
                : s.startsWith(':') ? p + s
                : p + ' ' + s);
        for (let n of nested) {
            // the host is featureless: :host:hover never matches, :host(:hover) does
            result.push(n.replace(RE_HOST_COMPOUND, (_, inner = '', compound) => `:host(${inner}${compound})`));
        }
    }
    return result;
}

function splitSelectors(input) {
    let list = [];
    let buf = '';
    let paren = 0;
    let quote = '';
    for (let c of input) {
        if (quote) {
            if (c === quote) quote = '';
        } else if (c === '"' || c === "'") {
            quote = c;
        } else if (c === '(') {
            paren++;
        } else if (c === ')') {
            paren--;
        } else if (c === ',' && paren === 0) {
            list.push(buf);
            buf = '';
            continue;
        }
        buf += c;
    }
    list.push(buf);
    return list.map(s => s.trim().replace(/\s+/g, ' ')).filter(s => s.length);
}

function parseCond(cur, extra, brace) {
    let source = cur.source;
    let start = cur.headIndex();
    let cond = { type: 'cond', ...parseCondSelector(cur, brace) };
    cur.i = brace;
    cur.next(); // '{'
    cond.styles = parseBlockBody(cur, extra);
    let end = cur.tailEnd();
    cond.raw = () => source.slice(start, end);
    return cond;
}

function parseCondSelector(cur, brace) {
    let name = '';
    let keyword = '';
    let spaced = false;
    let segments = [];

    const flush = () => {
        if (keyword.length) {
            if (name) {
                segments.push({ keyword, spaced });
            } else {
                name = keyword;
            }
            keyword = '';
            spaced = false;
        }
    };

    while (cur.i < brace) {
        let tok = cur.next();
        if (tok.isSymbol('(')) {
            flush();
            let args = parseArguments(cur, undefined, {}).args;
            segments.push({ arguments: args, spaced });
            spaced = false;
        } else if (tok.isSpace()) {
            flush();
            spaced = true;
        } else {
            keyword += tok.value;
        }
    }
    flush();
    return { name, segments, position: cur.position() };
}

function parseKeyframes(cur, extra, brace) {
    let keyframes = { type: 'keyframes', name: '', steps: [] };
    cur.next(); // '@'
    cur.next(); // 'keyframes'
    while (cur.peek().isSpace()) cur.next();

    // the name runs to the next gap
    let start = cur.peek();
    let end = start.index;
    while (cur.i < brace) {
        let t = cur.peek();
        if (t.index !== end || t.isSpace()) break;
        end += t.value.length;
        cur.next();
    }
    keyframes.name = cur.source.slice(start.index, end);
    if (!keyframes.name.length) {
        warn(cur.ctx, 'missing keyframes name', start.pos);
    }
    cur.i = brace;
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
    let step = { type: 'step', name: parseValue(cur, extra, '{'), styles: [] };
    // a '}' stays put so the keyframes loop closes the block
    if (!cur.end() && cur.peek().isSymbol('{')) {
        cur.next();
        step.styles = parseBlockBody(cur, extra).filter(n => n.type === 'rule');
    } else if (!cur.end() && !cur.peek().isSymbol('}')) {
        cur.next();
    }
    return step;
}

function skipTag(cur) {
    while (!cur.end() && !cur.peek().isSymbol('>')) {
        cur.next();
    }
    cur.next();
}

function parseSource(input, extra, ctx) {
    let source = String(input ?? '').trim();
    return parseBlockBody(new Cursor(source, ctx), extra, true);
}

export default function parse(input, extra) {
    let ctx = { position: 0, warnings: [], selectors: ['&'], using: [] };
    let result = parseSource(input, extra, ctx);
    result.warnings = ctx.warnings;
    return result;
}
