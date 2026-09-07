import Func, { MathFunc } from '../core/function.js';
import calc, { defaultContext, deref, compileTemplate, toPlainNumber, isSignLeading } from '../core/calc.js';
import Property from '../core/property.js';
import Selector from '../core/selector.js';
import parseValueGroup from '../parser/parse-value-group.js';
import parseShaders from '../parser/parse-shaders.js';

import createRandom from '../core/random.js';
import { timePrefix, timeKeyframes } from '../core/uniforms.js';
import gridStyleRules from './grid-style.js';

import { cellId } from '../lib/cell.js';
import { placeholder, hasPlaceholder, placeholderId } from '../lib/placeholder.js';
import { tidyNumber } from '../lib/math.js';
import { isNil, getValue, removeQuotes } from '../lib/type.js';
import { join, last, removeEmptyValues } from '../lib/list.js';
import { nextId } from '../lib/fn.js';
import {
    isHostSelector, isParentSelector, isSpecialSelector, isPseudoSelector, isGroupAtRule
} from '../lib/selector.js';


function isImageValue(value) {
    return hasPlaceholder(String(value));
}

function hasShorthandSize(value) {
    let depth = 0;
    for (let c of String(value)) {
        if (c === '(') depth++;
        else if (c === ')') depth--;
        else if (c === '/' && !depth) return true;
    }
    return false;
}

function hasEntries(obj) {
    for (let _ in obj) return true;
    return false;
}

const NO_SPACE = { noSpace: true };
const COMPOSABLE = new Set(['doodle', 'shaders', 'pattern']);

const CELL = ['&'];

const SHARED_CELL = ':is(cell,#_)';

const FAMILY = {
    __proto__: null,
    top: 'inset', right: 'inset', bottom: 'inset', left: 'inset',
    'line-height': 'font',
    'row-gap': 'gap', 'column-gap': 'gap',
    align: 'place', justify: 'place',
};

function familiesOf(text) {
    let families = new Set();
    for (let [, name] of text.matchAll(/(?:^|;)\s*([\w-]+)\s*:/g)) {
        if (name.startsWith('--')) {
            families.add(name);
            continue;
        }
        name = name.replace(/^-\w+-/, '');
        let head = name.split('-')[0];
        // `all` resets every property, so it belongs to every family
        families.add(head === 'all' ? '*' : (FAMILY[name] ?? FAMILY[head] ?? head));
    }
    return families;
}

const funcCache = new Map();

function findFunc(name) {
    let fn = funcCache.get(name);
    if (fn === undefined) {
        fn = Func[name === '$' ? 'calc' : name] || MathFunc[name] || null;
        funcCache.set(name, fn);
    }
    return fn;
}

const EMPTY_EXTRA = [];

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
    ut: 'time', UT: 'time', t: 'time', T: 'time', ts: 'time', TS: 'time',
    ux: 'mousex', uy: 'mousey', uw: 'width', uh: 'height',
    shaders: 'mouse',
};

const compiledValues = new WeakMap();
const compiledFuncs = new WeakMap();
const compiledArguments = new WeakMap();

// value: list of text/func nodes → env => { value, extra }
function compileValue(value) {
    let compiled = compiledValues.get(value);
    if (compiled === undefined) {
        let parts = value.map(v => {
            if (v.type === 'func') return compileFunc(v);
            return (v.type === 'text') ? ('' + v.value) : '';
        });
        if (parts.every(part => typeof part === 'string')) {
            let constant = { value: parts.join(''), extra: '' };
            compiled = () => constant;
        } else {
            compiled = frame => {
                let output = '';
                let extra = '';
                for (let part of parts) {
                    if (typeof part === 'string') {
                        output += part;
                    } else {
                        let evaluated = part(frame, EMPTY_EXTRA, false);
                        output += evaluated.value;
                        if (evaluated.extra) extra = evaluated.extra;
                    }
                }
                return { value: output, extra };
            };
        }
        compiledValues.set(value, compiled);
    }
    return compiled;
}

