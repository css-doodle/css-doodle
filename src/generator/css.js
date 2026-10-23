import Func, { MathFunc, pickAt, pickAtList } from '../core/function.js';
import calc, { defaultContext, deref, compileTemplate, toPlainNumber, isSignLeading, operand, useRandom, withUnit } from '../core/calc.js';
import Property, { placeShared } from '../core/property.js';
import Selector, { calcContext } from '../core/selector.js';
import parseValueGroup from '../parser/parse-value-group.js';
import { NAME_CHAR } from '../parser/tokenizer.js';

import createRandom from '../core/random.js';
import seedrandom from '../lib/seedrandom.js';
import { timePrefix, timeKeyframes, timeProperties } from '../core/uniforms.js';
import gridStyleRules from './grid-style.js';

import { cellId, isTreeGrid } from '../lib/cell.js';
import { placeholder, hasPlaceholder, placeholderId } from '../lib/placeholder.js';
import { tidyNumber } from '../lib/math.js';
import { isNil, getValue, removeQuotes, removeParens, hasEntries } from '../lib/type.js';
import { join, last, removeEmptyValues } from '../lib/list.js';
import { nextId } from '../lib/fn.js';
import {
    isHostSelector, isParentSelector, isSpecialSelector, isPseudoSelector, isGroupAtRule
} from '../lib/selector.js';


function hasShorthandSize(value) {
    let depth = 0;
    for (let c of String(value)) {
        if (c === '(') depth++;
        else if (c === ')') depth--;
        else if (c === '/' && !depth) return true;
    }
    return false;
}

const NO_SPACE = { noSpace: true };
const COMPOSABLE = new Set(['doodle', 'shaders', 'pattern', 'scene']);
const CELL = ['&'];
const SHARED_CELL = prefix => `:is(cell,${prefix}_)`;

const FAMILY = {
    __proto__: null,
    top: 'inset', right: 'inset', bottom: 'inset', left: 'inset',
    'line-height': 'font',
    align: 'place', justify: 'place',
    columns: 'column', white: 'text',
    'inline-size': 'width', 'block-size': 'height',
};

function familiesOf(text) {
    let families = new Set();
    for (let [, name] of text.matchAll(/(?:^|;)\s*([\w-]+)\s*:/g)) {
        if (name.startsWith('--')) {
            families.add(name);
            continue;
        }
        name = name.toLowerCase().replace(/^-\w+-/, '');
        let head = name.split('-')[0];
        families.add(head === 'all' ? '*' : name.endsWith('gap') ? 'gap' : (FAMILY[name] ?? FAMILY[head] ?? head));
    }
    return families;
}

const EMPTY_EXTRA = [];
const ARGUMENTS = Symbol();
const SHARED_EXTRA = Object.assign([], { shared: true });
const SCENE_EXTRA = [1, 1, 1, 1, 1, 1];

function pushInput(input, value, whole) {
    if (!whole && (typeof value === 'number' || typeof value === 'string')) {
        input.push(...parseValueGroup(value, NO_SPACE));
    } else if (!isNil(value)) {
        input.push(getValue(value));
    }
}

const SEQ_READERS = new Map([
    [Func.n, 0], [Func.nx, 1], [Func.ny, 2], [Func.N, 3],
]);

const UNIFORM_KEYS = {
    __proto__: null,
    t: 'time', T: 'time', ts: 'time', TS: 'time',
    ux: 'mousex', uy: 'mousey', uw: 'width', uh: 'height',
    udx: ['mousex', 'width'], udy: ['mousey', 'height'],
    shaders: 'mouse',
};

const RE_UNIT_HEAD = /^([a-z]+|%)/i;
const RE_PAINT_VAR = new RegExp(String.raw`//[^\n]*|/\*[\s\S]*?\*/|\$(${NAME_CHAR}+)`, 'g');
const RE_TEXTURE_OPEN = new RegExp(String.raw`\btexture\w*\s*\{(?!\s*\$${NAME_CHAR}+\s*\})`, 'g');

const compiledValues = new WeakMap();
const compiledFuncs = new WeakMap();
const compiledArguments = new WeakMap();

// value: list of text/func nodes → env => { value, extra, origin }
function compileValue(value) {
    let compiled = compiledValues.get(value);
    if (compiled === undefined) {
        let parts = value.map(v => v.type === 'func' ? compileFunc(v) : v.value);
        if (parts.every(part => typeof part === 'string')) {
            let constant = { value: parts.join(''), extra: '' };
            compiled = () => constant;
        } else {
            compiled = frame => {
                let output = '';
                let extra = '', origin;
                for (let i = 0; i < parts.length; i++) {
                    let part = parts[i];
                    if (typeof part !== 'string') {
                        let evaluated = part(frame, EMPTY_EXTRA, false);
                        if (evaluated.extra) extra = evaluated.extra;
                        if (evaluated.origin) origin = evaluated.origin;
                        part = evaluated.value;
                        // a unit glued to lowered math multiplies in: @calc(@t)deg
                        let next = parts[i + 1];
                        let unit = typeof next === 'string' && RE_UNIT_HEAD.exec(next);
                        if (unit) {
                            part = withUnit(part, unit[0]) + next.slice(unit[0].length);
                            i++;
                        }
                    }
                    output += part;
                }
                return { value: output, extra, origin };
            };
        }
        compiledValues.set(value, compiled);
    }
    return compiled;
}

