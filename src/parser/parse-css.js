// AST:
//   rule       { type: 'rule', property, value: Group[] }
//              plus raw() and rawValue() reading the source span;
//              Group[] carries hasFunc (any func node in any group)
//   at-rule    { type: 'at-rule', property: '', value: string }
//              a statement like @import ...;
//   pseudo     { type: 'pseudo', selector, selectors: string[], styles }
//              any non-@ block; selector as written, selectors resolved
//              against the enclosing block with '&' standing for the cell
//   cond       { type: 'cond', name, segments, position, styles }
//              every other @name block, plus raw() reading its source;
//              segments are { keyword } | { arguments }, `spaced` when
//              whitespace preceded the segment
//   keyframes  { type: 'keyframes', name, steps }
//   step       { type: 'step', name: Group[], styles }
//   func       { type: 'func', name, arguments: Argument[], position,
//                index (source offset of the sigil),
//                variables? (when an argument list was consumed),
//                unit? ($px(...): the suffix, appended verbatim),
//                size? (@doodle100x50(...): the glued size of a composable) }
//   text       { type: 'text', value }
//   var        { type: 'var', name }
//              a `--name` leading the text of an argument
//
// The returned statement list carries `warnings`: [{ message, pos? }]
// collected from silent-recovery points; pos is a token [col, row]
import { scan, Token } from './tokenizer.js';
import parseVar from './parse-var.js';
import parseSvg from './parse-svg.js';
import generateSvgExtended from '../generator/svg-extended.js';
import { isSpecialSelector } from '../utils/selector.js';

const PI = String(Math.PI);
const RE_NAME_TOKEN = /^[0-9a-zA-Z_\-.%]+$/;
const RE_FUNC_START = /[0-9a-zA-Z_\-(%]/;
const RE_HOST_COMPOUND = /^:host(?:\(((?:[^()]|\((?:[^()]|\([^()]*\))*\))*)\))?((?:\.[\w-]+|\[[^\]]*\]|:(?!before\b|after\b|first-l)[\w-]+(?:\((?:[^()]|\([^()]*\))*\))?)+)/;

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

function warn(ctx, msg, pos) {
    let where = pos ? ` (at line ${pos[1] + 1}, column ${pos[0] + 1})` : '';
    console.warn(msg + where);
    if (ctx && ctx.warnings) {
        ctx.warnings.push(pos ? { message: msg, pos } : { message: msg });
    }
}

function getTextValue(input) {
    let text = input.trim();
    if (!text.length) return input;
    let n = +text;
    return Number.isNaN(n) ? text : n;
}

function isPairOf(c, n) {
    return ({ '"': '"', "'": "'", '(': ')' })[c] == n;
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
    func(name = '') {
        return { type: 'func', name, arguments: [] };
    },
    argument(values, cluster = false) {
        return { values, cluster };
    },
};

// index of the first top-level, unquoted terminator symbol ahead of the cursor
function probe(cur, ...terminators) {
    let paren = 0, quote = false;
    for (let i = cur.i; i < cur.tokens.length; ++i) {
        let t = cur.tokens[i];
        if (t.status === 'open') quote = true;
        else if (t.status === 'close') quote = false;
        if (!quote && t.isSymbol('(')) paren++;
        else if (!quote && t.isSymbol(')')) paren = Math.max(0, paren - 1);
        else if (paren === 0 && !quote && t.isSymbol(...terminators)) {
            return i;
        }
    }
    return -1;
}

function probeSelector(cur) {
    let i = probe(cur, '{', ';', '}');
    return i >= 0 && cur.tokens[i].isSymbol('{');
}