function compileFunc(node) {
    let compiled = compiledFuncs.get(node);
    if (compiled === undefined) {
        let fname = node.name.slice(1);
        let fn = findFunc(fname);
        if (typeof fn !== 'function') {
            let literal = { value: node.name };
            compiled = frame => {
                if (node.arguments.length) {
                    frame.env.rules.warn(`unknown function ${node.name}()`, node);
                }
                return literal;
            };
        } else if (SEQ_READERS.has(fn) && !node.arguments.length && !node.variables) {
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
            let unit = node.unit || '';
            let uniformKey = UNIFORM_KEYS[fname] ?? null;
            let isMath = fn === MathFunc[fname];
            let calcTemplate = null;
            if ((isDollar || fname === 'calc') && node.arguments.length === 1) {
                calcTemplate = args[0].calcTemplate || null;
            }
            // all-literal argument lists are interpreted here, once
            let constantInput = null;
            if (!fn.lazy && args.every(arg => arg.constant)) {
                constantInput = [];
                for (let arg of args) {
                    if (arg.split) constantInput.push(...arg.split);
                    else pushInput(constantInput, arg(), true);
                }
                constantInput = removeEmptyValues(constantInput);
            }
            compiled = (frame, extra, inArgument) => {
                let { cell, env } = frame;
                let { rules } = env;
                if (uniformKey) {
                    rules.uniforms[uniformKey] = true;
                }
                if (composable) {
                    let composed = rules.composeComposable(fname, node, cell, env, frame.selector, frame.property);
                    if (composed !== undefined) {
                        return { value: composed };
                    }
                    if (!inArgument) {
                        return { value: '' };
                    }
                }
                if (!inArgument && node.variables) {
                    rules.composeVariables(node.variables, cell, env, frame.contextVariable);
                }
                if (calcTemplate !== null) {
                    let e = inArgument ? extra : EMPTY_EXTRA;
                    let { context, values } = evalTemplateHoles(calcTemplate, frame, e);
                    let output;
                    if (context) {
                        output = isDollar
                            ? rules.callCalc(unit, cell.count, calcTemplate.template, context, frame.contextVariable)
                            : rules.callFunc(fn, frame, node.position, [calcTemplate.template, context], fname);
                    } else {
                        let input = spliceTemplateInput(calcTemplate, values);
                        output = rules.callFunc(fn, frame, node.position, input, fname, unit);
                    }
                    return { value: getValue(output), extra: output?.extra };
                }
                let input = constantInput;
                if (input === null) {
                    if (fn.lazy) {
                        input = args.map(arg => (...lazy) => arg(frame, lazy));
                    } else {
                        input = [];
                        let e = inArgument ? extra : EMPTY_EXTRA;
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
                            let v = arg.constant ? arg() : arg(frame, e);
                            pushInput(input, v, arg.cluster || arg.composed);
                        }
                        input = removeEmptyValues(input);
                    }
                }
                let output = rules.callFunc(fn, frame, node.position, input, fname, unit);
                return { value: getValue(output), extra: output?.extra };
            };
        }
        compiledFuncs.set(node, compiled);
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
            let hasVarRead = false;
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
                } else if (v.type === 'var') {
                    hasVarRead = true;
                    holes.push((parent && parent.name === '@var')
                        ? () => v.name
                        : frame => frame.env.rules.readVar(v.name, frame.cell.count, frame.contextVariable));
                } else {
                    holes.push(() => undefined);
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
                        if (v != null) value += v;
                        value += segments[i + 1];
                    }
                    frame.env.extra.pop();
                    return value;
                };
                compiled.composed = true;
            }
            // `--x` reads resolve through readVar, outside the template
            if (!argument.cluster && !hasVarRead) {
                let template = compileTemplate(segments);
                if (template !== null) {
                    compiled.calcTemplate = {
                        template: template.template,
                        names: template.names,
                        signSensitive: template.signSensitive,
                        segments,
                        holes,
                        singlePart: values.length === 1,
                    };
                }
            }
        }
        compiled.cluster = argument.cluster;
        compiledArguments.set(argument, compiled);
    }
    return compiled;
}