function compileFunc(node) {
    let key = node;
    let compiled = compiledFuncs.get(key);
    if (compiled === undefined) {
        let fname = node.name.slice(1);
        let fn = node.at
            ? node.arguments.length == 2 || node.arguments.some(arg => arg.values.length == 1 && arg.values[0].value === '...') ? pickAtList : pickAt
            : Func[fname === '$' ? 'calc' : fname] || MathFunc[fname];
        let inner = node.arguments[0]?.values[0];
        let name = inner?.dotted && inner.name.slice(1);
        if (fn && name && Object.hasOwn(fn, name) && typeof fn[name] === 'function') {
            fn = fn[name];
            node = { ...inner, name: node.name };
        }
        if (fname === '--') {
            // @--(name, value) sets a variable, @--(name) reads it back as set
            let [name, ...value] = node.arguments.map(arg => compileArgument(arg, node));
            compiled = (frame, extra) => {
                let vars = frame.contextVariable;
                if (!name || !vars) return { value: '' };
                let id = name(frame, extra), key = '--' + id, argument = /^\d/.test(id);
                if (argument) vars = vars[ARGUMENTS] ??= {};
                if (value.length) {
                    vars[key] = value.map(arg => arg(frame, extra)).join(',');
                    return { value: '' };
                }
                if (argument && vars[key] === undefined) vars = frame.env.rules.scopedVars(frame.cell.uid);
                return { value: vars[key] ?? '' };
            };
        } else if (typeof fn !== 'function') {
            let literal = { value: node.name };
            compiled = frame => {
                if (node.arguments.length) {
                    frame.env.rules.warn(`unknown function ${node.name}()`, node);
                }
                return literal;
            };
        } else if (SEQ_READERS.has(fn) && !node.arguments.length) {
            let index = SEQ_READERS.get(fn);
            let read = frame => {
                let e = last(frame.env.extra);
                return (e && e.length) ? e[index] : node.name;
            };
            compiled = frame => ({ value: read(frame) });
            compiled.seqRead = read;
        } else {
            let composable = COMPOSABLE.has(fname);
            let args = node.arguments.map(arg => compileArgument(arg, node));
            let isDollar = fname === '$';
            let shared = fname === 'tile';
            let unit = node.unit || '';
            let uniformKeys = [].concat(UNIFORM_KEYS[fname] ?? []);
            let isMath = fn === MathFunc[fname];
            let calcTemplate = (isDollar || fname === 'calc') && args.length === 1 && args[0].calcTemplate;
            let collect = (frame, e) => {
                let input = [];
                for (let arg of args) {
                    if (arg.split) {
                        input.push(...arg.split);
                        continue;
                    }
                    if (isMath && arg.calcTemplate) {
                        let t = arg.calcTemplate;
                        let { context, values } = evalTemplateHoles(t, frame, e);
                        if (context) {
                            input.push(calc(t.template, context));
                        } else {
                            input.push(...spliceTemplateInput(t, values));
                        }
                        continue;
                    }
                    pushInput(input, arg(frame, e), arg.cluster || arg.composed);
                }
                return removeEmptyValues(input);
            };
            // all-literal argument lists are interpreted here, once
            let constantInput = !fn.lazy && args.every(arg => arg.constant) ? collect() : null;
            compiled = (frame, extra, inArgument) => {
                let { cell, env } = frame;
                let { rules } = env;
                for (let key of uniformKeys) {
                    rules.uniforms[key] = true;
                }
                if (composable) {
                    let composed = rules.composeComposable(fname, node, cell, env, frame.selector, frame.property);
                    return { value: composed ?? '' };
                }
                let e = shared ? SHARED_EXTRA : inArgument ? extra : EMPTY_EXTRA;
                let output;
                if (calcTemplate) {
                    let { context, values } = evalTemplateHoles(calcTemplate, frame, e);
                    if (!context) {
                        output = rules.callFunc(fn, frame, node.position, spliceTemplateInput(calcTemplate, values), fname, unit);
                    } else if (isDollar) {
                        if (hasEntries(rules.scopedVars(cell.uid)) || hasEntries(frame.contextVariable)) {
                            context = Object.assign(rules.calcContext(cell, frame.contextVariable), context);
                        }
                        output = withUnit(tidyNumber(calc(calcTemplate.template, context, 1)), unit);
                    } else {
                        output = rules.callFunc(fn, frame, node.position, [calcTemplate.template, context], fname);
                    }
                } else {
                    let input = constantInput ?? (fn.lazy ? args.map(arg => (...lazy) => arg(frame, lazy)) : collect(frame, e));
                    output = rules.callFunc(fn, frame, node.position, input, fname, unit);
                }
                return { value: getValue(output), extra: output?.extra, origin: output?.origin };
            };
        }
        compiledFuncs.set(key, compiled);
    }
    return compiled;
}