// the at-rule name glued to the '@' ahead: '@keyframes', '@font-face'
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

        if (splitDollar(cur)) {
            continue;
        }

        if (tok.isSymbol()) {
            if (!quote && (v === ';' || v === '}' || v === '<' || v === breakOn)) {
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
    groups.hasFunc = hasFunc;
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
        if (splitDollar(cur)) {
            t = cur.peek();
        }
        if (t.isSymbol('(') || !RE_NAME_TOKEN.test(t.value)) {
            break;
        }
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
        // everything after '$' is a unit suffix: $px(1+1) -> 2px, $4(1+1) -> 24;
        // without an argument list the suffix is the expression itself: $123 -> 123
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

// `--name` at the cursor: the tokens of a dashed ident glued together
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
    let lastRun = '';
    let paren = 0;
    let quote = false;
    let end = cur.source.length;
    let head = cur.peek();

    const flush = atFunc => {
        let text = buf;
        buf = '';
        last = null;
        lastRun = text;
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
        let v = tok.value;
        // whitespace the tokenizer swallowed, after ':' or ',' say, reads as a space
        if (!quote && last && !last.isSpace() && !tok.isSpace() && tok.index > tokenEnd(last)
                && /\s/.test(cur.source.slice(tokenEnd(last), tok.index))) {
            buf += ' ';
            last = null;
        }
        // functions fire inside quotes too, like everywhere else
        if (tok.isSymbol('@', '$')) {
            flush(true);
            values.push(parseFunc(cur, extra, variables));
            continue;
        }
        if (splitDollar(cur)) {
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
    // unterminated argument list: pending values are dropped like before
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
        // Only strip a surrounding pair when it actually wraps the whole argument
        let wraps = (cf === '(') ? parensWrapWhole(values) : quotesWrapWhole(values, cf);
        if (isPairOf(cf, ce) && wraps) {
            ft.value = ft.value.slice(1);
            ed.value = ed.value.slice(0, ed.value.length - 1);
            cluster = true;
        }
    }
    return Node.argument(values, cluster);
}

function textOf(values) {
    let str = '';
    for (let v of values) {
        if (v.type === 'text' && typeof v.value === 'string') str += v.value;
    }
    return str;
}

function parensWrapWhole(values) {
    let str = textOf(values);
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
    let str = textOf(values);
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
    for (let item of parsedSvg.value) {
        if (item.variable) {
            let rules = parseSource(`${item.name}: ${item.value}`, extra, cur.ctx);
            if (rules[0]) {
                variables[item.name] = rules[0].value;
            }
        }
    }
    if (hasTimesSyntax(parsedSvg)) {
        let svg = generateSvgExtended(parsedSvg) + ')';
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
                cur.next();
                if (buf.trim().length) {
                    rule.type = 'at-rule';
                    rule.value = buf + ';';
                    end = tok.index + 1;
                    break;
                }
                // an empty statement
                start = cur.headIndex();
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
            let statements = [];
            for (let p of parseVar(v.value)) {
                let rule = readVariable(extra, p.name);
                for (let n of p.fallback || []) {
                    if (rule) break;
                    rule = readVariable(extra, n.name);
                }
                try {
                    statements.push(...parseSource(rule, extra, ctx));
                } catch (e) {}
            }
            v.value = statements;
        }
        if (v.type === 'func' && v.arguments) {
            for (let arg of v.arguments) {
                evaluateValue(arg.values, extra, ctx);
            }
        }
    }
}

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
        if (level === 'top' && tok.isSymbol('<')) {
            skipTag(cur);
            continue;
        }
        let name = tok.isSymbol('@') ? atRuleName(cur) : '';
        if (name === '@keyframes') {
            styles.push(parseKeyframes(cur, extra));
        } else if (!probeSelector(cur)) {
            let rule = parseRule(cur, extra);
            if (rule.property === '@use') {
                styles.push(...rule.value);
            } else if (rule.property || (level === 'top' && rule.type === 'at-rule')) {
                styles.push(rule);
            }
        } else if (!name) {
            let pseudo = parsePseudo(cur, extra);
            if (pseudo.selector) styles.push(pseudo);
        } else {
            styles.push(parseCond(cur, extra));
        }
    }
    return styles;
}

function parsePseudo(cur, extra) {
    let pseudo = { type: 'pseudo', selector: '', selectors: [], styles: [] };
    let start = cur.headIndex();
    // the caller probed the '{'
    cur.i = probe(cur, '{');
    let selector = cur.source.slice(start, cur.headIndex()).trim();
    cur.next(); // '{'
    if (!selector) return pseudo;

    let ctx = cur.ctx;
    let outer = ctx.selectors;
    pseudo.selector = selector;
    pseudo.selectors = ctx.selectors = nestSelectors(splitSelectors(selector), outer);
    pseudo.styles = parseBlockBody(cur, extra, 'pseudo');
    ctx.selectors = outer;
    return pseudo;
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

function parseCond(cur, extra) {
    let cond = { type: 'cond', name: '', styles: [] };
    let source = cur.source;
    let start = cur.headIndex();
    Object.assign(cond, parseCondSelector(cur));
    if (!cur.end()) {
        cur.next(); // '{'
        cond.styles = parseBlockBody(cur, extra, 'cond');
    }
    let end = cur.tailEnd();
    cond.raw = () => source.slice(start, end);
    return cond;
}

function parseCondSelector(cur) {
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

    while (!cur.end()) {
        let tok = cur.peek();
        if (tok.isSymbol('(')) {
            flush();
            cur.next();
            let args = parseArguments(cur, undefined, {}).args;
            segments.push({ arguments: args, spaced });
            spaced = false;
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
            spaced = true;
            cur.next();
            continue;
        }
        keyword += tok.value;
        cur.next();
    }

    return { name, segments, position: cur.position() };
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
        warn(cur.ctx, 'missing keyframes name', start ? start.pos : undefined);
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
        let rule = parseRule(cur, extra);
        if (rule.property) step.styles.push(rule);
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
    return parseBlockBody(new Cursor(source, ctx), extra, 'top');
}

export default function parse(input, extra) {
    let ctx = { position: 0, warnings: [], selectors: ['&'] };
    let result = parseSource(input, extra, ctx);
    result.warnings = ctx.warnings;
    return result;
}
