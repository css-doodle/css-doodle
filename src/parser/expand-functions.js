// `--name(params): body` definitions and `$name(args)` calls, expanded as text before parse-css.js reads it
import { textOf, itemsOf } from './tokenizer.js';
import { RE_NAME_TOKEN, tokenEnd, adjacent, nameLength, isNamePart, isNameStart, tokensOf } from './css-tokens.js';
import parsePattern from './parse-pattern.js';
import { armsOf, armIndex } from './parse-body.js';
import { hasEntries } from '../lib/type.js';
import { defaultContext } from '../core/calc.js';

function warn(ctx, msg, pos) {
    ctx.warnings.push(pos ? { message: msg, pos } : { message: msg });
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
        else if (t.isSymbol('}') && --depth <= 0) return depth ? i - 1 : i;
        else if (t.isSymbol(';') && !depth) return i;
    }
    return tokens.length - 1;
}

const RE_PARAM = /^[a-zA-Z_]\w*$/;
const RE_FUNC_NAME = /^[a-zA-Z_][\w-]*$/;

function nameEnd(tokens, i, dash) {
    for (let t; (t = tokens[i + 1]) && adjacent(tokens[i], t); i++) {
        let glued = t.isSymbol('-') ? dash && tokens[i + 2]?.isWord() && adjacent(t, tokens[i + 2]) : isNamePart(t);
        if (!glued) return t.isWord() && nameLength(t.value) ? i + 1 : i;
    }
    return i;
}