function compileArgument(argument, parent) {
    let compiled = compiledArguments.get(argument);
    if (compiled === undefined) {
        let { values } = argument;
        if (values.length === 1 && values[0].type === 'text') {
            let value = values[0].value;
            let type = typeof value;
            compiled = () => value;
            compiled.constant = true;
            if (!argument.cluster && (type === 'number' || type === 'string')) {
                compiled.split = parseValueGroup(value, NO_SPACE);
            }
        } else {
            let segments = [''];
            let holes = [];
            for (let v of values) {
                if (v.type === 'text') {
                    segments[segments.length - 1] += v.value;
                    continue;
                }
                segments.push('');
                if (v.type === 'func') {
                    let compiledFn = compileFunc(v);
                    holes.push(compiledFn.seqRead
                        || ((frame, extra) => compiledFn(frame, extra, true).value));
                } else {
                    holes.push((parent && parent.name === '@var')
                        ? () => v.name
                        : frame => frame.env.rules.readVar(v.name, frame.cell.uid, frame.contextVariable));
                }
            }
            if (values.length === 1) {
                let single = holes[0];
                compiled = (frame, extra) => {
                    frame.env.extra.push(extra);
                    let value = single(frame, extra);
                    frame.env.extra.pop();
                    return value;
                };
            } else {
                compiled = (frame, extra) => {
                    frame.env.extra.push(extra);
                    let value = segments[0];
                    for (let i = 0; i < holes.length; i++) {
                        let v = holes[i](frame, extra);
                        // match Array#join: nil renders as nothing
                        if (v != null) value += operand(v, segments[i + 1]);
                        value += segments[i + 1];
                    }
                    frame.env.extra.pop();
                    return value;
                };
                compiled.composed = true;
            }
            if (!argument.cluster) {
                let template = compileTemplate(segments);
                if (template !== null) {
                    compiled.calcTemplate = { ...template, segments, holes, singlePart: values.length === 1 };
                }
            }
        }
        compiled.cluster = argument.cluster;
        compiledArguments.set(argument, compiled);
    }
    return compiled;
}

const CELL_REF = Symbol();
const cellVars = Object.create(defaultContext);
for (let name of 'x y z X Y Z i I dx dy dr dc dm da db'.split(' ')) {
    Object.defineProperty(cellVars, name, {
        get() { return (this[CELL_REF].vars ??= calcContext(this[CELL_REF], {}))[name]; },
        set(value) { Object.defineProperty(this, name, { value, writable: true, enumerable: true, configurable: true }); }
    });
}
function cellContext(cell) {
    let context = Object.create(cellVars);
    context[CELL_REF] = cell;
    return context;
}

function evalTemplateHoles({ holes, names, signSensitive }, frame, extra) {
    let n = holes.length;
    let values = new Array(n);
    frame.env.extra.push(extra);
    for (let i = 0; i < n; i++) {
        values[i] = holes[i](frame, extra);
    }
    frame.env.extra.pop();
    let context = cellContext(frame.cell);
    for (let i = 0; i < n; i++) {
        let num = toPlainNumber(values[i]);
        if (num === null || (signSensitive[i] && isSignLeading(values[i]))) {
            return { values };
        }
        context[names[i]] = num;
    }
    return { context, values };
}

function spliceTemplateInput({ segments, singlePart }, values) {
    let input = [];
    if (singlePart) {
        pushInput(input, values[0], false);
    } else {
        let joined = segments[0];
        for (let i = 0; i < values.length; i++) {
            joined += operand(values[i], segments[i + 1]) + segments[i + 1];
        }
        input.push(joined);
    }
    return removeEmptyValues(input);
}

// @shape is a pure function of its value, the other @-properties read the grid or the cell
function isStaticRule({ property, value }) {
    return value?.hasFunc === false && property !== 'background-size' && !/^(@(?!shape$)|--|animation)/.test(property);
}

function ruleFlags(prop) {
    return {
        animation: /^animation(-[a-z]+)*$/.test(prop),
        transition: /^transition(-[a-z]+)*$/.test(prop),
        size: prop === 'width' || prop === 'height',
        bgImage: /^background(\-image)?$/.test(prop),
        var: prop.startsWith('--'),
        at: (prop.startsWith('@') && Property[prop.slice(1)]) ? prop.slice(1) : null,
        gridLike: /^grid/.test(prop),
    };
}

const RE_PLACE = /^@place(-cell)?$/;
const RE_TILE_READ = /^@(x|y|xy|k|r)$/;

function usesTile(nodes, read = false) {
    for (let node of nodes) {
        if (node.type !== 'func') continue;
        let dotted = node.arguments[0]?.values[0];
        if (node.name === '@tile' && read === !!(dotted?.dotted && RE_TILE_READ.test(dotted.name))) return true;
        for (let arg of node.arguments) {
            if (usesTile(arg.values, read)) return true;
        }
    }
    return false;
}

function tileFirst(tokens) {
    let holds = (t, read) => t.type === 'rule' ? t.value.some(v => usesTile(v, read)) : !!t.styles?.some(s => holds(s, read));
    let g = tokens.findIndex(t => holds(t)), wait = tokens.filter((t, i) => i < g && holds(t, true));
    if (!wait.length) return tokens;
    let list = tokens.filter(t => !wait.includes(t));
    list.splice(list.indexOf(tokens[g]) + 1, 0, ...wait);
    list.warnings = tokens.warnings;
    return list;
}

function defaultRule(property, text) {
    return { type: 'rule', property, value: [[{ type: 'text', value: text }]] };
}