function evalTemplateHoles({ holes, names, signSensitive }, frame, extra) {
    let n = holes.length;
    let values = new Array(n);
    frame.env.extra.push(extra);
    for (let i = 0; i < n; i++) {
        values[i] = holes[i](frame, extra);
    }
    frame.env.extra.pop();
    let context = Object.create(defaultContext);
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
            joined += values[i] + segments[i + 1];
        }
        input.push(joined);
    }
    return removeEmptyValues(input);
}

function isStaticRule(token) {
    let prop = token.property;
    // @shape is a pure function of its value, the other @-properties
    // read the grid or the cell
    if (prop.startsWith('@') && prop !== '@shape') return false;
    if (prop.startsWith('--')) return false;
    if (prop.startsWith('animation')) return false;
    if (prop === 'background-size') return false;
    return token.value?.hasFunc === false;
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
        this.tokens = tokens;
        this.root = { rules: new Map(), groups: new Set() };
        this.scope = this.root;
        this.rawRules = new Set();
        this.fonts = new Set();
        this.props = {};
        this.keyframes = new Map();
        this.grid = null;
        this.seed = null;
        this.isGapSet = false;
        this.uniforms = {};
        this.skips = new WeakSet();
        this.ruleMemo = new WeakMap();
        this.condMemo = new WeakMap();
        this.warnings = [];
        this.warned = new Set();
        this.ruleOrder = [];
        this.cells = [];
        this.bgSized = new Set();
        this.nextId = nextId(this.instance);
        this.doodles = {};
        this.patterns = {};
        this.shaders = {};
        this.filters = {};
        this.content = {};
        this.vars = {};
        this.entries = new Map();
        this.scanTokens(tokens);
    }

    warn(message, node) {
        if (this.warned.has(message)) return;
        this.warned.add(message);
        this.warnings.push(node && node.index >= 0 ? { message, index: node.index } : { message });
    }

    addRule(selector, rule) {
        let rules = this.scope.rules.get(selector);
        if (!rules) this.scope.rules.set(selector, rules = []);
        if (rule) rules.push(rule);
    }

    addRaw(text) {
        if (text) this.rawRules.add(text);
    }

    addGroup(text) {
        if (text) this.scope.groups.add(text);
    }

    addFont(name) {
        if (name) this.fonts.add(name);
    }

    scopedVars(count, extra) {
        return Object.assign({},
            this.vars['host'],
            this.vars['container'],
            this.vars[count],
            extra
        );
    }

    calcContext(count, contextVariable) {
        let group = this.scopedVars(count, contextVariable);
        let context = Object.create(defaultContext);
        for (let [name, key] of Object.entries(group)) {
            context[name.slice(2)] = key;
        }
        return context;
    }

    // the compiled-template variant of the $ branch in callFunc: the
    // expression is stable, the function results ride in as variables
    callCalc(unit, count, template, holes, contextVariable = {}) {
        let hasVars = hasEntries(this.vars['host'])
            || hasEntries(this.vars['container'])
            || hasEntries(this.vars[count])
            || hasEntries(contextVariable);
        let context = hasVars
            ? Object.assign(this.calcContext(count, contextVariable), holes)
            : holes;
        return tidyNumber(calc(template, context)) + unit;
    }

    callFunc(fn, { cell, env, contextVariable }, position, input, fname, unit = '') {
        let _fn = fn(cell, env, position);
        if (typeof _fn === 'function') {
            if (fname === '$') {
                let context = this.calcContext(cell.count, contextVariable);
                // a lone variable name with no unit reads as a
                // generation-time var(): non-math values pass through
                if (!unit && input.length === 1) {
                    let value = deref(input[0], context);
                    if (value !== undefined) {
                        return value;
                    }
                }
                return _fn(input, context) + unit;
            }
            return _fn(...input);
        }
        return _fn;
    }

    composeAname(name, count) {
        let keyframes = this.keyframes.get(name);
        return (keyframes && !keyframes.static && count > 1) ? `${name}-${count}` : name;
    }

    // '&' in a selector stands for the cell
    composeSelector(cell, selector = '&') {
        let base = '#' + cell.id;
        let i = selector.indexOf('&');
        if (i < 0) return selector;
        let tail = selector.slice(i + 1);
        if (tail.includes('&')) tail = tail.replaceAll('&', base);
        return selector.slice(0, i) + base + tail;
    }

    readVar(value, count, contextVariable) {
        let group = this.scopedVars(count, contextVariable);
        if (group[value] !== undefined) {
            let result = String(group[value]).trim();
            if (result.startsWith('(') && result.endsWith(')')) {
                result = result.slice(1, -1);
            }
            return result.replace(/;+$/g, '');
        }
        return value;
    }

    composeComposable(fname, node, cell, env, selector, property) {
        let value = node.arguments.map(a => getValue(a.values[0])).join(',');
        if (value) {
            switch (fname) {
                case 'doodle':
                    return this.composeDoodle(
                        this.injectVariables(value, cell.count), node.size,
                        env.extra.length ? structuredClone(env.extra) : undefined);
                case 'shaders':
                case 'pattern':
                    return this.composePaint(fname, value, cell, node.size, selector, property, node);
            }
        }
    }

    composeArgument(argument, cell, env) {
        let compiled = compileArgument(argument);
        return compiled.constant ? compiled() : compiled({ cell, env }, EMPTY_EXTRA);
    }

    composeDoodle(doodle, arg, upextra) {
        let id = this.nextId('doodle');
        this.doodles[id] = { doodle, arg, upextra };
        return placeholder(id);
    }

    resolveShaderVars(source, count, node) {
        if (!/\$[\w-]/.test(source)) return source;
        let parsed = parseShaders(source);
        let group = this.scopedVars(count);
        let missing = null;
        const read = (_, name) => {
            let key = '--' + name;
            if (group[key] === undefined) {
                missing ??= name;
                return '';
            }
            let value = this.readVar(key, count);
            let id = placeholderId(value);
            return (id && this.doodles[id]) ? this.doodles[id].doodle : value;
        };
        for (let key of ['fragment', 'vertex']) {
            if (parsed[key]) parsed[key] = parsed[key].replace(/\$([\w-]+)/g, read);
        }
        for (let texture of parsed.textures) {
            texture.value = texture.value.replace(/^\$([\w-]+)$/, read);
        }
        if (missing !== null) {
            this.warn(`unknown variable $${missing} in @shaders()`, node);
            return null;
        }
        return parsed;
    }

    composePaint(fname, source, cell, arg, selector, property, node) {
        let kind = fname === 'shaders' ? 'shader' : 'pattern';
        if (kind === 'shader') {
            source = this.resolveShaderVars(source, cell.count, node);
            if (source === null) return '';
        }
        let id = this.nextId(kind);
        let special = isSpecialSelector(selector);
        this[kind + 's'][id] = {
            source,
            target: {
                selector: special ? selector : (property === '@grid') ? ':host' : cell.id,
                type: (!special && property === '@content') ? 'content' : 'background',
            },
            arg,
            id: '--' + id,
            cell: cell.id,
        };
        return placeholder(id);
    }

    injectVariables(value, count) {
        let variables = '';
        for (let [name, key] of Object.entries(this.scopedVars(count))) {
            variables += `${name}: ${key};`;
        }
        return variables ? `:doodle {${variables}}` + value : value;
    }

    composeVariables(variables, cell, env, result = {}) {
        for (let [name, value] of Object.entries(variables)) {
            result[name] = this.getComposedValue(value, cell, env, result).value;
        }
        return result;
    }

    getComposedValue(value, cell, env, context, selector, property) {
        let extra;
        let group = [];
        if (Array.isArray(value)) {
            let frame = { cell, env, contextVariable: context || {}, selector, property };
            for (let v of value) {
                if (!Array.isArray(v)) continue;
                let composed = compileValue(v)(frame);
                if (composed.value) group.push(composed.value);
                if (composed.extra) extra = composed.extra;
            }
        }
        return {
            extra, group, value: group.join(',')
        }
    }

    addGridStyle(transformed) {
        for (let [selector, rule] of gridStyleRules(transformed)) {
            this.addRule(selector, rule);
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
        if (!info.cache) {
            return this.composeRuleValue(token, cell, env, selector, info.flags);
        }
        let cached = info.cache.get(selector);
        if (cached === undefined) {
            cached = this.composeRuleValue(token, cell, env, selector, info.flags);
            info.cache.set(selector, cached);
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

        if (flags.animation) {
            this.props.hasAnimation = true;
            let { count } = cell;
            if (prop === 'animation-name') {
                value = composed.group
                    .map(n => this.composeAname(n, count))
                    .join(',');
            } else if (prop === 'animation') {
                value = composed.group
                    .map(n => n.split(/\s+/).map(w => this.composeAname(w, count)).join(' '))
                    .join(',');
            }
            if (isHostSelector(selector)) {
                let prefix = timePrefix[prop];
                if (prefix && value) {
                    value = prefix + ',' + value;
                }
            }
        }

        if (prop === 'content') {
            if (!/["']|^none\s?$|^(var|counter|counters|attr|url)\(/.test(value)) {
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

        let rule = `${prop}:${value};`

        if (flags.size && !isSpecialSelector(selector)) {
            rule += `--_cell-${prop}:${value};`;
        }

        if (flags.bgImage && isImageValue(value) && !this.bgSized.has(cell) && !hasShorthandSize(value)) {
            let sizes = parseValueGroup(value, NO_SPACE)
                .map(v => isImageValue(v) ? 'cover' : 'auto')
                .join(',');
            rule += `background-size:${sizes};`;
        }

        if (flags.var) {
            this.composeVars(cell.count, selector, prop, value);
        }

        if (flags.at) {
            let name = flags.at;
            let transformed = Property[name](value, {
                // the grid always styles the host
                isSpecialSelector: name === 'grid' || isSpecialSelector(selector),
                grid: cell.grid,
                maxGrid: env.maxGrid,
                extra
            });

            switch (name) {
                case 'grid': {
                    rule = '';
                    if (isHostSelector(selector)) {
                        rule = transformed.size || '';
                        this.addGridStyle(transformed);
                    } else if (!this.grid) {
                        this.addRule(':host', transformed.size || '');
                        this.addGridStyle(transformed);
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
                    if (!isPseudoSelector(selector) && !isParentSelector(selector)) {
                        this.content[key] = removeQuotes(String(transformed));
                    }
                    this.content[key] = Func.raw(cell, env)(this.content[key] || '');
                    break;
                }
                case 'place-cell': case 'place': case 'offset': {
                    if (!isHostSelector(selector)) rule = transformed;
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
        (this.vars[key] ??= {})[prop] = value;
    }

    preComposeRule(token, cell, env, selector) {
        let prop = token.property;
        if (prop.startsWith('--')) {
            let value = this.getComposedValue(token.value, cell, env, {}, selector).value;
            this.composeVars(cell.count, selector, prop, value);
        } else if (prop === '@grid') {
            let value = this.getComposedValue(token.value, cell, env, {}, selector).value;
            this.grid = Property.grid(value, { maxGrid: env.maxGrid }).grid;
        }
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
        for (let [token] of rules) {
            if (token.property === '@seed') this.seed = token.rawValue();
        }
        if (this.seed) {
            env.updateRandom(this.seed);
        }
        for (let [token, selector] of rules) {
            this.preComposeRule(token, cell, env, selector);
        }
    }

    scanTokens(tokens) {
        for (let token of tokens || []) {
            if (token.type === 'keyframes') {
                this.registerKeyframes(token);
            } else if (token.type === 'rule') {
                this.ruleOrder.push(token);
            } else if (token.type === 'cond' || token.type === 'pseudo') {
                this.scanTokens(token.styles);
            }
        }
    }

    registerKeyframes(token) {
        if (this.keyframes.has(token.name)) return;
        let isStatic = token.steps.every(step =>
            step.name.hasFunc === false && step.styles.every(isStaticRule));
        let compose = (cell, env) => join(token.steps.map(step => {
            let name = this.getComposedValue(step.name, cell, env).value;
            let styles = join(step.styles.map(s => this.composeRule(s, cell, env)));
            return `${name} {${styles}}`;
        }));
        let body = null;
        this.keyframes.set(token.name, {
            static: isStatic,
            compose: isStatic ? (cell, env) => body ??= compose(cell, env) : compose,
        });
    }

    condInfo(token) {
        let info = this.condMemo.get(token);
        if (!info) {
            let name = token.name.slice(1);
            let fn = Selector[name];
            let args = token.segments.find(n => n.arguments);
            info = {
                name, fn,
                args: args ? args.arguments : [],
                not: !!token.segments[0] && token.segments[0].keyword === 'not',
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

    matchCond(token, cell, env) {
        let { fn, args, not } = this.condInfo(token);
        if (!fn) return;
        let input = [];
        for (let arg of args) {
            let { composed, cluster } = compileArgument(arg);
            pushInput(input, this.composeArgument(arg, cell, env), composed || cluster);
        }
        input = removeEmptyValues(input);
        let _fn = fn(cell, env, token.position);
        let matched = (typeof _fn === 'function') ? _fn(...input) : _fn;
        return not ? !matched : !!matched;
    }

    addCellRule(token, selector, cell, rule) {
        if (!rule) return;
        let entries = this.entries.get(token);
        if (!entries) this.entries.set(token, entries = new Map());
        let entry = entries.get(selector);
        if (!entry) entries.set(selector, entry = { selector, cells: [], texts: [] });
        entry.cells.push(cell);
        entry.texts.push(rule);
    }

    layoutCells() {
        let entries = [];
        for (let token of this.ruleOrder) {
            let m = this.entries.get(token);
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

        let runs = new Map();
        for (let i = 0; i < entries.length; i++) {
            let e = entries[i];
            if (e.kind !== 'cells') continue;
            for (let f of e.families) {
                let r = runs.get(f);
                if (r) r.last = i;
                else runs.set(f, { first: i, last: i });
            }
        }
        for (let i = 0; i < entries.length; i++) {
            let e = entries[i];
            if (e.kind === 'cells') {
                e.where = 'run';
                continue;
            }
            let before = true, after = true;
            for (let [f, r] of runs) {
                if (f !== '*' && !e.families.has('*') && !e.families.has(f)) continue;
                if (r.first < i) before = false;
                if (r.last > i) after = false;
            }
            e.where = before ? 'before' : after ? 'after' : 'run';
        }

        let sections = { before: '', after: '' };
        let runText = new Map(); // selector → texts per cell index
        let pending = '';
        for (let i = 0; i < entries.length; i++) {
            let e = entries[i];
            let { selector, texts, where } = e;
            if (where === 'run') {
                let lists = runText.get(selector);
                if (!lists) runText.set(selector, lists = []);
                for (let j = 0; j < texts.length; j++) {
                    let n = e.cells[j].count - 1;
                    if (lists[n]) lists[n].push(texts[j]);
                    else lists[n] = [texts[j]];
                }
            } else if (e.kind === 'shared') {
                // consecutive shared rules under one selector print as one
                pending += (pending && '\n') + texts[0];
                let next = entries[i + 1];
                if (next && next.kind === 'shared' && next.selector === selector && next.where === where) continue;
                sections[where] += `${selector.replaceAll('&', SHARED_CELL)} {${pending}}`;
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

    // a group at-rule composed for the cell: its rules collect in a scope
    // of their own, then print inside the prelude with nested groups last
    composeGroup(token, cell, env, selectors) {
        let outer = this.scope;
        let scope = this.scope = { rules: new Map(), groups: new Set() };
        this.compose(cell, env, token.styles, selectors);
        let body = '';
        for (let [name, rule] of scope.rules) {
            if (rule.length) {
                body += `${specialName(name)} {${join(rule)}}`;
            }
        }
        body += join([...scope.groups]);
        this.scope = outer;
        return body ? `${this.condSelector(token, cell, env)} {${body}}` : '';
    }

    // selectors are the enclosing ones, '&' standing for the cell; rules
    // land under each of them, nested blocks carry their own resolved list
    compose(cell, env, tokens, selectors = CELL) {
        // nested calls (conds) run for the same cell
        if (!tokens) this.cells.push(cell);
        for (let token of (tokens || this.tokens)) {
            switch (token.type) {
                case 'rule': {
                    if (token.property === '@gap' && this.isGapSet) break;
                    if (token.property === '@grid' && this.grid) break;
                    for (let selector of selectors) {
                        let rule = this.composeRule(token, cell, env, selector);
                        // cell rules wait for the sheet layout, unless they sit
                        // inside a group at-rule, which is a scope of its own
                        if (this.scope === this.root && selector.includes('&') && !isSpecialSelector(selector)) {
                            this.addCellRule(token, selector, cell, rule);
                        } else {
                            this.addRule(this.composeSelector(cell, selector), rule);
                        }
                    }
                    break;
                }

                case 'pseudo': {
                    // host and container rules compose once
                    if (token.selectors.every(isSpecialSelector)) {
                        if (this.skips.has(token)) break;
                        this.skips.add(token);
                    }
                    this.compose(cell, env, token.styles, token.selectors);
                    break;
                }

                case 'cond': {
                    if (this.condInfo(token).raw) {
                        this.addRaw(token.raw());
                        break;
                    }
                    let matched = this.matchCond(token, cell, env);
                    if (matched === undefined) {
                        this.addGroup(this.composeGroup(token, cell, env, selectors));
                    } else if (matched) {
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
                let aname = this.composeAname(name, cell.count);
                keyframes += `@keyframes ${aname} {${frames.compose(cell, env)}}`;
            }
        }

        for (let [selector, rule] of this.root.rules) {
            if (isParentSelector(selector)) {
                styles.container += `${specialName(selector)} {${join(rule)}}`;
            } else {
                let target = (selector === 'bd') ? 'backdrop'
                    : isHostSelector(selector) ? 'host' : 'cells';
                let value = join(rule).trim();
                if (value.length) {
                    styles[target] += `${specialName(selector)} {${value}}`;
                }
            }
        }

        // after the grid styles above (`cell {flex:1}`), the cell rules,
        // then the group at-rules
        styles.cells += this.layoutCells() + join([...this.root.groups]);

        if (this.uniforms.time) {
            styles.container += `:host,.host {animation:${timePrefix.animation};}`;
            keyframes = timeKeyframes + keyframes;
        }

        let { host, container, cells, backdrop } = styles;
        let main = keyframes + container + host;
        let top = join([...this.rawRules]);
        let gf = [...this.fonts];

        return {
            props: this.props,
            styles: { main, cells, container, backdrop, gf, top, all: main + backdrop + cells },
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

export default function generateCss(tokens, gridSize, seedValue, maxGrid, seedRandom, upextra = [], instance = '') {
    let R = createRandom(seedRandom || String(seedValue));
    let { rand, pick, shuffle, updateRandom } = R;

    let envAt = (rules, seed) => ({
        rules, context: {}, extra: [], upextra,
        rand, pick, shuffle, random: R.random, updateRandom,
        seed, maxGrid,
    });
    let cellAt = (x, y, z, count, grid) => ({ x, y, z, count, grid, id: cellId(x, y, z) });

    let pre = new Rules(tokens, instance);
    pre.preCompose(cellAt(1, 1, 1, 1, { x: 1, y: 1, z: 1, count: 1 }), envAt(pre));

    gridSize = pre.grid || gridSize;
    let seed = pre.seed;

    if (seed) {
        updateRandom(seed);
    } else {
        seed = seedValue;
    }

    if (isNil(seed)) {
        seed = Date.now();
        updateRandom(seed);
    }

    seed = String(seed);
    let rules = new Rules(tokens, instance);
    rules.seed = seed;
    rules.random = R.random;

    let env = envAt(rules, seed);
    let count = 0;
    function composeCell(x, y, z) {
        rules.compose(cellAt(x, y, z, ++count, gridSize), env);
    }

    if (gridSize.z == 1) {
        for (let y = 1; y <= gridSize.y; ++y) {
            for (let x = 1; x <= gridSize.x; ++x) {
                composeCell(x, y, 1);
            }
        }
    }
    else {
        for (let z = 1; z <= gridSize.z; ++z) {
            composeCell(1, 1, z);
        }
    }
    return rules.output(env);
}
