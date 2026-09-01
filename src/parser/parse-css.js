// AST:
//   rule       { type: 'rule', property, value: Group[] }
//              plus raw() and rawValue() reading the source span;
//              Group[] carries hasFunc (any func node in any group)
//   at-rule    { type: 'at-rule', property: '', value: string }
//   pseudo     { type: 'pseudo', selector, selectors: string[], styles }
//   cond       { type: 'cond', name, segments, position, styles }
//   keyframes  { type: 'keyframes', name, steps }
//   step       { type: 'step', name: Group[], styles }
//   func       { type: 'func', name, arguments: Argument[], position,
//                index (source offset of the sigil),
//                variables? (when an argument list was consumed) }
//   text       { type: 'text', value }
//
// The returned statement list carries `warnings`: [{ message, pos? }]
// collected from silent-recovery points; pos is a token [col, row]
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

    if (isCalc) {
        // everything after '$' is a unit suffix: $px(1+1) -> 2px, $4(1+1) -> 24;
        // without an argument list the suffix is the expression itself: $123 -> 123
        func.name = '@$' + name.slice(1);
        if (!hasArguments && func.name.length > 2) {
            let value = func.name.substring(2);
            func.name = '@$';
            func.arguments.push(Node.argument([Node.text(value)]));
        }
    } else {
        let { fname, extra: extraArgs } = separateFuncName(name);
        func.name = fname;
        if (extraArgs.length) {
            func.arguments.unshift(Node.argument([Node.text(extraArgs)]));
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
    let head = cur.peek();

    const flushText = (to, atFunc) => {
        let text = substitutePi(cur.source.slice(runStart, to), cur.source[runStart - 1]);
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
                return { args, end };
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
        }
        // any other block opener is a nested cond; inside a pseudo the
        // generator drops it with a warning, which beats a rule swallowing
        // the '{' and leaving the output unbalanced
        if (probeSelector(cur)) {
            let nested = parseCond(cur, extra);
            if (nested.name.length) styles.push(nested);
            continue;
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
    let ctx = { position: 0, warnings: [] };
    let result = parseSource(input, extra, ctx);
    result.warnings = ctx.warnings;
    return result;
}