function specialName(selector) {
    if (isParentSelector(selector)) {
        return selector.replace(':container', 'grid');
    }
    if (/^:host(?![(-])/.test(selector)) {
        return `${selector},${selector.replace(':host', '.host')}`;
    }
    return selector;
}

class Rules {

    constructor(tokens, instance) {
        this.instance = instance ? '-' + instance : '';
        this.tokens = tokens = tileFirst(tokens);
        this.root = { rules: new Map(), entries: new Map(), groups: new Map() };
        this.scope = this.root;
        this.rawRules = new Set();
        this.fonts = new Set();
        this.props = {};
        this.keyframes = new Map();
        this.grid = null;
        this.seed = null;
        this.cellPrefix = '#';
        this.isGapSet = false;
        this.uniforms = {};
        this.skips = new WeakSet();
        this.ruleMemo = new WeakMap();
        this.condMemo = new WeakMap();
        this.warnings = [];
        this.warned = new Set();
        this.ruleOrder = [];
        this.hasPlace = false;
        this.hasTile = false;
        this.cells = [];
        this.bgSized = new Set();
        this.nextId = nextId(this.instance);
        this.doodles = {};
        this.patterns = {};
        this.shaders = {};
        this.filters = {};
        this.filterIds = new Map();
        this.content = {};
        this.vars = { host: Object.create(null) };
        this.vars.container = Object.create(this.vars.host);
        this.scanTokens(this.tokens);
        if (this.hasTile) {
            let isSet = re => tokens.some(token => token.type === 'rule' && re.test(token.property));
            let extra = [];
            if (!isSet(RE_PLACE)) extra.push(defaultRule('@place', 'center'));
            if (!isSet(/^@size$/)) extra.push(defaultRule('@size', '100%'));
            if (extra.length) {
                this.hasPlace = true;
                this.tokens = extra.concat(this.tokens);
                this.tokens.warnings = tokens.warnings;
                this.ruleOrder = extra.concat(this.ruleOrder);
            }
        }
    }

    warn(message, node) {
        if (this.warned.has(message)) return;
        this.warned.add(message);
        this.warnings.push(node && node.index >= 0 ? { message, index: node.index } : { message });
    }

    addRule(selector, rule) {
        if (!rule) return;
        let rules = this.scope.rules.get(selector);
        if (!rules) this.scope.rules.set(selector, rules = []);
        rules.push(rule);
    }

    addRaw(text) {
        if (text) this.rawRules.add(text);
    }

    addFont(name) {
        if (name) this.fonts.add(name);
    }

    scopedVars(count) {
        return this.vars[count] || this.vars.container;
    }

    calcContext(cell, contextVariable, plain) {
        let group = this.scopedVars(cell.uid);
        let context = plain ? Object.create(defaultContext) : cellContext(cell);
        for (let name in group) context[name.slice(2)] = group[name];
        for (let name in contextVariable) context[name.slice(2)] = contextVariable[name];
        return context;
    }

    callFunc(fn, { cell, env, contextVariable }, position, input, fname, unit) {
        let _fn = fn(cell, env, position);
        if (typeof _fn === 'function') {
            if (fname === '$') {
                let context = this.calcContext(cell, contextVariable);
                if (!unit && input.length === 1) {
                    let value = deref(input[0], context);
                    if (value !== undefined) {
                        return typeof value === 'number' ? tidyNumber(value) : value;
                    }
                }
                return withUnit(_fn(input, context), unit);
            }
            if (fn.vars) {
                return _fn(this.calcContext(cell, contextVariable, true), ...input);
            }
            return _fn(...input);
        }
        return _fn;
    }

    // '&' in a selector stands for the cell
    composeSelector(cell, selector = '&') {
        return selector.replaceAll('&', this.cellPrefix + cell.id);
    }

    readVar(name, count, contextVariable) {
        let value = contextVariable && contextVariable[name];
        if (value === undefined) value = this.scopedVars(count)[name];
        if (value === undefined) return name;
        return removeParens(String(value).trim()).replace(/;+$/g, '');
    }

    composeComposable(fname, node, cell, env, selector, property) {
        let extra = fname === 'scene' ? SCENE_EXTRA : EMPTY_EXTRA;
        let value = node.arguments.map(a => this.composeArgument(a, cell, env, extra)).join(',');
        if (!value) return;
        if (fname === 'doodle') {
            let id = this.nextId('doodle');
            this.doodles[id] = {
                doodle: this.injectVariables(value, cell.uid), arg: node.size,
                upextra: env.extra.length ? structuredClone(env.extra) : undefined,
            };
            return placeholder(id);
        }
        let kind = fname === 'shaders' ? 'shader' : 'pattern';
        let source = value.replace(RE_TEXTURE_OPEN, m => m + this.injectVariables('', cell.uid));
        if (source.includes('$')) {
            let group = this.scopedVars(cell.uid);
            let missing = null;
            source = source.replace(RE_PAINT_VAR, (m, full, at) => {
                if (!full) return m;
                let name = full, rest = '';
                while (group['--' + name] === undefined && name.includes('-')) {
                    rest = name.slice(name.lastIndexOf('-')) + rest;
                    name = name.slice(0, name.lastIndexOf('-'));
                }
                let key = '--' + name;
                if (group[key] === undefined) {
                    missing ??= full;
                    return '';
                }
                let value = this.readVar(key, cell.uid);
                let id = placeholderId(value);
                if (!rest) value = operand(value, source.slice(at + m.length));
                return ((id && this.doodles[id]) ? this.doodles[id].doodle : value) + rest;
            });
            if (missing !== null) {
                this.warn(`unknown variable $${missing} in @${fname}()`, node);
                return;
            }
        }
        let id = this.nextId(kind);
        let special = isSpecialSelector(selector);
        this[kind + 's'][id] = {
            source,
            target: {
                selector: special ? (isHostSelector(selector) ? ':host' : ':container') : (property === '@grid') ? ':host' : cell.id,
                pseudo: isPseudoSelector(selector),
                type: (!special && property === '@content') ? 'content' : 'background',
            },
            arg: node.size,
            id: '--' + id,
            cell: cell.id,
            ...(fname === 'scene' && { fname }),
        };
        return placeholder(id);
    }

    composeArgument(argument, cell, env, extra = EMPTY_EXTRA) {
        return compileArgument(argument)({ cell, env }, extra);
    }

    injectVariables(value, count) {
        let variables = '';
        let group = this.scopedVars(count);
        for (let name in group) {
            let bare = String(group[name]).replace(/"[^"]*"|'[^']*'|\$\{[\w-]+\}/g, '');
            while (bare !== (bare = bare.replace(/\([^()]*\)/g, '')));
            if (!/[;{}]/.test(bare)) variables += `${name}: ${group[name]};`;
        }
        variables = variables.replace(/var\(--cssd-(utime|UTime)\)/g, (_, n) => n == 'utime' ? '@t' : '@T');
        return variables ? `:doodle {${variables}}` + value : value;
    }

    getComposedValue(value, cell, env, context, selector, property) {
        let extra, origin;
        let group = [];
        let frame = { cell, env, contextVariable: context || {}, selector, property };
        for (let v of value) {
            let composed = compileValue(v)(frame);
            if (composed.value) group.push(composed.value);
            if (composed.extra) extra = composed.extra;
            if (composed.origin) origin = composed.origin;
        }
        return {
            extra, origin, group, value: group.join(',')
        }
    }

    composeRule(token, cell, env, selector) {
        let info = this.ruleMemo.get(token);
        if (!info) {
            // static rules compose once per selector
            info = {
                flags: ruleFlags(token.property),
                cache: isStaticRule(token) ? new Map() : null,
            };
            this.ruleMemo.set(token, info);
        }
        let cached = info.cache?.get(selector);
        if (cached === undefined) {
            cached = this.composeRuleValue(token, cell, env, selector, info.flags);
            info.cache?.set(selector, cached);
        }
        return cached;
    }

    composeRuleValue(token, cell, env, selector, flags) {
        let prop = token.property;
        if (prop === '@seed') {
            return '';
        }
        let composed = this.getComposedValue(token.value, cell, env, {}, selector, prop);
        let extra = composed.extra;
        let value = composed.value;

        if (value.includes('path(')) {
            value = value.replace(/(path\(\s*['"]?\s*)[lL](?![a-zA-Z])/g, '$1M');
        }

        if (flags.animation) {
            this.props.hasAnimation = true;
            let { uid } = cell;
            if (prop === 'animation' || prop === 'animation-name') {
                value = composed.group.map(n => n.split(/\s+/).map(name => {
                    let keyframes = this.keyframes.get(name);
                    if (!keyframes || keyframes.static || uid <= 1) return name;
                    keyframes.used.add(uid);
                    return `${name}-${uid}`;
                }).join(' ')).join(',');
            }
            if (isHostSelector(selector)) {
                let prefix = timePrefix[prop];
                if (prefix && value) {
                    value = prefix + ',' + value;
                }
            }
        }

        if (prop === 'content') {
            if (!/["']|^(none|normal|inherit|initial|unset|revert(-layer)?|(no-)?(open|close)-quote)\s?$|^([\w-]+\(|\$\{)/.test(value)) {
                value = `'${value}'`;
            }
            let reset = new Map();
            value = value.replace(/var\(\-\-cssd\-u(time|mousex|mousey|width|height)\)/gi, (n, v) => {
                reset.set(v, `${v} calc(${n})`);
                return `counter(${v})`;
            });
            let counters = reset.size ? `counter-reset:${Array.from(reset.values()).join(' ')};` : '';
            return `${counters}content:${value};`;
        }

        if (flags.transition) {
            this.props.hasTransition = true;
        }

        if (prop === 'background-size') {
            this.bgSized.add(cell);
        }

        let rule = /^--\d/.test(prop) ? '' : `${prop}:${value};`;

        // a tile turns and scales about its own point
        if (composed.origin && prop === 'clip-path') {
            rule += `transform-origin:${composed.origin};`;
        }

        if (flags.size && this.hasPlace && !isSpecialSelector(selector)) {
            rule += `--_cell-${prop}:${value};`;
        }

        if (flags.bgImage && hasPlaceholder(value) && !this.bgSized.has(cell) && !hasShorthandSize(value)) {
            let sizes = parseValueGroup(value, NO_SPACE)
                .map(v => hasPlaceholder(v) ? 'cover' : 'auto')
                .join(',');
            rule += `background-size:${sizes};`;
        }

        if (flags.var) {
            this.composeVars(cell.uid, selector, prop, value);
        }

        if (flags.at) {
            let name = flags.at;
            let transformed = Property[name](value, {
                // the grid always styles the host
                isSpecialSelector: name === 'grid' || isSpecialSelector(selector),
                place: this.hasPlace,
                grid: cell.grid,
                maxGrid: env.maxGrid,
                extra,
                rules: this
            });

            switch (name) {
                case 'grid': {
                    rule = '';
                    if (isHostSelector(selector)) {
                        rule = transformed.size || '';
                        gridStyleRules(transformed, (s, r) => this.addRule(s, r));
                    } else if (!this.grid) {
                        this.addRule(':host', transformed.size);
                        gridStyleRules(transformed, (s, r) => this.addRule(s, r));
                    }
                    this.grid = cell.grid;
                    break;
                }
                case 'gap': {
                    rule = '';
                    if (!this.isGapSet) {
                        if (transformed.gap) {
                            this.addRule(':container', `gap:${transformed.gap};`);
                        }
                        if (transformed.rowRule) {
                            this.addRule(':container', `row-rule:${transformed.rowRule};column-rule:${transformed.columnRule};`);
                        }
                        this.isGapSet = true;
                    }
                    break;
                }
                case 'content': {
                    rule = '';
                    let key = this.composeSelector(cell);
                    if (!isPseudoSelector(selector) && !isSpecialSelector(selector)) {
                        this.content[key] = removeQuotes(transformed);
                    }
                    this.content[key] = Func.raw(cell, env)(this.content[key] || '');
                    break;
                }
                case 'place-cell': case 'place': {
                    if (isHostSelector(selector)) {
                        rule = '';
                        break;
                    }
                    rule = transformed;
                    if (selector === undefined) {
                        rule += placeShared;
                        break;
                    }
                    let shared = selector.replaceAll('&', SHARED_CELL(this.cellPrefix));
                    if (!this.scope.rules.get(shared)?.includes(placeShared)) {
                        this.addRule(shared, placeShared);
                    }
                    break;
                }
                default: {
                    rule = transformed;
                }
            }
        }

        if (flags.gridLike && isHostSelector(selector)) {
            this.addRule(':container', `${prop}:${value};`);
            rule = '';
        }

        return rule;
    }

    composeVars(count, selector, prop, value) {
        let key = isHostSelector(selector) ? 'host'
            : isParentSelector(selector) ? 'container' : count;
        (this.vars[key] ??= Object.create(this.vars.container))[prop] = value;
    }

    // the top-level rules and the host block: the seed first, so the
    // rest composes from the seeded stream
    preCompose(cell, env) {
        let rules = [];
        for (let token of this.tokens) {
            if (token.type === 'rule') {
                rules.push([token]);
            } else if (token.type === 'pseudo' && isHostSelector(token.selectors[0])) {
                for (let t of token.styles) {
                    if (t.type === 'rule') rules.push([t, token.selectors[0]]);
                }
            }
        }
        let literal = {};
        for (let [token] of rules) {
            if (token.property.startsWith('--') && !token.value.hasFunc) {
                literal[token.property] = token.rawValue();
            }
        }
        for (let [token, selector] of rules) {
            if (token.property === '@seed') this.seed = token.value.hasFunc
                ? this.getComposedValue(token.value, cell, env, literal, selector).value
                : token.rawValue();
        }
        if (this.seed) {
            env.updateRandom(this.seed);
        }
        for (let [token, selector] of rules) {
            let prop = token.property;
            let isVar = prop.startsWith('--');
            if (!isVar && prop !== '@grid') continue;
            let value = this.getComposedValue(token.value, cell, env, {}, selector).value;
            if (isVar) this.composeVars(cell.uid, selector, prop, value);
            else this.grid = Property.grid(value, { maxGrid: env.maxGrid }).grid;
        }
    }

    scanTokens(tokens) {
        for (let token of tokens) {
            if (token.type === 'keyframes') {
                if (this.keyframes.has(token.name)) continue;
                this.keyframes.set(token.name, {
                    static: token.steps.every(step =>
                        step.name.hasFunc === false && step.styles.every(s =>
                            isStaticRule(s) || (s.property.startsWith('--') && s.value?.hasFunc === false))),
                    compose: (cell, env) => join(token.steps.map(step => {
                        let name = this.getComposedValue(step.name, cell, env).value;
                        if (!step.styles) return name;
                        let styles = join(step.styles.map(s => this.composeRule(s, cell, env)));
                        return `${name} {${styles}}`;
                    })),
                    used: new Set(),
                });
            } else if (token.type === 'rule') {
                this.ruleOrder.push(token);
                if (RE_PLACE.test(token.property)) this.hasPlace = true;
                this.hasTile ||= token.value.some(v => usesTile(v));
            } else if (token.type === 'cond' || token.type === 'pseudo') {
                this.scanTokens(token.styles);
            }
        }
    }

    condInfo(token) {
        let info = this.condMemo.get(token);
        if (!info) {
            let name = token.name.slice(1);
            let fn = Selector[name];
            let args = token.segments.find(n => n.arguments);
            info = {
                fn,
                args: args ? args.arguments : [],
                not: token.segments[0]?.keyword === 'not',
                raw: !fn && !isGroupAtRule(token.name),
                text: null,
            };
            // @cell.random: a selector function with a modifier it does not have
            if (info.raw && Selector[name.split('.')[0]]) {
                this.warn(`unknown selector ${token.name}`);
            }
            this.condMemo.set(token, info);
        }
        return info;
    }

    // the selector text of a cond as written, arguments composed for the cell
    condSelector(token, cell, env) {
        let info = this.condInfo(token);
        if (info.text !== null) return info.text;
        let text = token.name;
        let keyword = '';
        let dynamic = false;
        for (let n of token.segments) {
            // 'and(' reads as a function token in CSS, so the space is required
            if (n.spaced || (n.arguments && /^(and|or|not)$/i.test(keyword))) text += ' ';
            if (n.keyword) {
                text += n.keyword;
            } else {
                let names = n.arguments.map(arg => getValue(this.composeArgument(arg, cell, env)));
                text += '(' + names.join(', ') + ')';
                dynamic ||= n.arguments.some(arg => !compileArgument(arg).constant);
            }
            keyword = n.keyword || '';
        }
        if (!dynamic) info.text = text;
        return text;
    }

    addCellRule(token, selector, cell, rule) {
        if (!rule) return;
        let entries = this.scope.entries.get(token);
        if (!entries) this.scope.entries.set(token, entries = new Map());
        let entry = entries.get(selector);
        if (!entry) entries.set(selector, entry = { selector, cells: [], texts: [] });
        entry.cells.push(cell);
        entry.texts.push(rule);
    }

    layoutCells(scope) {
        let entries = [];
        for (let token of this.ruleOrder) {
            let m = scope.entries.get(token);
            if (m) entries.push(...m.values());
        }
        let count = this.cells.length;

        for (let e of entries) {
            let { texts } = e;
            let distinct = new Set();
            for (let text of texts) {
                if (distinct.add(text).size * 2 > texts.length) {
                    distinct = null;
                    break;
                }
            }
            e.kind = !distinct ? 'cells'
                : (count > 1 && distinct.size === 1 && texts.length === count) ? 'shared'
                : 'group';
            e.families = familiesOf(texts[0]);
        }

        // a rule leaves the per-cell run only past rules on other properties
        let shares = (a, b) => a.families.has('*') || b.families.has('*') || [...a.families].some(f => b.families.has(f));
        for (let i = 0; i < entries.length; i++) {
            let e = entries[i];
            e.before = e.kind !== 'cells' && entries.slice(0, i).every(p => p.before || !shares(p, e));
        }
        for (let i = entries.length - 1; i >= 0; i--) {
            let e = entries[i];
            e.where = e.before ? 'before'
                : e.kind !== 'cells' && entries.slice(i + 1).every(n => n.where === 'after' || !shares(n, e)) ? 'after'
                : 'run';
        }

        let sections = { before: '', after: '' };
        let runText = new Map(); // selector → texts per cell index
        let shared = SHARED_CELL(this.cellPrefix);
        let pending = '';
        for (let i = 0; i < entries.length; i++) {
            let e = entries[i];
            let { selector, texts, where } = e;
            if (where === 'run') {
                let lists = runText.get(selector);
                if (!lists) runText.set(selector, lists = []);
                for (let j = 0; j < texts.length; j++) {
                    let n = e.cells[j].uid - 1;
                    if (lists[n]) lists[n].push(texts[j]);
                    else lists[n] = [texts[j]];
                }
            } else if (e.kind === 'shared') {
                // consecutive shared rules under one selector print as one
                pending += (pending && '\n') + texts[0];
                let next = entries[i + 1];
                if (next && next.kind === 'shared' && next.selector === selector && next.where === where) continue;
                sections[where] += `${selector.replaceAll('&', shared)} {${pending}}`;
                pending = '';
            } else {
                let byText = new Map();
                for (let j = 0; j < texts.length; j++) {
                    let list = byText.get(texts[j]);
                    if (list) list.push(e.cells[j]);
                    else byText.set(texts[j], [e.cells[j]]);
                }
                for (let [text, cells] of byText) {
                    let list = cells.map(c => this.composeSelector(c, selector)).join(',');
                    sections[where] += `${list} {${text}}`;
                }
            }
        }
        let run = '';
        for (let i = 0; i < count; i++) {
            for (let [selector, lists] of runText) {
                if (lists[i]) run += `${this.composeSelector(this.cells[i], selector)} {${join(lists[i])}}`;
            }
        }
        return sections.before + run + sections.after;
    }

    composeGroup(token, cell, env, selectors) {
        let outer = this.scope;
        let prelude = this.condSelector(token, cell, env);
        let scope = outer.groups.get(prelude);
        if (!scope) {
            outer.groups.set(prelude, scope = { rules: new Map(), entries: new Map(), groups: new Map() });
        }
        this.scope = scope;
        this.compose(cell, env, token.styles, selectors);
        this.scope = outer;
    }

    printGroups(scope) {
        let groups = [];
        for (let [prelude, group] of scope.groups) {
            let body = '';
            for (let [name, rule] of group.rules) {
                body += `${specialName(name)} {${join(rule)}}`;
            }
            body += this.layoutCells(group) + this.printGroups(group);
            if (body) groups.push(`${prelude} {${body}}`);
        }
        return join(groups);
    }

    compose(cell, env, tokens, selectors = CELL) {
        if (!tokens) this.cells.push(cell);
        for (let token of (tokens || this.tokens)) {
            switch (token.type) {
                case 'rule': {
                    if (token.property === '@gap' && this.isGapSet) break;
                    if (token.property === '@grid' && this.grid) break;
                    for (let selector of selectors) {
                        let rule = this.composeRule(token, cell, env, selector);
                        // cell rules wait for the sheet layout of their scope
                        if (selector.includes('&') && !isSpecialSelector(selector)) {
                            this.addCellRule(token, selector, cell, rule);
                        } else {
                            this.addRule(this.composeSelector(cell, selector), rule);
                        }
                    }
                    break;
                }

                case 'pseudo': {
                    // host and container rules compose once
                    let selectors = token.selectors;
                    if (selectors.some(isSpecialSelector)) {
                        if (this.skips.has(token)) selectors = selectors.filter(s => !isSpecialSelector(s));
                        else this.skips.add(token);
                    }
                    if (selectors.length) this.compose(cell, env, token.styles, selectors);
                    break;
                }

                case 'cond': {
                    let { fn, args, not, raw } = this.condInfo(token);
                    if (raw) {
                        this.addRaw(token.raw());
                        break;
                    }
                    if (!fn) {
                        this.composeGroup(token, cell, env, selectors);
                        break;
                    }
                    let input = [];
                    for (let arg of args) {
                        let { composed, cluster } = compileArgument(arg);
                        pushInput(input, this.composeArgument(arg, cell, env), composed || cluster);
                    }
                    let matched = this.callFunc(fn, { cell, env }, token.position, removeEmptyValues(input));
                    if (not ? !matched : matched) {
                        this.compose(cell, env, token.styles, selectors);
                    }
                    break;
                }

                case 'at-rule': {
                    this.addRaw(token.value);
                    break;
                }
            }
        }
    }

    output(env) {
        let styles = { host: '', container: '', cells: '', backdrop: '' };
        let keyframes = '';
        for (let [name, frames] of this.keyframes) {
            let cells = frames.static ? this.cells.slice(0, 1) : this.cells;
            for (let cell of cells) {
                let body = frames.compose(cell, env);
                if (cell.uid <= 1) keyframes += `@keyframes ${name} {${body}}`;
                else if (frames.used.has(cell.uid)) keyframes += `@keyframes ${name}-${cell.uid} {${body}}`;
            }
        }

        for (let [selector, rule] of this.root.rules) {
            let target = (selector === 'bd') ? 'backdrop'
                : isHostSelector(selector) ? 'host'
                : isParentSelector(selector) ? 'container' : 'cells';
            styles[target] += `${specialName(selector)} {${join(rule)}}`;
        }

        styles.cells += this.layoutCells(this.root) + this.printGroups(this.root);

        if (this.uniforms.time) {
            styles.container += `:host,.host {animation:${timePrefix.animation};}`;
            keyframes = timeKeyframes + keyframes;
        }

        let { host, container, cells, backdrop } = styles;
        let main = keyframes + container + host;
        let raw = [...this.rawRules, ...(this.uniforms.time ? timeProperties : [])];
        let top = join(raw);
        let gf = [...this.fonts];
        let property = raw.filter(rule => /^@property\b/i.test(rule));

        return {
            props: this.props,
            styles: { main, cells, container, backdrop, gf, top, property, all: main + backdrop + cells },
            grid: this.grid,
            seed: this.seed,
            random: this.random,
            doodles: this.doodles,
            shaders: this.shaders,
            patterns: this.patterns,
            filters: this.filters,
            uniforms: this.uniforms,
            content: this.content,
            warnings: (this.tokens.warnings || []).concat(this.warnings),
        }
    }

}

const mathStreams = new WeakMap();

function useMathStream(random, seed) {
    return useRandom(() => {
        let stream = mathStreams.get(random);
        if (!stream) {
            mathStreams.set(random, stream = seedrandom('random:' + seed));
        }
        return stream();
    });
}

export default function generateCss(tokens, gridSize, seedValue, maxGrid, seedRandom, upextra = [], instance = '', host) {
    let R = createRandom(seedRandom || String(seedValue));
    let { rand, pick, shuffle, updateRandom } = R;
    let restore = useMathStream(R.random, seedValue);
    try {

        let envAt = (rules, seed) => ({
            rules, context: {}, extra: [], upextra, level: 0, host,
            rand, pick, shuffle, random: R.random, updateRandom,
            seed, maxGrid,
        });
        let cellAt = (x, y, z, count, uid, grid) => ({ x, y, z, count, uid, grid, id: cellId(x, y, z) });

        let pre = new Rules(tokens, instance);
        pre.preCompose(cellAt(1, 1, 1, 1, 1, { x: 1, y: 1, z: 1, count: 1 }), envAt(pre));

        gridSize = pre.grid || gridSize;
        let seed = pre.seed || seedValue;
        if (isNil(seed)) seed = Date.now();
        seed = String(seed);

        if (pre.seed || !seedRandom) {
            updateRandom(seed);
        }
        useMathStream(R.random, seed);
        let tree = isTreeGrid(gridSize);
        let rules = new Rules(tokens, instance);
        rules.seed = seed;
        rules.random = R.random;
        rules.cellPrefix = tree ? '.' : '#';

        let env = envAt(rules, seed);
        let cellGrid = tree ? { ...gridSize, count: gridSize.x * gridSize.y } : gridSize;
        let uid = 0;
        let count = 0;
        for (let z = 1; z <= gridSize.z; ++z) {
            if (tree) {
                count = 0;
                env.level = z;
            }
            for (let y = 1; y <= gridSize.y; ++y) {
                for (let x = 1; x <= gridSize.x; ++x) {
                    rules.compose(cellAt(x, y, z, ++count, ++uid, cellGrid), env);
                }
            }
        }
        let output = rules.output(env);
        if (tree && output.grid) output.grid = gridSize;
        return output;
    } finally {
        useRandom(restore);
    }
}
