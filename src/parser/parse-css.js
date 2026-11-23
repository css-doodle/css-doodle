// AST:
//   rule       { type: 'rule', property, value: Group[] } + rawValue(); Group[] carries hasFunc
//   at-rule    { type: 'at-rule', property: '', value: string }  a statement: @import ...;
//   pseudo     { type: 'pseudo', selector, selectors, styles }  selectors resolved, '&' is the cell
//   cond       { type: 'cond', name, segments, position, styles, alts } + raw(); segments { keyword } | { arguments }, spaced;
//              alts [{ name, segments, pseudo, styles? }], more than one in a cell selector list
//   keyframes  { type: 'keyframes', name, steps: [{ type: 'step', name: Group[], styles }] }
//   func       { type: 'func', name, arguments: [{ values, cluster }], position, index, size? }
//   text       { type: 'text', value }
//   var        { type: 'var', name }  a `--name` leading an argument, bare or wrapped
// The list carries warnings: [{ message, pos? }], pos a token [col, row]
import { textOf, Token } from './tokenizer.js';
import { RE_NAME_TOKEN, tokenEnd, adjacent, isNamePart, isNameStart, tokensOf } from './css-tokens.js';
import expandFunctions from './expand-functions.js';
import parseVar from './parse-var.js';
import parseSvg from './parse-svg.js';
import svgSourceOf from './svg-source.js';
import { isSpecialSelector } from '../lib/selector.js';

const PI = String(Math.PI);
const RE_KEYED = /^@(p|pick|r|ri|rand|random)$/;
const RE_FUNC_START = /[0-9a-zA-Z_\-(%]/;
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
        return this.peek()?.index ?? this.source.length;
    }
    position() {
        return ++this.ctx.position;
    }
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

function substitutePi(source, from, to = from + 1) {
    return source.slice(from, to).replace(/π/g, (c, i) => /\w/.test(source[from + i - 1]) || /\d/.test(source[from + i + 1]) ? c : PI);
}