export default function expandFunctions(source, ctx, svg, chain = []) {
    let defs = ctx.defs = Object.create(ctx.defs ?? null);
    let tokens = /\)\s*:/.test(source) ? tokensOf(source) : [];
    let rest = '', from = 0;
    for (let i = 0, depth = 0; i < tokens.length; i++) {
        let t = tokens[i], prev = tokens[i - 1];
        if (t.status === 'open') i = quoteEnd(tokens, i);
        else if (t.isSymbol('(') || !svg && t.isSymbol('{')) depth++;
        else if (t.isSymbol(')') || !svg && t.isSymbol('}')) depth--;
        else if (!depth && t.isSymbol('-') && (!prev || prev.isSymbol(';', '{', '}'))) {
            let dash = tokens[i + 1], word = tokens[i + 2];
            if (!dash?.isSymbol('-') || !isNameStart(word) || !adjacent(t, dash) || !adjacent(dash, word)) {
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
                    warn(ctx, `invalid --${name}() params`, t.pos);
                }
                let body = braced ? source.slice(tokens[open].index + 1, last.index)
                    : source.slice(tokens[open].index, last.isSymbol(';') ? last.index : tokenEnd(last));
                defs[name] = { params, defaults, body: body.trim() };
                let after = source.slice(tokenEnd(last), tokenEnd(tokens[statementEnd(tokens, end + 1)] ?? last)).replace(/\/\*[\s\S]*?\*\//g, '');
                let unset = params.filter(p => !source.includes(`--${p}:`));
                if (!braced && !/^\s*--[\w-]+\(/.test(after) && bindParams({ params: unset, defaults, body: after }, unset.map(() => '\0'), defs).includes('\0')) {
                    warn(ctx, `--${name}() needs {}`, t.pos);
                }
                rest += source.slice(from, t.index) + source.slice(t.index, tokenEnd(last)).replace(/[^\n]/g, ' ');
                from = tokenEnd(last);
                i = end;
            }
        }
    }
    let text = rest + source.slice(from);
    if (!hasEntries(defs) && !(tokens.length && /@svg\(/i.test(text))) return source;
    return expandCalls(text, defs, ctx, chain);
}

const MAX_EXPANSION = 1e6;

const CSS = 0, BODY = 1, EXPR = 2;
const INCLUDE = 1, VALUE = 2, EXPRESSION = 3;
const RE_PAINT_HEAD = /^(pattern|scene)[\dxX.]*$/;
const RE_TEXTURE_HEAD = /^texture\w*$/;
const RE_REPEAT_HEAD = /^repeat\s*\(/;
const RE_NESTED_DOODLE = /@(doodle|pattern|scene|shaders)/;
const RE_VARYING = /@(r|ri|R|rn|rand|random|p|pick|P|pn|pnr|pl|pr|pd|lp|lr)(?![\w-])/;
const RE_COUNTER = /@(n|nx|ny|N|nN|Nn|nd)(?![\w-])/;
const RE_LOOP = /@(m|M|rep|repeat)\d*\(|\{(?<=\w\*[^{};]*\{)|\brepeat\s*\(/;
const RE_LINE_COMMENT = /\/\/[^\n]*/g;
const RE_SIMPLE_ARG = /^(#[\da-f]+|[a-z_][\w.]*|(\d+(?:\.\d*)?|\.\d+)(e[+-]?\d+)?)$/i;

function paintBodyAt(tokens, i) {
    let t = tokens[i], j = i + 1;
    if (!t.isSymbol('@') || !tokens[j] || !adjacent(t, tokens[j])) return -1;
    while (tokens[j + 1] && adjacent(tokens[j], tokens[j + 1]) && !tokens[j + 1].isSymbol('(')) j++;
    let head = textOf(tokens.slice(i + 1, j + 1));
    return (RE_PAINT_HEAD.test(head) || /^svg$/i.test(head)) && tokens[j + 1]?.isSymbol('(') && adjacent(tokens[j], tokens[j + 1]) ? j + 1 : -1;
}

function expandCalls(text, defs, ctx, chain, mode = CSS, hoist, math) {
    let paint = mode !== CSS, tokens = tokensOf(text, paint);
    let out = '', from = 0, quote = false, maths = [];
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
            if (t.isSymbol('(')) maths.push(mathOpen(tokens, i, defs) || (maths.at(-1) ?? math));
            else if (t.isSymbol(')')) maths.pop();
            let open = paintBodyAt(tokens, i);
            if (open > 0) {
                let close = closing(tokens, open);
                if (close < 0) break;
                let inner = text.slice(tokenEnd(tokens[open]), tokens[close].index);
                let svg = /^svg$/i.test(tokens[i + 1].value);
                if (svg || inner.includes('$')) {
                    let scene = ctx.scene;
                    ctx.scene = tokens[i + 1].value === 'scene';
                    flush(tokenEnd(tokens[open]));
                    out += svg ? expandFunctions(inner, ctx, true, chain) : expandCalls(inner, defs, ctx, chain, BODY);
                    ctx.scene = scene;
                    ctx.defs = defs;
                    from = tokens[close].index;
                }
                i = close;
                continue;
            }
        } else if (mode === BODY) {
            depth += t.isSymbol('(') - t.isSymbol(')');
            if (!depth && t.isSymbol(';', '{', '}')) {
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
        let bare = !t.isSymbol('$', '@'), at = bare ? i : i + 1;
        if (!isNameStart(tokens[at]) || (bare ? paint || !(maths.at(-1) ?? math) : !adjacent(t, tokens[at]))) continue;
        let end = nameEnd(tokens, at, true);
        let name = textOf(tokens.slice(at, end + 1));
        if (bare && !defs[name]) name = textOf(tokens.slice(at, (end = nameEnd(tokens, at)) + 1));
        let builtin = t.isSymbol('@') || bare && (name in defaultContext || name === 'pick');
        let def = !builtin && defs[name];
        let paren = tokens[end + 1];
        if (!def || !paren?.isSymbol('(') || !adjacent(tokens[end], paren)) {
            i = end;
            continue;
        }
        let first = end + 2;
        end = closing(tokens, end + 1);
        if (end < 0) break;
        let inMath = !paint && (maths.at(-1) ?? math);
        let args = itemsOf(tokens.slice(first, end), true).map(item => !item.length ? '' : expandCalls(
            text.slice(item[0].index, tokenEnd(item.at(-1))).trim(), defs, ctx, chain, paint ? EXPR : CSS, pending, inMath));
        let given = args.length, { params, defaults } = def;
        while (given && !args[given - 1]) given--;
        let missing = params.filter((p, k) => k >= given && !defaults[k]);
        if (given > params.length) {
            warn(ctx, `$${name}() extra args`);
        } else if (missing.length) {
            warn(ctx, `$${name}() needs ${missing.join(',')}`);
        }
        let body = '';
        let kind = paint ? kindOf(def, defs) : INCLUDE;
        let lead = paint ? text.slice(head, t.index).trim() : '';
        let hoists = pending && !(blocks.at(-1) && !depth) && !RE_REPEAT_HEAD.test(lead);
        let next = solidAt(tokens, end + 1);
        if (chain.includes(name)) {
            warn(ctx, `recursive $${name}()`);
        } else if (ctx.expanded > MAX_EXPANSION) {
            if (ctx.expanded < Infinity) warn(ctx, 'expansion too large');
            ctx.expanded = Infinity;
        } else if (kind === VALUE) {
            if (!hoists) {
                warn(ctx, `$${name}() runs statements`);
            } else {
                let call = valueCall(name, def, args, defs, ctx, chain);
                let names = mode === BODY && (!next || next.isSymbol(';', '}')) && /^[\w.]+(\s*,\s*[\w.]+)+\s*:$/.test(lead) && lead.match(/[\w.]+/g);
                ctx.expanded += call.text.length;
                pending.push(call.text);
                body = call.ret;
                if (names) {
                    if (names.length > call.count) warn(ctx, `$${name}() gives ${call.count}`);
                    from = t.index;
                    body = names.slice(0, call.count).map((n, k) => `${n}: ${body}${k ? '_' + (k + 1) : ''}`).join('; ');
                }
            }
        } else {
            let value = paint ? null : resultOf(def.body);
            let source = value === null ? def : { ...def, body: value };
            let n = ctx.calls + 1, word = name.replace(/\W/g, '_'), loops = RE_LOOP.test(source.body);
            let bound = [], lets = [];
            params.forEach((p, k) => {
                let arg = args[k] || defaults[k] && bindParams({ params: params.slice(0, k), defaults: [], body: defaults[k] }, bound, defs, paint, !paint && 0);
                let id = !!arg && (RE_VARYING.test(arg) || loops && RE_COUNTER.test(arg))
                    && (paint ? hoists : !isStatements(arg) && !RE_NESTED_DOODLE.test(def.body))
                    && (paint ? `${word}_${n}_${p}` : `${n}${word}_${p}`);
                if (id) lets.push([id, arg.trim()]);
                bound.push(!id ? arg : paint ? id : `@--(${id})`);
            });
            body = bindParams(source, bound, defs, paint, inMath);
            if (lets.length) {
                ctx.calls++;
                if (paint) pending.push(lets.map(([id, arg]) => `${id}: ${arg};\n`).join(''));
            }
            ctx.expanded += body.length;
            body = expandCalls(body, defs, ctx, [...chain, name], !paint ? CSS : kind === INCLUDE ? BODY : EXPR, pending, inMath);
            if (!paint && lets.length) {
                let statements = !maths.length && isStatements(body);
                body = lets.map(([id, arg]) => statements ? `--${id}: ${arg}; ` : `@--(${id}, ${arg})`).join('') + body;
            }
            let whole = (!lead || /[:(,]$/.test(lead)) && (!next || next.isSymbol(';', '{', '}') || next.isSymbol(')', ','));
            let glued = /[\d.]/.test(from < t.index ? text[t.index - 1] : out.at(-1)) && /^[\d.]/.test(body.trim());
            if ((inMath || kind === EXPRESSION && !whole && (mode === EXPR || lead || blocks.at(-1))) && (glued || !RE_SIMPLE_ARG.test(body.trim()))) {
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

function isStatements(text) {
    let tokens = tokensOf(text);
    for (let i = 0, depth = 0; i < tokens.length; i++) {
        let t = tokens[i];
        if (t.status === 'open') i = quoteEnd(tokens, i);
        else if (t.isSymbol('(')) depth++;
        else if (t.isSymbol(')')) depth--;
        else if (!depth && t.isSymbol(';', '{', ':')) return true;
    }
    return false;
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
        if (start && !parens && t.value === 'result' && solidAt(tokens, i + 1)?.isSymbol(':')) {
            return def.kind = VALUE;
        }
        start = !parens && t.isSymbol(';', '{', '}');
        parens += t.isSymbol('(') - t.isSymbol(')');
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
    if (line[0]?.isSymbol('$') && isNameStart(line[1])) {
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
// names and its names made its own, results among them, which are its values
function valueCall(name, def, args, defs, ctx, chain) {
    let { params, defaults } = def;
    let ret = `${name.replace(/\W/g, '_')}_${++ctx.calls}`;
    let source = def.body.replace(RE_LINE_COMMENT, '').trim();
    source = expandCalls((/[;}]$/.test(source) ? source : source + ';') + '\n', defs, ctx, [...chain, name], BODY);
    let { text, targets, count } = renameLocals(source, ret);
    let bound = [], prelude = '';
    params.forEach((param, k) => {
        let arg = (args[k] || defaults[k] && bindParams({ params: params.slice(0, k), defaults: [], body: defaults[k] }, bound, defs, true) || '').trim();
        if (targets.has(param)) warn(ctx, `read-only $${param}`);
        if (!arg || !targets.has(param) && RE_SIMPLE_ARG.test(arg)) {
            bound.push(arg);
        } else {
            prelude += `${ret}_${param}: ${arg};\n`;
            bound.push(`${ret}_${param}`);
        }
    });
    text = expandCalls(prelude, defs, ctx, [...chain, name], BODY) + bindParams({ params, defaults: [], body: text }, bound, defs, true);
    if (ctx.scene && text.includes('{')) {
        let known = new Set(), blocks = 0;
        let lower = (rules, when) => rules.map(({ type, name, value, args, arms }) => {
            if (type == 'block' && name == 'match') {
                let id = `${ret}_${++blocks}`;
                arms = armsOf(arms, message => warn(ctx, message));
                return `${id}: ${armIndex(arms)};\n`
                    + arms.map((a, k) => lower(a.value, `${when && when + ' && '}${id} == ${k + 1}`)).join('');
            }
            if (type != 'statement') return type == 'text' ? value + ';\n' : `${name}${args?.length ? `(${args})` : ''} {}\n`;
            if (when && known.has(name)) return `${name}: match(${when}, ${value}, ${name});\n`;
            known.add(name);
            return `${name}: ${value};\n`;
        }).join('');
        let out = lower(parsePattern(text), '');
        if (blocks) text = out;
    }
    return { text, ret: ret + '_result', count };
}

// Rename the names a body assigns, and the loop names of its repeats, to
// prefix_name: in a value function every assignment is its own, even to
// fill or d. A name reads the caller's variable until its first assignment
// ends; the names assigned as `$p:` are collected in targets. Each item of
// `result: a, b` is a result of its own: prefix_result, prefix_result_2, …
function renameLocals(text, prefix) {
    let tokens = tokensOf(text, true);
    let declared = new Set(), waiting = [], targets = new Set();
    let out = '', from = 0, depth = 0, atStart = true, quote = false, prev = null, item = 0, count = 1;
    let named = t => t.isWord() && t.value[0] !== '.' || t.isSymbol('_');
    for (let i = 0; i < tokens.length; i++) {
        let t = tokens[i], before = prev;
        if (t.status) {
            quote = t.status === 'open';
            atStart = false;
            continue;
        }
        if (quote || t.isSpace()) continue;
        prev = t;
        depth += t.isSymbol('(') - t.isSymbol(')');
        if (!depth && t.isSymbol(';', '{', '}')) {
            waiting.forEach(n => declared.add(n));
            waiting = [];
            atStart = true;
            item = 0;
            continue;
        }
        if (item && !depth && t.isSymbol(',')) {
            out += text.slice(from, t.index) + `; ${prefix}_result_${++item}:`;
            from = tokenEnd(t);
            if (item > count) count = item;
            continue;
        }
        if (t.isSymbol('$', '@') && tokens[i + 1] && adjacent(t, tokens[i + 1])) {
            let end = nameEnd(tokens, i + 1);
            if (t.isSymbol('$') && atStart && !depth && solidAt(tokens, end + 1)?.isSymbol(':')) {
                targets.add(textOf(tokens.slice(i + 1, end + 1)));
            }
            i = end;
        } else if (t.isWord() && t.value[0] === '#') {
            i = hexEnd(tokens, i);
        } else if (named(t)) {
            // digits and underscores glue on; a dot starts a swizzle
            let end = i;
            while (!tokens[end].value.includes('.') && tokens[end + 1] && adjacent(tokens[end], tokens[end + 1])
                    && (tokens[end + 1].isNumber() || named(tokens[end + 1]))) {
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
            if (target && whole === 'result') item = 1;
            if (loop) declared.add(local);
            if (!call && (target || loop || declared.has(local))) {
                let copy = target && dot > 0 && !declared.has(local) ? `${prefix}_${local}: ${local}; ` : '';
                out += text.slice(from, t.index) + copy + `${prefix}_${local}`;
                from = t.index + local.length;
            }
            prev = tokens[end];
            i = end;
        }
        atStart = false;
    }
    return { text: out + text.slice(from), targets, count };
}

function inWord(tokens, i, end) {
    let a = tokens[i - 2], b = tokens[i - 1], c = tokens[end + 1], d = tokens[end + 2];
    return !!(b?.isNumber() && adjacent(b, tokens[i])
        || b?.isSymbol('-') && a && adjacent(a, b) && adjacent(b, tokens[i]) && (a.isWord() || a.isSymbol('-'))
        || c?.isSymbol('-') && d?.isWord() && adjacent(tokens[end], c) && adjacent(c, d));
}

function mathOpen(tokens, i, defs) {
    let j = i - 1;
    while (j >= 0 && RE_NAME_TOKEN.test(tokens[j].value) && adjacent(tokens[j], tokens[j + 1])) j--;
    if (!tokens[j] || !adjacent(tokens[j], tokens[j + 1])) return false;
    let name = textOf(tokens.slice(j + 1, i));
    if (tokens[j].isSymbol('$')) return defs[name] ? 0 : true;
    if (tokens[j].isSymbol('@') && RE_PAINT_HEAD.test(name)) return null;
    if (!tokens[j].isSymbol('@') || name !== 'match') return false;
    let close = closing(tokens, i);
    return close > 0 && !!solidAt(tokens, close + 1)?.isSymbol('{');
}

function bindParams({ params, defaults, body }, args, defs, paint, math) {
    let tokens = tokensOf(body, paint);
    let out = '', from = 0, quote = false;
    let parens = math || math === 0 ? [math] : [], blocks = [], head = 0;
    for (let i = 0; i < tokens.length; i++) {
        let t = tokens[i], prev = tokens[i - 1];
        if (t.status) quote = t.status === 'open';
        if (t.isSymbol('(')) {
            let up = parens.at(-1), m = mathOpen(tokens, i, defs);
            parens.push(m === true || up === true ? true : m === null || up === null ? null : m === 0 || up === 0 && prev?.value !== 'url' ? 0 : false);
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
        if (!isNameStart(t)) continue;
        let dollar = prev?.isSymbol('$') && adjacent(prev, t);
        let end = nameEnd(tokens, i, dollar);
        let name = textOf(tokens.slice(i, end + 1));
        let dot = name.indexOf('.');
        let k = params.indexOf(dot > 0 ? name.slice(0, dot) : name);
        let last = tokens[end], next = tokens[end + 1];
        let ahead = tokens[dollar ? i - 2 : i - 1], first = i;
        i = end;
        if (k < 0) continue;
        let arg = args[k] || defaults[k];
        let start = t.index;
        let call = next?.isSymbol('(') && adjacent(last, next);
        if (dollar && call && defs[name]) continue;
        let wrap = parens.at(-1) && !call;
        let one = paint && !!arg && (!RE_SIMPLE_ARG.test(arg.trim())
            || /^[\d.]/.test(arg.trim()) && ahead?.isNumber() && adjacent(ahead, dollar ? prev : t));
        let lead = body.slice(head, dollar ? prev.index : t.index);
        let assigned = !parens.length && !lead.trim() && solidAt(tokens, end + 1)?.isSymbol(':');
        if (dollar) {
            start = prev.index;
            wrap ||= one && !assigned;
        } else if (prev?.isSymbol('@') && adjacent(prev, t)) {
            continue;
        } else if (!paint && parens.at(-1) === 0) {
            if (call || quote || solidAt(tokens, end + 1)?.isSymbol(':') || inWord(tokens, first, end)) continue;
        } else if (!wrap) {
            if (!paint || call || blocks.includes(true) || /\sas\s+$/.test(lead) || assigned) continue;
            wrap = one;
        }
        let list = !paint && parens.at(-1) !== 0 && /^\s*\(.*,.*\)\s*$/s.test(arg) && tokensOf(arg.trim());
        if (list && closing(list, 0) === list.length - 1 && itemsOf(list.slice(1, -1)).length > 1) arg = arg.trim().slice(1, -1);
        else if (wrap) arg = '(' + arg + ')';
        out += body.slice(from, start) + arg;
        from = dot > 0 ? t.index + dot : tokenEnd(last);
    }
    return out + body.slice(from);
}
