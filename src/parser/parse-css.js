// AST:
//   rule       { type: 'rule', property, value: Group[] } + rawValue(); Group[] carries hasFunc
//   at-rule    { type: 'at-rule', property: '', value: string }  a statement: @import ...;
//   pseudo     { type: 'pseudo', selector, selectors, styles }  selectors resolved, '&' is the cell
//   cond       { type: 'cond', name, segments, position, styles } + raw(); segments { keyword } | { arguments }, spaced
//   keyframes  { type: 'keyframes', name, steps: [{ type: 'step', name: Group[], styles }] }
//   func       { type: 'func', name, arguments: [{ values, cluster }], position, index, unit?, size? }
//   text       { type: 'text', value }
//   var        { type: 'var', name }  a `--name` leading an argument, bare or wrapped
// The list carries warnings: [{ message, pos? }], pos a token [col, row]
import { scan, textOf, itemsOf, Token, NAME_CHAR } from './tokenizer.js';
import parseVar from './parse-var.js';
import parseSvg from './parse-svg.js';
import svgSourceOf from './svg-source.js';
import { isSpecialSelector } from '../lib/selector.js';
import { hasEntries } from '../lib/type.js';

const PI = String(Math.PI);
const RE_NAME_TOKEN = /^[0-9a-zA-Z_\-.%]+$/;
// @pick and @p, whose first argument may start with an index and a colon
const RE_PICK = /^@(p|pick)$/;
const RE_FUNC_START = /[0-9a-zA-Z_\-(%]/;
const RE_NAME = new RegExp(`^${NAME_CHAR}*`);
const RE_HOST_COMPOUND = /^:host(?:\(((?:[^()]|\((?:[^()]|\([^()]*\))*\))*)\))?((?:[.#][\w-]+|\[[^\]]*\]|:(?!before\b|after\b|first-l)[\w-]+(?:\((?:[^()]|\([^()]*\))*\))?)+)(?=$|[\s>+~,]|::|:(?:before|after|first-l))/;

class Cursor {
    constructor(source, ctx) {
        this.source = source;
        this.tokens = tokensOf(source);
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

const PAIRS = { '"': '"', "'": "'", '(': ')' };

function composable(name) {
    return /^@(shaders|doodle|pattern|scene)/.test(name);
}

function readsShape(name) {
    return /^@(shape|plot|tile|svg-polygon)\b/i.test(name);
}

function substitutePi(input, prev) {
    return input.replace(/π/g, (c, i) => {
        let p = i > 0 ? input[i - 1] : prev;
        return (p >= '0' && p <= '9') ? c : PI;
    });
}

function separateFuncName(name) {
    if ((/\D$/.test(name) && !/\d+[x-]\d+/.test(name)) || Math[name.slice(1)]) {
        return { fname: name, extra: '' };
    }
    let [, fname, extra] = /^(.*?)((?:[\d.]|(?<=\d)[x-](?=\d))*)$/.exec(name);
    return { fname, extra };
}

const Node = {
    text(value) {
        return { type: 'text', value };
    },
    var(name) {
        return { type: 'var', name };
    },
    argument(values, cluster = false) {
        return { values, cluster };
    },
};

const COPIES = /\*\s*([1-9]\d*(?:x[1-9]\d*)?)\s*$/;

function repeat(count, values) {
    return { type: 'func', name: '@M', arguments: [Node.argument([Node.text(count)]), Node.argument(values)] };
}

// index of the first top-level terminator ahead, -1 if none
function probe(cur, a, b, c) {
    let paren = 0, quote = false;
    for (let i = cur.i; i < cur.tokens.length; ++i) {
        let t = cur.tokens[i];
        if (t.status === 'open') quote = true;
        else if (t.status === 'close') quote = false;
        if (!quote && t.isSymbol('(')) paren++;
        else if (!quote && t.isSymbol(')')) paren = Math.max(0, paren - 1);
        else if (paren === 0 && !quote && t.isSymbol(a, b, c)) {
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

function parseValue(cur, breakOn, custom) {
    let head = cur.peek();
    let groups = [[]];
    let group = groups[0];
    let buf = '';
    let skip = true;
    let paren = 0;
    let brace = 0;
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
            if (!quote && ((v === '}' && !brace) || v === breakOn || ((v === ';' || (v === '<' && isTagStart(cur))) && paren === 0))) {
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
                group.push(parseFunc(cur));
                hasFunc = true;
                continue;
            }
            if (tok.status === 'open') quote = true;
            else if (tok.status === 'close') quote = false;
            else if (!quote) {
                if (v === '(') paren++;
                else if (v === ')') paren = Math.max(0, paren - 1);
                else if (v === '{' && paren && custom) brace++;
                else if (v === '}') brace--;
            }
            cur.next();
            buf += (v === 'π' && !quote) ? substitutePi(v, cur.source[tok.index - 1]) : v;
            continue;
        }

        cur.next();
        buf += v;
    }

    flush();
    if (paren > 0) {
        warn(cur.ctx, 'unclosed (', head && head.pos);
    }
    if (quote) {
        warn(cur.ctx, 'unclosed quote', head && head.pos);
    }
    groups.hasFunc = hasFunc;
    return groups;
}

function isFuncStart(cur) {
    let tok = cur.peek();
    let next = cur.peek(1);
    if (!next || !adjacent(tok, next)) return false;
    return tok.isSymbol('$') ? isNamePart(next) || callFollows(cur, 1) : RE_FUNC_START.test(next.value[0]);
}

function nameLength(word) {
    return word.match(RE_NAME)[0].length;
}

function isNamePart(t) {
    return t.isNumber() || t.isSymbol('-', '_') || t.isWord() && nameLength(t.value) === t.value.length;
}

function callFollows(cur, i) {
    for (let t; (t = cur.peek(i)) && adjacent(cur.peek(i - 1), t); i++) {
        if (!RE_NAME_TOKEN.test(t.value)) {
            return t.isSymbol('(') || t.isSymbol('@', '$') && cur.peek(i - 1).value.endsWith('.');
        }
    }
    return false;
}

function isTagStart(cur) {
    let next = cur.peek(1);
    return !!(next && adjacent(cur.peek(), next) && /^[\/!a-zA-Z]/.test(next.value));
}

function splitDollars(tokens) {
    let result = [];
    let naming = false;
    for (let tok of tokens) {
        naming &&= adjacent(result.at(-1), tok) && (tok.isWord() || tok.isNumber() || tok.isSymbol('-', '_'));
        let { value, pos, index } = tok;
        if (!tok.isWord() || !naming && !value.includes('$')) {
            result.push(tok);
            continue;
        }
        while (value) {
            let k = 1, type = 'Symbol';
            if (value[0] === '$') {
                naming = true;
            } else {
                type = 'Word';
                k = naming ? nameLength(value) : 0;
                naming = k > 0;
                if (!k) k = value.includes('$') ? value.indexOf('$') : value.length;
            }
            result.push(new Token(type, value.slice(0, k), pos, index));
            value = value.slice(k);
            index += k;
        }
    }
    return result;
}

function parseFunc(cur) {
    let tok = cur.next(); // '@' or '$'
    let isCalc = tok.isSymbol('$');
    let bare = isCalc && !callFollows(cur, 0);
    let name = '@';
    let end = tok.index + 1;

    while (!cur.end()) {
        let t = cur.peek();
        if (t.index !== end || !(bare ? isNamePart(t) : RE_NAME_TOKEN.test(t.value))) break;
        name += t.value;
        end += t.value.length;
        cur.next();
    }
    let last = cur.peek(-1), dots = last.value.match(/\.*$/)[0].length;
    let next = cur.peek();
    if (!bare && dots && name.length - dots > 1 && !(next?.index === end && next.isSymbol('@', '$', '('))) {
        let keep = last.value.length - dots;
        cur.tokens.splice(--cur.i, 1, ...[
            new Token(last.type, last.value.slice(0, keep), last.pos, last.index),
            new Token('Symbol', last.value.slice(keep), last.pos, last.index + keep),
        ].filter(t => t.value));
        if (keep) cur.i++;
        name = name.slice(0, -dots);
        end -= dots;
    }
    return finishFunc(cur, name, end, isCalc, tok.index);
}

function finishFunc(cur, name, end, isCalc, index, shaped) {
    let func = { type: 'func', name: '', arguments: [] };
    func.index = index;
    let hasArguments = false;

    let dot = findCompositionDot(name, cur, end);
    if (dot > 0) {
        let inner;
        if (dot < name.length - 1) {
            inner = finishFunc(cur, '@' + name.slice(dot + 1), end, false, index + dot + 1, readsShape(name));
            inner.dotted = true;
        } else {
            inner = parseFunc(cur);
        }
        name = name.slice(0, dot);
        func.arguments = [Node.argument([inner])];
        hasArguments = true;
    }
    else {
        let paren = cur.peek();
        if (paren && paren.index === end && paren.isSymbol('(')) {
            cur.next();
            if (composable(name)) {
                func.arguments = parseDoodleBody(cur, paren.index + 1, name);
            } else {
                let svg = /^@svg$/i.test(name);
                let closed = parseArguments(cur, shaped || readsShape(name), svg, RE_PICK.test(name));
                func.arguments = closed.args;
                if (closed.at) func.at = true;
                if (svg) {
                    func.arguments = expandSvg(cur, cur.source.slice(paren.index + 1, closed.end), closed.args);
                }
            }
            hasArguments = true;
        }
    }

    if (isCalc) {
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

// `indexed` for @pick, where a colon in the first argument ends its index
function parseArguments(cur, copying, whole, indexed) {
    let args = [];
    let values = [];
    let buf = '';
    let last = null; // the token buf ends with
    let paren = 0;
    let quote = false;
    let at = false;
    let end = cur.source.length;
    let head = cur.peek();
    let blocks = [];

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
                values.push(Node.text(text.trim()));
            }
        } else if (atFunc || /\S/.test(text)) {
            values.push(Node.text(text));
        }
    };

    const pushArgument = () => {
        // ±x expands into -x and x: ±1, ±(a + 1), ±@r(10)
        let head = values[0];
        if (head && head.type === 'text' && head.value.startsWith('±')) {
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
            values.push(parseFunc(cur));
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
            if (copying) {
                if (v === '{') {
                    let count = COPIES.exec(buf);
                    if (count) flush(true);
                    blocks.push(count && [values.length, count[1]]);
                } else if (v === '}' && blocks.length) {
                    let block = blocks.pop();
                    if (block) {
                        flush(true);
                        let inner = values.splice(block[0]);
                        if (inner.some(v => v.type === 'func')) inner = [Node.text('{'), repeat(block[1], [...inner, Node.text('}')])];
                        values.push(...inner);
                    }
                }
            }
            if (v === '(') {
                paren++;
            } else if (v === ')') {
                if (paren === 0) {
                    flush(false);
                    if (values.length || !args.length) pushArgument();
                    end = tok.index;
                    cur.next();
                    return { args, end, at };
                }
                paren--;
            } else if (v === ',' && paren === 0 && !whole && !blocks.some(Boolean)
                    || v === ':' && indexed && paren === 0 && !at && !args.length) {
                at ||= v === ':';
                flush(false);
                pushArgument();
                cur.next();
                continue;
            }
        }
        if (tok.status === 'open') quote = true;
        else if (tok.status === 'close') quote = false;
        cur.next();
        buf += (v === 'π' && !quote) ? substitutePi(v, cur.source[tok.index - 1]) : v;
        last = tok;
    }
    warn(cur.ctx, 'unclosed (', head && head.pos);
    return { args, end };
}

function normalizeArgument(values) {
    for (let v of values) {
        if (v.type === 'text' && v.value.includes('`')) {
            v.value = v.value.replace(/`/g, '"');
        }
    }
    let cluster = false;
    let ft = values[0];
    let ed = values[values.length - 1];
    if (ft && ed && ft.type === 'text' && ed.type === 'text') {
        let cf = ft.value[0];
        let ce = ed.value[ed.value.length - 1];
        if (PAIRS[cf] === ce && (cf === '(' ? parensWrapWhole(values) : quotesWrapWhole(values, cf))) {
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
        if (v.type === 'text') str += v.value;
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

function parseDoodleBody(cur, start, name) {
    let expand = name.startsWith('@scene');
    let paren = 0;
    let quote = false;
    let end = cur.source.length;
    let head = cur.peek();
    let values = [], blocks = [], from = start, mark = start;
    const cut = to => {
        values.push(Node.text(substitutePi(cur.source.slice(from, to), cur.source[from - 1])));
        from = to;
    };
    while (!cur.end()) {
        let tok = cur.peek();
        if (expand && !quote) {
            if (tok.isSymbol('@')) {
                cut(tok.index);
                values.push(parseFunc(cur));
                from = tokenEnd(cur.tokens[cur.i - 1]);
                continue;
            }
            if (tok.isSymbol('{')) {
                cut(tok.index + 1);
                let count = COPIES.exec(cur.source.slice(mark, tok.index));
                blocks.push([values, count && count[1]]);
                values = [];
            } else if (tok.isSymbol('}') && blocks.length) {
                cut(tok.index);
                let [outer, count] = blocks.pop();
                if (count && values.some(v => v.type === 'func')) {
                    values = [repeat(count, [Node.text('{'), ...values, Node.text('}')])];
                }
                values = outer.concat(values);
            }
            if (tok.isSymbol('{', '}', ';')) mark = tok.index + 1;
        }
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
    if (end === cur.source.length) {
        warn(cur.ctx, 'unclosed (', head && head.pos);
    }
    if (expand) {
        cut(end);
        while (blocks.length) values = blocks.pop()[0].concat(values);
        if (values.some(v => v.type === 'func')) return [Node.argument(values)];
    }
    let body = cur.source.slice(start, end);
    // a nested doodle is parsed again, and that parse leaves the π in quotes alone
    if (!name.startsWith('@doodle')) body = substitutePi(body, cur.source[start - 1]);
    return [normalizeArgument([Node.text(body.trim() || body)])];
}

function expandSvg(cur, raw, args) {
    let parsedSvg = parseSvg(raw);
    function rewrites(block) {
        if (block.times || block.test !== undefined) return true;
        for (let item of block.value) {
            let child = item.type === 'block' ? item : item.value;
            if (item.variable || Array.isArray(child?.value) && rewrites(child)) return true;
        }
        return false;
    }
    if (rewrites(parsedSvg)) {
        let svg = svgSourceOf(parsedSvg) + ')';
        return parseArguments(new Cursor(svg, cur.ctx), false, true).args;
    }
    return args;
}

function parseRule(cur) {
    let rule = { type: 'rule', property: '', value: [] };
    let source = cur.source;
    let colon = -1;
    let end = source.length;
    let pos = cur.peek().pos;
    let stop = probe(cur, ':', ';', '}');
    if (stop < 0) stop = cur.tokens.length;
    let tok = cur.tokens[stop];
    let head = textOf(cur.tokens.slice(cur.i, stop)).trim();
    cur.i = stop;

    if (tok && tok.isSymbol(':')) {
        rule.property = head;
        colon = tok.index;
        cur.next();
        rule.value = head === '@use' ? parseUse(cur) : parseValue(cur, null, head.startsWith('--'));
        end = cur.headIndex();
        if (!cur.end() && cur.peek().isSymbol(';')) {
            cur.next();
        }
    } else if (tok && tok.isSymbol(';') && head.startsWith('@')) {
        cur.next();
        rule.type = 'at-rule';
        rule.value = head + ';';
    } else {
        // `color red;`, or a head that runs to the end: `@nth(1 { … }`
        if (tok && tok.isSymbol(';')) cur.next();
        let what = tok || !/[("'`]/.test(head) ? 'missing ":"' : 'unbalanced ( or quote';
        warn(cur.ctx, `${what} in "${head.slice(0, 40)}"`, pos);
    }

    rule.rawValue = colon < 0
        ? () => ''
        : () => source.slice(colon + 1, end).trim();
    return rule;
}

function parseUse(cur) {
    let head = cur.peek();
    let pos = head && head.pos;
    let ctx = cur.ctx;
    let extra = ctx.extra;
    let read = name => (extra && extra.getVariable) ? extra.getVariable(name) : '';
    let statements = [];
    for (let [node] of parseValue(cur)) {
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
            let defs = ctx.defs;
            try {
                statements.push(...parseSource(expandFunctions(rule, ctx), ctx));
            } catch (e) {}
            ctx.defs = defs;
            ctx.using.pop();
        }
    }
    return statements;
}

function parseBlockBody(cur, top) {
    let styles = [];
    let open = cur.peek(-1);
    while (!cur.end()) {
        let tok = cur.peek();
        if (tok.isSpace() || tok.isSymbol(';')) {
            cur.next();
            continue;
        }
        if (tok.isSymbol('}')) {
            cur.next();
            if (top) continue;
            return styles;
        }
        if (top && tok.isSymbol('<') && isTagStart(cur)) {
            skipTag(cur);
            continue;
        }
        let name = tok.isSymbol('@') ? atRuleName(cur) : '';
        let brace = probe(cur, '{', ';', '}');
        let opensBlock = brace >= 0 && cur.tokens[brace].isSymbol('{');
        if (!opensBlock) {
            let rule = parseRule(cur);
            if (rule.property === '@use') {
                styles.push(...rule.value);
            } else if (rule.property || (top && rule.type === 'at-rule')) {
                styles.push(rule);
            }
        } else if (name === '@keyframes') {
            let keyframes = parseKeyframes(cur, brace);
            if (keyframes.name) styles.push(keyframes);
        } else if (!name) {
            let pseudo = parsePseudo(cur, brace);
            if (pseudo.selector) styles.push(pseudo);
        } else {
            styles.push(parseCond(cur, brace));
        }
    }
    if (!top) {
        warn(cur.ctx, 'unclosed {', open.pos);
    }
    return styles;
}

function parsePseudo(cur, brace) {
    let start = cur.headIndex();
    cur.i = brace;
    let selector = cur.source.slice(start, cur.headIndex()).replace(/\/\*[\s\S]*?\*\//g, ' ').trim();
    let open = cur.next(); // '{'

    let ctx = cur.ctx;
    let outer = ctx.selectors;
    let selectors = nestSelectors(splitSelectors(selector), outer);
    // nested lists multiply: a block past this is dropped
    if (selectors.length > 1000 || selectors.some(s => s.length > 1e4)) {
        warn(ctx, 'selector too large', open.pos);
        selectors = [];
    }
    ctx.selectors = selectors;
    let styles = parseBlockBody(cur);
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

function parseCond(cur, brace) {
    let source = cur.source;
    let start = cur.headIndex();
    let cond = { type: 'cond', ...parseCondSelector(cur, brace) };
    cur.i = brace;
    cur.next(); // '{'
    cond.styles = parseBlockBody(cur);
    let end = tokenEnd(cur.tokens[cur.i - 1]);
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
            let args = parseArguments(cur).args;
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

function parseKeyframes(cur, brace) {
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
        if (cur.peek().isSymbol('}')) {
            cur.next();
            break;
        }
        keyframes.steps.push(parseStep(cur));
    }
    return keyframes;
}

function parseStep(cur) {
    let step = { type: 'step', name: parseValue(cur, '{'), styles: [] };
    // a '}' stays put so the keyframes loop closes the block
    if (!cur.end() && cur.peek().isSymbol('{')) {
        cur.next();
        step.styles = parseBlockBody(cur).filter(n => n.type === 'rule');
        return step;
    }
    if (step.name.hasFunc) step.styles = null;
    if (!cur.end() && !cur.peek().isSymbol('}')) cur.next();
    return step;
}

function skipTag(cur) {
    let head = cur.peek();
    while (!cur.end() && !cur.peek().isSymbol('>')) {
        cur.next();
    }
    if (cur.end()) {
        warn(cur.ctx, 'unclosed tag', head.pos);
    }
    cur.next();
}

function parseSource(input, ctx) {
    let source = String(input ?? '').trim();
    return parseBlockBody(new Cursor(source, ctx), true);
}

// `paint` for text inside a @pattern or @scene body, where // starts a comment
function tokensOf(text, paint = false) {
    let tokens = scan(text, { lineCommentsIn: /^(shaders|pattern|scene)/, ignoreInlineComment: paint });
    return text.includes('$') ? splitDollars(tokens) : tokens;
}

// index of the quote closing the one at tokens[i]
function quoteEnd(tokens, i) {
    while (++i < tokens.length && !tokens[i].status);
    return i;
}

// index of the bracket closing the one at tokens[i], -1 when unclosed
function closing(tokens, i) {
    let open = tokens[i].value;
    let close = open === '(' ? ')' : '}';
    for (let depth = 0; i < tokens.length; i++) {
        if (tokens[i].status === 'open') i = quoteEnd(tokens, i);
        else if (tokens[i].isSymbol(open)) depth++;
        else if (tokens[i].isSymbol(close) && !--depth) return i;
    }
    return -1;
}

// index of the last token of the statement at tokens[i]: its `;`, or the
// `}` closing its block
function statementEnd(tokens, i) {
    for (let depth = 0; i < tokens.length; i++) {
        let t = tokens[i];
        if (t.status === 'open') i = quoteEnd(tokens, i);
        else if (t.isSymbol('(', '{')) depth++;
        else if (t.isSymbol(')')) depth--;
        else if (t.isSymbol('}') && !--depth) return i;
        else if (t.isSymbol(';') && !depth) return i;
    }
    return tokens.length - 1;
}

const RE_PARAM = /^[a-zA-Z_]\w*$/;
const RE_FUNC_NAME = /^[a-zA-Z_][\w-]*$/;

function nameEnd(tokens, i, dash) {
    for (let t; (t = tokens[i + 1]) && adjacent(tokens[i], t); i++) {
        let glued = t.isSymbol('-') ? dash && tokens[i + 2]?.isWord() && adjacent(t, tokens[i + 2]) : isNamePart(t);
        if (!glued) break;
    }
    return i;
}

function expandFunctions(source, ctx) {
    let defs = ctx.defs = Object.create(ctx.defs ?? null);
    let tokens = /\)\s*:/.test(source) ? tokensOf(source) : [];
    let rest = '', from = 0;
    for (let i = 0, depth = 0; i < tokens.length; i++) {
        let t = tokens[i], prev = tokens[i - 1];
        if (t.status === 'open') i = quoteEnd(tokens, i);
        else if (t.isSymbol('(', '{')) depth++;
        else if (t.isSymbol(')', '}')) depth--;
        else if (!depth && t.isSymbol('-') && (!prev || prev.isSymbol(';', '}'))) {
            let dash = tokens[i + 1], word = tokens[i + 2];
            if (!dash?.isSymbol('-') || !word?.isWord() || !adjacent(t, dash) || !adjacent(dash, word)) {
                continue;
            }
            let paren = nameEnd(tokens, i + 2, true) + 1;
            let name = textOf(tokens.slice(i + 2, paren));
            if (!RE_FUNC_NAME.test(name) || !tokens[paren]?.isSymbol('(') || !adjacent(tokens[paren - 1], tokens[paren])) {
                continue;
            }
            let close = closing(tokens, paren);
            let colon = close + 1;
            while (tokens[colon]?.isSpace()) colon++;
            let open = colon + 1;
            if (close > 0 && tokens[colon]?.isSymbol(':') && tokens[open]) {
                let braced = tokens[open].isSymbol('{');
                let end = braced ? closing(tokens, open) : statementEnd(tokens, open);
                if (end < 0) break;
                let last = tokens[end];
                let params = [], defaults = [];
                for (let item of itemsOf(tokens.slice(paren + 1, close))) {
                    let at = item.findIndex(n => n.isSymbol('='));
                    if (at < 0) at = item.length;
                    params.push(textOf(item.slice(0, at)).trim());
                    defaults.push(textOf(item.slice(at + 1)).trim());
                }
                if (!params.every(p => RE_PARAM.test(p))) {
                    warn(ctx, `invalid parameters in --${name}()`, t.pos);
                }
                let body = braced ? source.slice(tokens[open].index + 1, last.index)
                    : source.slice(tokens[open].index, last.isSymbol(';') ? last.index : tokenEnd(last));
                defs[name] = { params, defaults, body: body.trim() };
                rest += source.slice(from, t.index);
                from = tokenEnd(last);
                i = end;
            }
        }
    }
    if (!hasEntries(defs)) return source;
    return expandCalls(rest + source.slice(from), defs, ctx, []);
}

const MAX_EXPANSION = 1e6;

// Calls expand as text, read in one of three places: CSS, the statements
// of a @pattern or @scene body, or an expression inside one. In the last
// two, arguments are values, and a function whose body assigns result,
// as in a CSS @function, runs its statements before the statement that
// calls it, with names of its own (grammar §2)
const CSS = 0, BODY = 1, EXPR = 2;
const INCLUDE = 'include', VALUE = 'value', EXPRESSION = 'expression';
const RE_PAINT_HEAD = /^(pattern|scene)[\dxX.]*$/;
const RE_TEXTURE_HEAD = /^texture\w*$/;
const RE_REPEAT_HEAD = /^repeat\s*\(/;
const RE_LINE_COMMENT = /\/\/[^\n]*/g;
// a name, a swizzle, an unsigned number or a hex color reads the same in parentheses or not
const RE_SIMPLE_ARG = /^(#[\da-f]+|[a-z_][\w.]*|(\d+\.?\d*|\.\d+)(e[+-]?\d+)?)$/i;

// the index of the `(` after `@pattern…` or `@scene` at tokens[i], or -1
function paintBodyAt(tokens, i) {
    let t = tokens[i], j = i + 1;
    if (!t.isSymbol('@') || !tokens[j] || !adjacent(t, tokens[j])) return -1;
    while (tokens[j + 1] && adjacent(tokens[j], tokens[j + 1]) && !tokens[j + 1].isSymbol('(')) j++;
    let head = textOf(tokens.slice(i + 1, j + 1));
    return RE_PAINT_HEAD.test(head) && tokens[j + 1]?.isSymbol('(') && adjacent(tokens[j], tokens[j + 1]) ? j + 1 : -1;
}

function expandCalls(text, defs, ctx, chain, mode = CSS, hoist) {
    let paint = mode !== CSS, tokens = tokensOf(text, paint);
    let out = '', from = 0, quote = false;
    let start = 0, head = 0, pending = mode === BODY ? [] : hoist, depth = 0, blocks = [];
    let flush = end => {
        out += text.slice(from, end);
        from = end;
    };
    for (let i = 0; i < tokens.length; i++) {
        let t = tokens[i];
        if (t.status) quote = t.status === 'open';
        if (quote) continue;
        if (mode === CSS) {
            let open = paintBodyAt(tokens, i);
            if (open > 0) {
                let close = closing(tokens, open);
                if (close < 0) break;
                let inner = text.slice(tokenEnd(tokens[open]), tokens[close].index);
                if (inner.includes('$')) {
                    flush(tokenEnd(tokens[open]));
                    out += expandCalls(inner, defs, ctx, chain, BODY);
                    from = tokens[close].index;
                }
                i = close;
                continue;
            }
        } else if (mode === BODY) {
            if (t.isSymbol('(')) depth++;
            else if (t.isSymbol(')')) depth--;
            else if (!depth && t.isSymbol(';', '{', '}')) {
                let lead = text.slice(head, t.index).trim();
                if (t.isSymbol('}')) blocks.pop();
                else if (t.isSymbol('{')) blocks.push(lead === 'match');
                // a texture holds a doodle, read as CSS
                if (t.isSymbol('{') && RE_TEXTURE_HEAD.test(lead)) {
                    let close = closing(tokens, i);
                    if (close < 0) break;
                    flush(tokenEnd(t));
                    out += expandCalls(text.slice(from, tokens[close].index), defs, ctx, chain, CSS);
                    from = tokens[close].index;
                    i = close - 1;
                    continue;
                }
                flush(tokenEnd(t));
                start = out.length;
                head = from;
                continue;
            }
        }
        if (!t.isSymbol('$') || !tokens[i + 1]?.isWord() || !adjacent(t, tokens[i + 1])) continue;
        let end = nameEnd(tokens, i + 1, true);
        let name = textOf(tokens.slice(i + 1, end + 1));
        let def = defs[name];
        let paren = tokens[end + 1];
        if (!def || !paren?.isSymbol('(') || !adjacent(tokens[end], paren)) continue;
        let first = end + 2;
        end = closing(tokens, end + 1);
        if (end < 0) break;
        let args = itemsOf(tokens.slice(first, end), true).map(item => !item.length ? '' : expandCalls(
            text.slice(item[0].index, tokenEnd(item[item.length - 1])).trim(), defs, ctx, chain, paint ? EXPR : CSS, pending));
        let given = args.length, { params, defaults } = def;
        while (given && !args[given - 1]) given--;
        let missing = params.filter((p, k) => k >= given && !defaults[k]);
        if (given > params.length) {
            warn(ctx, `$${name}(${params}): too many args`);
        } else if (missing.length) {
            warn(ctx, `$${name}() is missing ${missing.join(', ')}`);
        }
        let body = '';
        let kind = paint ? kindOf(def, defs) : INCLUDE;
        let lead = paint ? text.slice(head, t.index).trim() : '';
        if (chain.includes(name)) {
            warn(ctx, `$${name}() calls itself`);
        } else if (ctx.expanded > MAX_EXPANSION) {
            if (ctx.expanded < Infinity) warn(ctx, 'user functions expand too large');
            ctx.expanded = Infinity;
        } else if (kind === VALUE) {
            if (!pending || blocks.at(-1) && !depth || RE_REPEAT_HEAD.test(lead)) {
                warn(ctx, `$${name}() runs statements; use it as one`);
            } else {
                let call = valueCall(name, def, args, defs, ctx);
                ctx.expanded += call.text.length;
                pending.push(expandCalls(call.text, defs, ctx, [...chain, name], BODY));
                body = call.ret;
            }
        } else {
            let value = paint ? null : resultOf(def.body);
            body = bindParams(value === null ? def : { ...def, body: value }, args, defs, paint);
            ctx.expanded += body.length;
            body = expandCalls(body, defs, ctx, [...chain, name], !paint ? CSS : kind === INCLUDE ? BODY : EXPR, pending);
            let next = solidAt(tokens, end + 1);
            let whole = (!lead || /[:(,]$/.test(lead)) && (!next || next.isSymbol(';', '{', '}') || next.isSymbol(')', ','));
            if (kind === EXPRESSION && !whole && (mode === EXPR || lead || blocks.at(-1)) && !RE_SIMPLE_ARG.test(body.trim())) {
                body = `(${body.trim()})`;
            }
        }
        flush(t.index);
        if (mode === BODY && pending.length) {
            let before = pending.join('');
            out = out.slice(0, start) + before + out.slice(start);
            start += before.length;
            pending.length = 0;
        }
        out += body;
        from = tokenEnd(tokens[end]);
        i = end;
    }
    flush(text.length);
    return out;
}

// the last token of the color at tokens[i], whose hex digits scan as
// words and numbers: #e0402a is #e 0402 a
function hexEnd(tokens, i) {
    while (tokens[i + 1] && adjacent(tokens[i], tokens[i + 1]) && /^[\da-f]+$/i.test(tokens[i + 1].value)) i++;
    return i;
}

// the token at j or the first after it that is not a space
function solidAt(tokens, j) {
    while (tokens[j]?.isSpace()) j++;
    return tokens[j];
}

// What a body gives: a value, when a statement assigns result, in a block
// too, the last assignment run being the value, as in a CSS @function; an
// expression, when it is one statement declaring nothing and not a call of
// a function that runs statements; else statements, run where it is called
function kindOf(def, defs) {
    if (def.kind) return def.kind;
    def.kind = INCLUDE;
    let tokens = tokensOf(def.body, true);
    let statements = 0, depth = 0, parens = 0, quote = false, start = true, declares = false;
    for (let i = 0; i < tokens.length; i++) {
        let t = tokens[i];
        if (t.status) quote = t.status === 'open';
        if (quote || t.isSpace()) continue;
        if (start && !parens && t.isWord() && t.value === 'result' && solidAt(tokens, i + 1)?.isSymbol(':')) {
            return def.kind = VALUE;
        }
        start = !parens && t.isSymbol(';', '{', '}');
        if (t.isSymbol('(')) parens++;
        else if (t.isSymbol(')')) parens--;
        if (t.isSymbol('(', '{')) depth++;
        else if (t.isSymbol(')')) depth--;
        else if (t.isSymbol('}') && !--depth) statements += 2;
        else if (t.isSymbol(';') && !depth) statements++;
        else if (t.isSymbol(':') && !depth) declares = true;
    }
    let line = tokens.filter(t => !t.isSpace());
    if (line.at(-1)?.isSymbol(';')) line.pop();
    else if (line.length) statements++;
    if (statements !== 1 || declares) return def.kind;
    // a lone call reads as what that function gives
    if (line[0]?.isSymbol('$') && line[1]?.isWord()) {
        let end = nameEnd(line, 1, true);
        let callee = defs[textOf(line.slice(1, end + 1))];
        if (callee && line[end + 1]?.isSymbol('(') && closing(line, end + 1) === line.length - 1
                && kindOf(callee, defs) === INCLUDE) {
            return def.kind;
        }
    }
    return def.kind = EXPRESSION;
}

// In CSS a body made of result declarations alone reads as the last
// one's value, as a CSS @function does; null for any other body, so an
// @svg-filter element's attributes, result among them, still paste
function resultOf(body) {
    let tokens = tokensOf(body), value = null;
    for (let i = 0; i < tokens.length; i++) {
        if (tokens[i].isSpace()) continue;
        let colon = solidAt(tokens, i + 1);
        if (tokens[i].value !== 'result' || !colon?.isSymbol(':')) return null;
        let last = tokens[i = statementEnd(tokens, i)];
        value = body.slice(tokenEnd(colon), last.isSymbol(';') ? last.index : tokenEnd(last)).trim();
    }
    return value;
}

// The statements of one call of a value function: its arguments bound to
// names and its names made its own, result among them, which is its value
function valueCall(name, def, args, defs, ctx) {
    let { params, defaults } = def;
    let ret = `${name.replace(/\W/g, '_')}_${++ctx.calls}`;
    let source = def.body.replace(RE_LINE_COMMENT, '').trim();
    let { text, targets } = renameLocals((/[;}]$/.test(source) ? source : source + ';') + '\n', ret);
    let bound = [], prelude = '';
    params.forEach((param, k) => {
        let arg = (args[k] || defaults[k] || '').trim();
        // a parameter the body assigns writes the caller's variable
        if (!arg || targets.has(param) || RE_SIMPLE_ARG.test(arg)) {
            bound.push(arg);
        } else {
            prelude += `${ret}_${param}: ${arg};\n`;
            bound.push(`${ret}_${param}`);
        }
    });
    return { text: prelude + bindParams({ params, defaults: [], body: text }, bound, defs, true), ret: ret + '_result' };
}

// Rename the names a body assigns, and the loop names of its repeats, to
// prefix_name: in a value function every assignment is its own, even to
// fill or d. A name reads the caller's variable until its first assignment
// ends; `$p:` writes a parameter, collected in targets
function renameLocals(text, prefix) {
    let tokens = tokensOf(text, true);
    let declared = new Set(), waiting = [], targets = new Set();
    let out = '', from = 0, depth = 0, atStart = true, quote = false, prev = null;
    for (let i = 0; i < tokens.length; i++) {
        let t = tokens[i], before = prev;
        if (t.status) {
            quote = t.status === 'open';
            atStart = false;
            continue;
        }
        if (quote || t.isSpace()) continue;
        prev = t;
        if (t.isSymbol('(')) depth++;
        if (t.isSymbol(')')) depth--;
        if (!depth && t.isSymbol(';', '{', '}')) {
            waiting.forEach(n => declared.add(n));
            waiting = [];
            atStart = true;
            continue;
        }
        if (t.isSymbol('$', '@') && tokens[i + 1] && adjacent(t, tokens[i + 1])) {
            let end = nameEnd(tokens, i + 1);
            if (t.isSymbol('$') && atStart && !depth && solidAt(tokens, end + 1)?.isSymbol(':')) {
                targets.add(textOf(tokens.slice(i + 1, end + 1)));
            }
            atStart = false;
            i = end;
            continue;
        }
        if (t.isWord() && t.value[0] === '#') {
            i = hexEnd(tokens, i);
            atStart = false;
            continue;
        }
        let isName = t.isWord() && t.value[0] !== '.' || t.isSymbol('_');
        if (!isName) {
            atStart = false;
            continue;
        }
        // digits and underscores glue on; a dot starts a swizzle
        let end = i;
        while (!tokens[end].value.includes('.') && tokens[end + 1] && adjacent(tokens[end], tokens[end + 1])
                && (tokens[end + 1].isNumber() || tokens[end + 1].isSymbol('_') || tokens[end + 1].isWord() && tokens[end + 1].value[0] !== '.')) {
            end++;
        }
        let whole = textOf(tokens.slice(i, end + 1));
        let dot = whole.indexOf('.');
        let local = dot < 0 ? whole : whole.slice(0, dot);
        let after = tokens[end + 1];
        let target = atStart && !depth && solidAt(tokens, end + 1)?.isSymbol(':');
        let loop = before?.isWord() && before.value === 'as';
        let call = after?.isSymbol('(') && adjacent(tokens[end], after);
        if (target) waiting.push(local);
        if (loop) declared.add(local);
        if (!call && (target || loop || declared.has(local))) {
            out += text.slice(from, t.index) + `${prefix}_${local}`;
            from = t.index + local.length;
        }
        atStart = false;
        prev = tokens[end];
        i = end;
    }
    return { text: out + text.slice(from), targets };
}

function bindParams({ params, defaults, body }, args, defs, paint = false) {
    let tokens = tokensOf(body, paint);
    let out = '', from = 0;
    // per open paren, whether a bare parameter binds inside it; in @pattern
    // and @scene one binds anywhere but in the CSS of a texture block, as
    // the name a statement assigns or a repeat's loop name: per open block,
    // whether it is a texture, and where the statement read starts
    let parens = [], blocks = [], head = 0;
    for (let i = 0; i < tokens.length; i++) {
        let t = tokens[i], prev = tokens[i - 1];
        if (t.isSymbol('(')) {
            // $( or one with a unit, like $px( and $4(, but not a call's arguments
            let j = i - 1;
            while (j >= 0 && RE_NAME_TOKEN.test(tokens[j].value) && adjacent(tokens[j], tokens[j + 1])) j--;
            let calc = tokens[j]?.isSymbol('$') && adjacent(tokens[j], tokens[j + 1]);
            parens.push(calc ? !defs[textOf(tokens.slice(j + 1, i))] : !!parens.at(-1));
            continue;
        }
        if (t.isSymbol(')')) {
            parens.pop();
            continue;
        }
        if (paint && !parens.length && t.isSymbol(';', '{', '}')) {
            if (t.isSymbol('}')) blocks.pop();
            else if (t.isSymbol('{')) blocks.push(RE_TEXTURE_HEAD.test(body.slice(head, t.index).trim()));
            head = tokenEnd(t);
            continue;
        }
        if (t.isWord() && t.value[0] === '#') {
            i = hexEnd(tokens, i);
            continue;
        }
        if (!t.isWord() && !t.isSymbol('_')) continue;
        let end = nameEnd(tokens, i);
        let name = textOf(tokens.slice(i, end + 1));
        let dot = name.indexOf('.');
        let k = params.indexOf(dot > 0 ? name.slice(0, dot) : name);
        let last = tokens[end], next = tokens[end + 1];
        let dollar = prev?.isSymbol('$') && adjacent(prev, t);
        let ahead = tokens[dollar ? i - 2 : i - 1];
        i = end;
        if (k < 0) continue;
        let arg = args[k] || defaults[k];
        let start = t.index;
        let call = next?.isSymbol('(') && adjacent(last, next);
        if (dollar && call && defs[name]) continue;
        let wrap = parens.at(-1) && !call;
        let one = paint && !!arg && (!RE_SIMPLE_ARG.test(arg.trim())
            || /^[\d.]/.test(arg.trim()) && ahead?.isNumber() && adjacent(ahead, dollar ? prev : t));
        if (dollar) {
            start = prev.index;
            wrap ||= one;
        } else if (prev?.isSymbol('@') && adjacent(prev, t)) {
            continue;
        } else if (!wrap) {
            let lead = body.slice(head, t.index);
            if (!paint || call || blocks.includes(true) || /\sas\s+$/.test(lead)
                    || !parens.length && !lead.trim() && solidAt(tokens, end + 1)?.isSymbol(':')) {
                continue;
            }
            wrap = one;
        }
        if (wrap) arg = '(' + arg + ')';
        out += body.slice(from, start) + arg;
        from = dot > 0 ? t.index + dot : tokenEnd(last);
    }
    return out + body.slice(from);
}

export default function parse(input, extra) {
    let ctx = { extra, position: 0, warnings: [], selectors: ['&'], using: [], expanded: 0, calls: 0 };
    let result = parseSource(expandFunctions(String(input ?? ''), ctx), ctx);
    result.warnings = ctx.warnings;
    return result;
}