function separateFuncName(name, whole) {
    if (whole || (/\D$/.test(name) && !/\d[x-]\d/.test(name)) || Math[name.slice(1)]) {
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
const ARMS = /(^|[;{}])\s*match\s*$/;

function repeat(count, values) {
    return { type: 'func', name: '@M', arguments: [Node.argument([Node.text(count)]), Node.argument(values)] };
}

// index of the first top-level terminator ahead, -1 if none
function probe(cur, a, b, c) {
    let paren = 0, quote = false;
    for (let i = cur.i; i < cur.tokens.length; ++i) {
        let t = cur.tokens[i];
        if (t.status) quote = t.status === 'open';
        if (!quote && t.isSymbol('(')) paren++;
        else if (!quote && t.isSymbol(')')) paren = Math.max(0, paren - 1);
        else if (!paren && !quote && t.isSymbol(a, b, c)) {
            return i;
        }
    }
    return -1;
}

function atRuleName(cur) {
    let name = '@';
    for (let i = 1, t; (t = cur.peek(i)) && adjacent(cur.peek(i - 1), t) && /^[\w-]+$/.test(t.value); ++i) {
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
            if (!quote && ((v === '}' && !brace) || v === breakOn || ((v === ';' || (v === '<' && isTagStart(cur))) && !paren))) {
                break;
            }
            if (v === ',' && !paren && !quote) {
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
            if (tok.status) quote = tok.status === 'open';
            else if (!quote) {
                if (v === '(') paren++;
                else if (v === ')') paren = Math.max(0, paren - 1);
                else if (v === '{' && paren && custom) brace++;
                else if (v === '}') brace--;
            }
            if (v === 'π' && !quote) v = substitutePi(cur.source, tok.index);
        }

        cur.next();
        buf += v;
    }

    flush();
    if (paren) {
        warn(cur.ctx, 'unclosed (', head?.pos);
    }
    if (quote) {
        warn(cur.ctx, 'unclosed quote', head?.pos);
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
    let func = finishFunc(cur, name, end, isCalc, tok.index);
    if (func.name[0] !== '$') return func;
    warn(cur.ctx, `unknown ${func.name}()`, tok.pos);
    return Node.text(func.name);
}

function finishFunc(cur, name, end, isCalc, index, shaped, body) {
    let func = { type: 'func', name: '', arguments: [], index };
    let hasArguments = false;

    let dot = findCompositionDot(name, cur, end);
    if (dot > 0) {
        let inner;
        if (dot < name.length - 1) {
            inner = finishFunc(cur, '@' + name.slice(dot + 1), end, false, index + dot + 1, readsShape(name), composable(name));
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
        if (paren?.index === end && paren.isSymbol('(')) {
            cur.next();
            if (body || composable(name)) {
                func.arguments = parseDoodleBody(cur, paren.index + 1, name);
            } else {
                let svg = /^@svg$/i.test(name), raw = name === '@raw';
                let closed = parseArguments(cur, shaped || readsShape(name), svg || raw, RE_KEYED.test(name));
                func.arguments = closed.args;
                if (raw) closed.args.forEach(arg => arg.cluster = true);
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
        func.name = suffix && hasArguments ? '$' + suffix : '@$';
        if (suffix && !hasArguments) func.arguments.push(Node.argument([Node.text(suffix)]));
    } else {
        let { fname, extra: extraArgs } = separateFuncName(name, body);
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

// the first dot before a letter, or a last one right before the next @ or $
function findCompositionDot(name, cur, end) {
    let i = name.search(/\.([a-zA-Z]|$)/), t = cur.peek();
    return i < name.length - 1 || t?.index === end && t.isSymbol('@', '$') ? i : -1;
}

function readVarName(cur) {
    let dash = cur.peek(1);
    let head = cur.peek(2);
    if (!dash?.isSymbol('-') || !isNameStart(head) || !adjacent(cur.peek(), dash) || !adjacent(dash, head)) {
        return '';
    }
    let name = '--';
    let i = 2;
    for (let t; (t = cur.peek(i)) && adjacent(cur.peek(i - 1), t) && (t.isWord() || t.isNumber() || t.isSymbol('-', '_')); i++) {
        name += t.value;
    }
    cur.i += i;
    return name;
}

function declaresVar(cur) {
    let t = cur.peek();
    if (t?.isSpace()) t = cur.peek(1);
    return !!t?.isSymbol(':');
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
    let head = cur.peek();
    let blocks = [];

    const flush = atFunc => {
        let text = buf;
        buf = '';
        last = null;
        if (!text.length) return;
        if (!values.length) {
            text = atFunc ? text.trimStart() : text.trim();
            if (text.length) values.push(Node.text(text));
        } else if (atFunc || /\S/.test(text)) {
            values.push(Node.text(text));
        }
    };

    const pushArgument = () => {
        // ±x expands into -x and x: ±1, ±(a + 1), ±@r(10)
        let head = values[0];
        if (head?.type === 'text' && head.value.startsWith('±')) {
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
            if (v === '-' && !buf) {
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
                    let count = !blocks.at(-1)?.[2] && COPIES.exec(buf);
                    if (count) flush(true);
                    blocks.push([values.length, count?.[1], ARMS.test(buf)]);
                } else if (v === '}' && blocks.length) {
                    let [start, count] = blocks.pop();
                    if (count) {
                        flush(true);
                        let inner = values.splice(start);
                        if (inner.some(v => v.type === 'func')) inner = [Node.text('{'), repeat(count, [...inner, Node.text('}')])];
                        values.push(...inner);
                    }
                }
            }
            if (v === '(') {
                paren++;
            } else if (v === ')') {
                if (!paren) {
                    flush(false);
                    if (values.length || !args.length) pushArgument();
                    cur.next();
                    return { args, end: tok.index, at };
                }
                paren--;
            } else if (v === ',' && !paren && !whole && !blocks.length
                    || v === ':' && indexed && !paren && !at && !args.length) {
                at ||= v === ':';
                flush(false);
                pushArgument();
                cur.next();
                continue;
            }
        }
        if (tok.status) quote = tok.status === 'open';
        cur.next();
        buf += (v === 'π' && !quote) ? substitutePi(cur.source, tok.index) : v;
        last = tok;
    }
    warn(cur.ctx, 'unclosed (', head?.pos);
    return { args, end: cur.source.length };
}

function normalizeArgument(values) {
    for (let v of values) {
        if (v.type === 'text' && v.value.includes('`')) {
            v.value = v.value.replace(/`/g, '"');
        }
    }
    let cluster = false;
    let ft = values[0];
    let ed = values.at(-1);
    if (ft?.type === 'text' && ed.type === 'text') {
        let cf = ft.value[0];
        let ce = ed.value.at(-1);
        if (PAIRS[cf] === ce && (cf === '(' ? parensWrapWhole(values) : quotesWrapWhole(values, cf))) {
            ft.value = ft.value.slice(1);
            ed.value = ed.value.slice(0, -1);
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
            if (!depth && i !== str.length - 1) return false;
        }
    }
    return !depth;
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
        values.push(Node.text(substitutePi(cur.source, from, to)));
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
                let text = cur.source.slice(mark, tok.index);
                let count = !blocks.at(-1)?.[2] && COPIES.exec(text);
                blocks.push([values, count?.[1], ARMS.test(text)]);
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
        if (tok.status) {
            quote = tok.status === 'open';
        } else if (!quote && tok.isSymbol('(')) {
            paren++;
        } else if (!quote && tok.isSymbol(')')) {
            if (!paren) {
                end = tok.index;
                cur.next();
                break;
            }
            paren--;
        }
        cur.next();
    }
    if (end === cur.source.length) {
        warn(cur.ctx, 'unclosed (', head?.pos);
    }
    if (expand) {
        cut(end);
        while (blocks.length) values = blocks.pop()[0].concat(values);
        if (values.some(v => v.type === 'func')) return [Node.argument(values)];
    }
    let body = cur.source.slice(start, end);
    // a nested doodle is parsed again, and that parse leaves the π in quotes alone
    if (!name.startsWith('@doodle')) body = substitutePi(cur.source, start, end);
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

    if (tok?.isSymbol(':')) {
        rule.property = head;
        colon = tok.index;
        cur.next();
        rule.value = head === '@use' ? parseUse(cur) : parseValue(cur, null, head.startsWith('--'));
        end = cur.headIndex();
        if (cur.peek()?.isSymbol(';')) {
            cur.next();
        }
    } else if (tok?.isSymbol(';') && head.startsWith('@')) {
        cur.next();
        rule.type = 'at-rule';
        rule.value = head + ';';
    } else {
        // `color red;`, or a head that runs to the end: `@nth(1 { … }`
        if (tok?.isSymbol(';')) cur.next();
        warn(cur.ctx, tok || !/[("'`]/.test(head) ? 'missing :' : 'unbalanced paren/quote', pos);
    }

    rule.rawValue = () => colon < 0 ? '' : source.slice(colon + 1, end).trim();
    return rule;
}

function parseUse(cur) {
    let head = cur.peek();
    let pos = head?.pos;
    let ctx = cur.ctx;
    let extra = ctx.extra;
    let read = name => extra?.getVariable ? extra.getVariable(name) : '';
    let statements = [];
    for (let [node] of parseValue(cur)) {
        if (!node || node.type !== 'text') continue;
        if (/^[a-z][\w-]*$/i.test(node.value)) {
            ctx.addons.push(node.value);
            continue;
        }
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
                warn(ctx, 'recursive ' + name, pos);
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
        if (tok.isSymbol('/') && cur.peek(1)?.isSymbol('/')) {
            warn(cur.ctx, 'use /* */', tok.pos);
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
    let selector = cur.source.slice(start, cur.headIndex()).replace(/("[^"]*"|'[^']*')|\/\*[\s\S]*?\*\//g, (m, q) => q || ' ').trim();
    let open = cur.next(); // '{'

    let ctx = cur.ctx;
    let outer = ctx.selectors;
    let selectors = nestSelectors(selector, outer);
    // nested lists multiply: a block past this is dropped
    if (selectors.length > 1000 || selectors.some(s => s.length > 1e4)) {
        warn(ctx, 'selector too large', open.pos);
        selectors = [];
    }
    let call = selector.match(/:\s*(@[\w-]+)$/);
    if (call) {
        warn(ctx, `${call[1]} needs ()`, open.pos);
        selectors = [];
    }
    ctx.selectors = selectors;
    let styles = parseBlockBody(cur);
    ctx.selectors = outer;
    return { type: 'pseudo', selector, selectors, styles };
}

function nestSelectors(selector, parents) {
    let result = [];
    for (let s of splitSelectors(selector)) {
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
        } else if (c === ',' && !paren) {
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
    let ctx = cur.ctx, outer = ctx.selectors;
    let cond = { type: 'cond', ...parseCondSelector(cur, brace) };
    let first = cond.alts.find(a => a.pseudo);
    if (first) ctx.selectors = nestSelectors(first.pseudo, outer);
    cur.i = brace + 1;
    cond.styles = parseBlockBody(cur);
    ctx.selectors = outer;
    cond.alts.forEach(a => {
        if (a.pseudo) a.styles = [{ type: 'pseudo', selector: a.pseudo, selectors: nestSelectors(a.pseudo, outer), styles: cond.styles }];
    });
    let end = tokenEnd(cur.tokens[cur.i - 1]);
    cond.raw = () => source.slice(start, end);
    return cond;
}

const RE_CELL_SELECTOR = /^@(nth|at|row|col|depth|even|odd|random|match|cell|x|y|z)$/;

function parseCondSelector(cur, brace) {
    let name = '';
    let keyword = '';
    let spaced = false;
    let segments = [];
    let alts = [], from = -1, depth = 0;

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

    const end = at => {
        flush();
        alts.push({ name, segments, pseudo: from < 0 ? '' : cur.source.slice(from, at).trim() });
        name = '';
        segments = [];
        from = -1;
    };

    while (cur.i < brace) {
        let tok = cur.next();
        let cell = RE_CELL_SELECTOR.test(name || keyword);
        if (from >= 0 || cell && tok.isSymbol(':')) {
            if (from < 0) {
                flush();
                from = tok.index;
            }
            depth += tok.isSymbol('(') - tok.isSymbol(')');
            if (!depth && tok.isSymbol(',')) end(tok.index);
        } else if (cell && tok.isSymbol(',')) {
            end(tok.index);
        } else if (tok.isSymbol('(')) {
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
    end(cur.tokens[brace].index);
    return { name: alts[0].name, segments: alts[0].segments, alts, position: cur.position() };
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
        warn(cur.ctx, 'unnamed @keyframes', start.pos);
    }
    cur.i = brace + 1;

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
    if (cur.peek()?.isSymbol('{')) {
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
    let source = String(input ?? '');
    return parseBlockBody(new Cursor(source, ctx), true);
}

export default function parse(input, extra) {
    let ctx = { extra, position: 0, warnings: [], selectors: ['&'], using: [], expanded: 0, calls: 0, addons: [] };
    let result = parseSource(expandFunctions(String(input ?? ''), ctx), ctx);
    result.warnings = ctx.warnings;
    result.addons = ctx.addons;
    return result;
}
