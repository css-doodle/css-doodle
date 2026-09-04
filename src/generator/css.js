import Func, { MathFunc } from '../core/function.js';
import calc, { deref, compileTemplate, toPlainNumber, isSignLeading } from '../core/calc.js';
import Property from '../core/property.js';
import Selector from '../core/selector.js';
import parseValueGroup from '../parser/parse-value-group.js';

import createRandom from '../core/random.js';
import { utime, UTime, timePrefix } from '../core/uniforms.js';
import gridStyleRules from './grid-style.js';

import { cellId } from '../utils/cell.js';
import { tidyNumber } from '../utils/math.js';
import { isNil, getValue } from '../utils/type.js';
import { join, last, removeEmptyValues } from '../utils/list.js';
import { nextId } from '../utils/fn.js';
import {
    isHostSelector, isParentSelector, isSpecialSelector, isPseudoSelector, isGroupAtRule
} from '../utils/selector.js';


function isImageValue(value) {
    return String(value).includes('${') && /\$\{(shader|pattern|doodle)/.test(value);
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
            compiled = env => {
                let output = '';
                let extra = '';
                for (let part of parts) {
                    if (typeof part === 'string') {
                        output += part;
                    } else {
                        let evaluated = part(env, EMPTY_EXTRA, false);
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
            if (node.arguments.length) {
                compiled = env => {
                    env.rules.warn(`unknown function ${node.name}()`, node);
                    return literal;
                };
            } else {
                compiled = () => literal;
            }
        } else if (SEQ_READERS.has(fn) && !node.arguments.length && !node.variables) {
            let index = SEQ_READERS.get(fn);
            let read = env => {
                let e = last(env.coords.extra);
                return (e && e.length) ? e[index] : node.name;
            };
            compiled = env => ({ value: read(env) });
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
                    else if (!isNil(arg())) constantInput.push(getValue(arg()));
                }
                constantInput = removeEmptyValues(constantInput);
            }
            compiled = (env, extra, inArgument) => {
                let { rules, coords } = env;
                if (uniformKey) {
                    rules.uniforms[uniformKey] = true;
                }
                if (composable) {
                    let composed = rules.composeComposable(fname, node, coords, env.selector, env.property);
                    if (composed !== undefined) {
                        return { value: composed };
                    }
                    if (!inArgument) {
                        return { value: '' };
                    }
                }
                coords.position = node.position;
                if (!inArgument && node.variables) {
                    rules.composeVariables(node.variables, coords, env.contextVariable);
                }
                if (calcTemplate !== null) {
                    let e = inArgument ? extra : EMPTY_EXTRA;
                    let { context, values } = evalTemplateHoles(calcTemplate, env, e);
                    let output;
                    if (context) {
                        output = isDollar
                            ? rules.callCalc(unit, coords, calcTemplate.template, context, env.contextVariable)
                            : rules.callFunc(fn, coords, [calcTemplate.template, context], fname, env.contextVariable);
                    } else {
                        let input = spliceTemplateInput(calcTemplate, values);
                        output = rules.callFunc(fn, coords, input, fname, env.contextVariable, unit);
                    }
                    return { value: getValue(output), extra: output?.extra };
                }
                let input = constantInput;
                if (input === null) {
                    if (fn.lazy) {
                        input = args.map(arg => (...lazy) => arg(env, lazy));
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
                                let { context, values } = evalTemplateHoles(t, env, e);
                                if (context) {
                                    input.push(calc(t.template, context));
                                } else {
                                    input.push(...spliceTemplateInput(t, values));
                                }
                                continue;
                            }
                            let v = arg.constant ? arg() : arg(env, e);
                            // composed arguments are already one value: never re-split
                            if (!arg.cluster && !arg.composed
                                && (typeof v === 'number' || typeof v === 'string')) {
                                input.push(...parseValueGroup(v, NO_SPACE));
                            } else if (!isNil(v)) {
                                input.push(getValue(v));
                            }
                        }
                        input = removeEmptyValues(input);
                    }
                }
                let output = rules.callFunc(fn, coords, input, fname, env.contextVariable, unit);
                if (output && output.gf) {
                    rules.addRule(':gf:', output.value, rules.rules);
                }
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
                        || ((env, extra) => compiledFn(env, extra, true).value));
                } else if (v.type === 'var') {
                    hasVarRead = true;
                    holes.push((parent && parent.name === '@var')
                        ? () => v.name
                        : env => env.rules.readVar(v.name, env.coords, env.contextVariable));
                } else {
                    holes.push(() => undefined);
                }
            }
            if (values.length === 1) {
                let single = holes[0];
                compiled = (env, extra) => {
                    env.coords.extra.push(extra);
                    let value = single(env, extra);
                    env.coords.extra.pop();
                    return value;
                };
            } else {
                compiled = (env, extra) => {
                    env.coords.extra.push(extra);
                    let value = segments[0];
                    for (let i = 0; i < holes.length; i++) {
                        let v = holes[i](env, extra);
                        // match Array#join: nil renders as nothing
                        if (v != null) value += v;
                        value += segments[i + 1];
                    }
                    env.coords.extra.pop();
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

function evalTemplateHoles({ holes, names, signSensitive }, env, extra) {
    let n = holes.length;
    let values = new Array(n);
    env.coords.extra.push(extra);
    for (let i = 0; i < n; i++) {
        values[i] = holes[i](env, extra);
    }
    env.coords.extra.pop();
    let context = {};
    for (let i = 0; i < n; i++) {
        let num = toPlainNumber(values[i]);
        if (num === null || (signSensitive[i] && isSignLeading(values[i]))) {
            return { values };
        }
        context[names[i]] = num;
    }
    return { context, values };
}

function spliceTemplate({ segments }, values) {
    let joined = segments[0];
    for (let i = 0; i < values.length; i++) {
        joined += values[i] + segments[i + 1];
    }
    return joined;
}

function spliceTemplateInput(calcTemplate, values) {
    let input;
    if (calcTemplate.singlePart) {
        let v = values[0];
        input = (typeof v === 'number' || typeof v === 'string')
            ? parseValueGroup(v, NO_SPACE)
            : (isNil(v) ? [] : [getValue(v)]);
    } else {
        input = [spliceTemplate(calcTemplate, values)];
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
        this.rules = new Map();
        this.scope = this.rules;
        this.ruleKeys = {};
        this.props = {};
        this.keyframes = new Map();
        this.grid = null;
        this.seed = null;
        this.isGridSet = false;
        this.isGapSet = false;
        this.uniforms = {};
        this.skips = new WeakSet();
        this.memo = new WeakMap();
        this.warnings = [];
        this.warned = new Set();
        this.ruleOrder = [];
        this.scanTokens(tokens);
        this.reset();
    }

    warn(message, node) {
        if (this.warned.has(message)) return;
        this.warned.add(message);
        this.warnings.push(node && node.index >= 0 ? { message, index: node.index } : { message });
    }

    reset() {
        this.styles = {
            host: '',
            container: '',
            cells: '',
            backdrop: '',
            keyframes: '',
            top: '',
            gf: [],
        }
        this.coords = [];
        this.nextId = nextId(this.instance);
        this.doodles = {};
        this.pattern = {};
        this.shaders = {};
        this.filters = {};
        this.content = {};
        this.vars = {};
        this.entries = new Map();
    }

    addRule(selector, rule, scope = this.scope) {
        let rules = scope.get(selector);
        if (!rules) {
            scope.set(selector, rules = []);
        }
        if (!rule) {
            return;
        }
        if (selector === ':top:' || selector === ':gf:' || selector === ':at:') {
            if (typeof rule === 'string') {
                let seen = this.ruleKeys[selector] ??= new Set();
                if (seen.has(rule)) {
                    return;
                }
                seen.add(rule);
            } else if (rules.includes(rule)) {
                return;
            }
        }
        if (Array.isArray(rule)) {
            rules.push(...rule);
        } else {
            rules.push(rule);
        }
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
        let context = {};
        for (let [name, key] of Object.entries(group)) {
            context[name.slice(2)] = key;
        }
        return context;
    }

    // the compiled-template variant of the $ branch in callFunc: the
    // expression is stable, the function results ride in as variables
    callCalc(unit, coords, template, holes, contextVariable = {}) {
        let hasVars = hasEntries(this.vars['host'])
            || hasEntries(this.vars['container'])
            || hasEntries(this.vars[coords.count])
            || hasEntries(contextVariable);
        let context = hasVars
            ? Object.assign(this.calcContext(coords.count, contextVariable), holes)
            : holes;
        return tidyNumber(calc(template, context)) + unit;
    }

    callFunc(fn, coords, input, fname, contextVariable = {}, unit = '') {
        let _fn = fn(coords);
        if (typeof _fn === 'function') {
            if (fname === '$') {
                let context = this.calcContext(coords.count, contextVariable);
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
    composeSelector(coords, selector = '&') {
        let base = coords.__selector ??= '#' + cellId(coords.x, coords.y, coords.z);
        let i = selector.indexOf('&');
        if (i < 0) return selector;
        let tail = selector.slice(i + 1);
        if (tail.includes('&')) tail = tail.replaceAll('&', base);
        return selector.slice(0, i) + base + tail;
    }

    readVar(value, coords, contextVariable) {
        let group = this.scopedVars(coords.count, contextVariable);
        if (group[value] !== undefined) {
            let result = String(group[value]).trim();
            if (result.startsWith('(') && result.endsWith(')')) {
                result = result.slice(1, -1);
            }
            return result.replace(/;+$/g, '');
        }
        return value;
    }

    composeComposable(fname, node, coords, selector, property) {
        let value = node.arguments.map(a => getValue(a.values[0])).join(',');
        if (!isNil(value) && value !== '') {
            switch (fname) {
                case 'doodle':
                    return this.composeDoodle(
                        this.injectVariables(value, coords.count), node.size,
                        coords.extra.length ? structuredClone(coords.extra) : undefined);
                case 'shaders':
                case 'pattern':
                    return this.composePaint(fname, value, coords, node.size, selector, property);
            }
        }
    }

    // a cond argument composed for the cell; composed and cluster values
    // stay boxed so they read as one argument
    composeArgument(argument, coords) {
        let compiled = compileArgument(argument);
        let value = compiled.constant
            ? compiled()
            : compiled({ rules: this, coords }, EMPTY_EXTRA);
        return (compiled.composed || compiled.cluster) ? { value } : value;
    }

    composeDoodle(doodle, arg, upextra) {
        let id = this.nextId('doodle');
        this.doodles[id] = { doodle, arg, upextra };
        return '${' + id + '}';
    }

    getTarget(selector, property, cellSelector) {
        let target = { selector: cellSelector, type: 'background' };
        if (isSpecialSelector(selector)) {
            target.selector = selector;
        } else if (property === '@content') {
            target.type = 'content';
        } else if (property === '@grid') {
            target.selector = ':host';
        }
        return target;
    }

    composePaint(fname, source, { x, y, z }, arg, selector, property) {
        // the renderer reads `shader` for shaders and `code` for patterns
        let isShader = fname === 'shaders';
        let id = this.nextId(isShader ? 'shader' : 'pattern');
        let cellSelector = cellId(x, y, z);
        this[isShader ? 'shaders' : 'pattern'][id] = {
            [isShader ? 'shader' : 'code']: source,
            target: this.getTarget(selector, property, cellSelector),
            arg,
            id: '--' + id,
            cell: cellSelector
        };
        return '${' + id + '}';
    }

    injectVariables(value, count) {
        let group = this.scopedVars(count);
        let variables = [];
        for (let [name, key] of Object.entries(group)) {
            variables.push(`${name}: ${key};`);
        }
        variables = variables.join('');
        if (variables.length) {
            return `:doodle {${variables}}` + value;
        }
        return value;
    }

    composeVariables(variables, coords, result = {}) {
        for (let [name, value] of Object.entries(variables)) {
            result[name] = this.getComposedValue(value, coords, result).value;
        }
        return result;
    }

    getComposedValue(value, coords, context, selector, property) {
        let extra;
        let group = [];
        if (Array.isArray(value)) {
            let env = { rules: this, coords, contextVariable: context || {}, selector, property };
            for (let v of value) {
                if (!Array.isArray(v)) continue;
                let composed = compileValue(v)(env);
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

    composeRule(token, coords, selector) {
        let info = this.memo.get(token);
        if (!info) {
            // static rules compose once per selector
            info = {
                flags: ruleFlags(token.property),
                cache: isStaticRule(token) ? new Map() : null,
            };
            this.memo.set(token, info);
        }
        if (!info.cache) {
            return this.composeRuleValue(token, coords, selector, info.flags);
        }
        let cached = info.cache.get(selector);
        if (cached === undefined) {
            cached = this.composeRuleValue(token, coords, selector, info.flags);
            info.cache.set(selector, cached);
        }
        return cached;
    }

    composeRuleValue(token, coords, selector, flags) {
        let prop = token.property;
        if (prop === '@seed') {
            return '';
        }
        let composed = this.getComposedValue(token.value, coords, {}, selector, prop);
        let extra = composed.extra;
        let value = composed.value;

        if (flags.animation) {
            this.props.hasAnimation = true;
            let { count } = coords;
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
            coords.hasBgsize = true;
        }

        let rule = `${prop}:${value};`

        if (flags.size) {
            if (!isSpecialSelector(selector)) {
                rule += `--_cell-${prop}:${value};`;
            }
        }

        if (flags.bgImage && isImageValue(value) && !coords.hasBgsize && !hasShorthandSize(value)) {
            let sizes = parseValueGroup(value, NO_SPACE)
                .map(v => isImageValue(v) ? 'cover' : 'auto')
                .join(',');
            rule += `background-size:${sizes};`;
        }

        if (flags.var) {
            this.composeVars(coords, selector, prop, value);
        }

        if (flags.at) {
            let name = flags.at;
            let transformed = Property[name](value, {
                isSpecialSelector: isSpecialSelector(selector),
                grid: coords.grid,
                maxGrid: coords.maxGrid,
                extra
            });

            switch (name) {
                case 'grid': {
                    if (isHostSelector(selector)) {
                        rule = transformed.size || '';
                        this.addGridStyle(transformed);
                    } else {
                        rule = '';
                        if (!this.isGridSet) {
                            transformed = Property[name](value, {
                                isSpecialSelector: true,
                                grid: coords.grid,
                                maxGrid: coords.maxGrid
                            });
                            this.addRule(':host', transformed.size || '');
                            this.addGridStyle(transformed);
                        }
                    }
                    this.grid = coords.grid;
                    this.isGridSet = true;
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
                    let key = this.composeSelector(coords);
                    if (transformed !== undefined && !isPseudoSelector(selector) && !isParentSelector(selector)) {
                        this.content[key] = removeQuotes(String(transformed));
                    }
                    this.content[key] = Func.raw({
                        rules: {
                            doodles: this.doodles
                        }
                    })(this.content[key] || '');
                    break;
                }
                case 'seed': {
                    rule = '';
                    break;
                }
                case 'place-cell':
                case 'place':
                case 'position':
                case 'offset': {
                    if (!isHostSelector(selector)) {
                        rule = transformed;
                    }
                    break;
                }
                case 'shape': {
                    rule = transformed ? `clip-path:${transformed};` : '';
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

    composeVars(coords, selector, prop, value) {
        let key = coords.count;
        if (isParentSelector(selector)) {
            key = 'container';
        }
        if (isHostSelector(selector)) {
            key = 'host';
        }
        if (!this.vars[key]) {
            this.vars[key] = {};
        }
        this.vars[key][prop] = value;
    }

    preComposeRule(token, coords, selector) {
        let prop = token.property;
        let context = this.scopedVars(coords.count);
        if (/^\-\-/.test(prop)) {
            let value = this.getComposedValue(token.value, coords, context, selector).value;
            this.composeVars(coords, selector, prop, value);
        }
        switch (prop) {
            case '@grid': {
                let value = this.getComposedValue(token.value, coords, context, selector).value;
                let transformed = Property['grid'](value, {
                    maxGrid: coords.maxGrid
                });
                this.grid = transformed.grid;
                break;
            }
        }
    }

    preCompose(coords) {
        if (isNil(this.seed)) {
            // get seed first
            for (let token of this.tokens) {
                if (token.type === 'rule' && token.property === '@seed') {
                    this.seed = token.rawValue();
                }
                if (token.type === 'pseudo' && isHostSelector(token.selectors[0])) {
                    for (let t of token.styles) {
                        if (t.type === 'rule' && t.property === '@seed') {
                            this.seed = t.rawValue();
                        }
                    }
                }
            }
        }
        if (this.seed) {
            coords.updateRandom(this.seed);
        }
        for (let token of this.tokens) {
            switch (token.type) {
                case 'rule': {
                    this.preComposeRule(token, coords)
                    break;
                }
                case 'pseudo': {
                    let [selector] = token.selectors;
                    if (isHostSelector(selector)) {
                        for (let style of token.styles) {
                            this.preComposeRule(style, coords, selector);
                        }
                    }
                    break;
                }
            }
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
        let compose = coords => join(token.steps.map(step => {
            let name = this.getComposedValue(step.name, coords).value;
            let styles = join(step.styles.map(s => this.composeRule(s, coords)));
            return `${name} {${styles}}`;
        }));
        let body = null;
        this.keyframes.set(token.name, {
            static: isStatic,
            compose: isStatic ? coords => body ??= compose(coords) : compose,
        });
    }

    condInfo(token) {
        let info = this.memo.get(token);
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
            this.memo.set(token, info);
        }
        return info;
    }

    // the selector text of a cond as written, arguments composed for the cell
    condSelector(token, coords) {
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
                let names = n.arguments.map(arg => getValue(this.composeArgument(arg, coords)));
                text += '(' + names.join(', ') + ')';
                dynamic ||= n.arguments.some(arg => !compileArgument(arg).constant);
            }
            keyword = n.keyword || '';
        }
        if (!dynamic) info.text = text;
        return text;
    }

    matchCond(token, coords) {
        let { fn, name, args, not } = this.condInfo(token);
        if (!fn) return;
        let input = [];
        if (args.length) {
            for (let arg of args) {
                let v = this.composeArgument(arg, coords);
                if (typeof v === 'number' || typeof v === 'string') {
                    input.push(...parseValueGroup(v, NO_SPACE));
                } else if (!isNil(v)) {
                    input.push(getValue(v));
                }
            }
            input = removeEmptyValues(input);
        }
        coords.position = token.position;
        let matched = this.callFunc(fn, coords, input, name);
        return not ? !matched : !!matched;
    }

    addCellRule(token, selector, coords, rule) {
        if (!rule) return;
        let entries = this.entries.get(token);
        if (!entries) {
            this.entries.set(token, entries = new Map());
        }
        let entry = entries.get(selector);
        if (!entry) {
            entries.set(selector, entry = { selector, coords: [], texts: [] });
        }
        entry.coords.push(coords);
        entry.texts.push(rule);
    }

    layoutCells() {
        let entries = [];
        for (let token of this.ruleOrder) {
            let m = this.entries.get(token);
            if (m) entries.push(...m.values());
        }
        let count = this.coords.length;

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
                    let n = e.coords[j].count - 1;
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
                    if (list) list.push(e.coords[j]);
                    else byText.set(texts[j], [e.coords[j]]);
                }
                for (let [text, cells] of byText) {
                    let list = cells.map(c => this.composeSelector(c, selector)).join(',');
                    sections[where] += `${list} {${text}}`;
                }
            }
        }
        let cells = '';
        for (let i = 0; i < count; i++) {
            for (let [selector, lists] of runText) {
                if (lists[i]) cells += `${this.composeSelector(this.coords[i], selector)} {${join(lists[i])}}`;
            }
        }
        return sections.before + cells + sections.after;
    }

    // a group at-rule composed for the cell: its rules collect in a scope
    // of their own, then print inside the prelude with nested groups last
    composeGroup(token, coords, selectors) {
        let outer = this.scope;
        let scope = this.scope = new Map();
        this.compose(coords, token.styles, selectors);
        let body = '';
        for (let [name, rule] of scope) {
            if (name !== ':at:' && rule.length) {
                body += `${specialName(name)} {${join(rule)}}`;
            }
        }
        body += join(scope.get(':at:'));
        this.scope = outer;
        return body ? `${this.condSelector(token, coords)} {${body}}` : '';
    }

    // selectors are the enclosing ones, '&' standing for the cell; rules
    // land under each of them, nested blocks carry their own resolved list
    compose(coords, tokens, selectors = CELL) {
        // nested calls (conds) run for the same cell
        if (!tokens) this.coords.push(coords);
        for (let token of (tokens || this.tokens)) {
            switch (token.type) {
                case 'rule': {
                    if (token.property === '@gap' && this.isGapSet) break;
                    if (token.property === '@grid' && this.isGridSet) break;
                    for (let selector of selectors) {
                        let rule = this.composeRule(token, coords, selector);
                        // cell rules wait for the sheet layout, unless they sit
                        // inside a group at-rule, which is a scope of its own
                        if (this.scope === this.rules && selector.includes('&') && !isSpecialSelector(selector)) {
                            this.addCellRule(token, selector, coords, rule);
                        } else {
                            this.addRule(this.composeSelector(coords, selector), rule);
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
                    this.compose(coords, token.styles, token.selectors);
                    break;
                }

                case 'cond': {
                    if (this.condInfo(token).raw) {
                        this.addRule(':top:', token.raw(), this.rules);
                        break;
                    }
                    let matched = this.matchCond(token, coords);
                    if (matched === undefined) {
                        this.addRule(':at:', this.composeGroup(token, coords, selectors));
                    } else if (matched) {
                        this.compose(coords, token.styles, selectors);
                    }
                    break;
                }

                case 'at-rule': {
                    this.addRule(':top:', token.value, this.rules);
                    break;
                }
            }
        }
    }

    output() {
        let keyframes = '';
        for (let [name, frames] of this.keyframes) {
            let cells = frames.static ? this.coords.slice(0, 1) : this.coords;
            for (let coords of cells) {
                let aname = this.composeAname(name, coords.count);
                keyframes += `@keyframes ${aname} {${frames.compose(coords)}}`;
            }
        }

        let groups = '';
        for (let [selector, rule] of this.rules) {
            if (selector === ':at:') {
                groups = join(rule);
            } else if (isParentSelector(selector)) {
                this.styles.container += `${specialName(selector)} {${join(rule)}}`;
            } else if (selector === ':top:') {
                this.styles.top += join(rule);
            } else if (selector === ':gf:') {
                this.styles.gf = rule;
            } else {
                let target = (selector === 'bd') ? 'backdrop'
                    : isHostSelector(selector) ? 'host' : 'cells';
                let value = join(rule).trim();
                if (value.length) {
                    this.styles[target] += `${specialName(selector)} {${value}}`;
                }
            }
        }

        // after the grid styles above (`cell {flex:1}`), the cell rules,
        // then the group at-rules
        this.styles.cells += this.layoutCells() + groups;

        if (this.uniforms.time) {
            let n = 'animation-name';
            let t = utime.ticks;
            let un = utime.name;
            let Un = UTime.name;
            this.styles.container += `:host,.host {animation:${timePrefix.animation};}`;
            this.styles.keyframes +=
                `@keyframes ${utime[n]} {from {--${un}:0} to {--${un}:${t}}}` +
                `@keyframes ${UTime[n]} {from {--${Un}:0} to {--${Un}:${t}}}`;
        }

        let { host, container, cells, backdrop, top, gf } = this.styles;
        let main = this.styles.keyframes + keyframes + container + host;

        return {
            props: this.props,
            styles: { main, cells, container, backdrop, gf, top, all: main + backdrop + cells },
            grid: this.grid,
            seed: this.seed,
            random: this.random,
            doodles: this.doodles,
            shaders: this.shaders,
            pattern: this.pattern,
            filters: this.filters,
            uniforms: this.uniforms,
            content: this.content,
            warnings: (this.tokens.warnings || []).concat(this.warnings),
        }
    }

}

function removeQuotes(input) {
    let remove = (input.startsWith('"') && input.endsWith('"'))
        || (input.startsWith("'") && input.endsWith("'"));
    if (remove) {
        return input.substring(1, input.length - 1);
    }
    return input;
}

export default function generateCss(tokens, gridSize, seedValue, maxGrid, seedRandom, upextra = [], instance = '') {
    let rules = new Rules(tokens, instance);
    let context = {};
    let R = createRandom(seedRandom || String(seedValue));
    let { rand, pick, shuffle, updateRandom } = R;

    rules.preCompose({
        x: 1, y: 1, z: 1, count: 1, context: {}, extra: [],
        grid: { x: 1, y: 1, z: 1, count: 1 },
        random: R.random, rand, pick, shuffle,
        maxGrid, updateRandom,
        seedValue,
        rules,
        upextra,
    });

    let { grid, seed } = rules;

    if (grid) {
        gridSize = grid;
    }

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
    rules.seed = seed;
    rules.random = R.random;
    rules.reset();

    let count = 0;
    function composeCell(x, y, z) {
        rules.compose({
            x, y, z,
            count: ++count, grid: gridSize, context, extra: [],
            rand, pick, shuffle,
            random: R.random, seed,
            maxGrid,
            upextra,
            rules,
        });
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
    return rules.output();
}
