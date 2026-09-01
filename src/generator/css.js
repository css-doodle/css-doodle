import Func, { MathFunc } from '../core/function.js';
import Property from '../core/property.js';
import Selector from '../core/selector.js';
import parseValueGroup from '../parser/parse-value-group.js';

import createRandom from '../core/random.js';
import { utime, UTime, timePrefix } from '../core/uniforms.js';
import gridStyleRules from './grid-style.js';

import { cellId } from '../utils/cell.js';
import { isNil, getValue } from '../utils/type.js';
import { uniqueId } from '../utils/fn.js';
import { join, makeArray, removeEmptyValues } from '../utils/list.js';
import {
    isHostSelector, isParentSelector, isSpecialSelector, isPseudoSelector
} from '../utils/selector.js';
import { css } from '../utils/tagged-template.js';


function isImageValue(value) {
    return String(value).includes('${') && /\$\{(shader|pattern|doodle)/.test(value);
}

const NO_SPACE = { noSpace: true };
const COMPOSABLE = new Set(['doodle', 'shaders', 'pattern']);

const funcCache = new Map();

function findFunc(name) {
    let fn = funcCache.get(name);
    if (fn === undefined) {
        fn = Func[name.startsWith('$') ? 'calc' : name] || MathFunc[name] || null;
        funcCache.set(name, fn);
    }
    return fn;
}

// Value compiler. Each value/function/argument node of the AST is
// compiled once into an evaluator closure; running a cell (or a @m
// iteration) then only executes closures — no AST re-walking, name
// lookups or static-argument parsing in the hot path. Compiled
// evaluators are keyed by AST node and shared across generations;
// everything stateful comes in through the env:
//
//   env = { rules, coords, contextVariable, selector }
//
// so the Rules instance stays the interpreter and function.js stays a
// plain callee.

const EMPTY_EXTRA = [];
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

// func node → (env, extra, inArgument) => { value, extra? }
function compileFunc(node) {
    let compiled = compiledFuncs.get(node);
    if (compiled === undefined) {
        let fname = node.name.slice(1);
        let fn = findFunc(fname);
        if (typeof fn !== 'function') {
            // unrecognized functions read as literal text
            let literal = { value: node.name };
            compiled = () => literal;
        } else {
            let composable = COMPOSABLE.has(fname);
            let args = node.arguments.map(arg => compileArgument(arg, node));
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
                rules.checkUniforms(fname);
                if (composable) {
                    let composed = rules.composeComposable(fname, node, coords, env.selector);
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
                let output = rules.callFunc(fn, coords, input, fname, env.contextVariable);
                if (output && output.gf) {
                    rules.addRule(':gf:', output.value);
                }
                return { value: getValue(output), extra: output?.extra };
            };
        }
        compiledFuncs.set(node, compiled);
    }
    return compiled;
}

// argument node → (env, extra) => raw value. Compile-time facts ride on
// the evaluator: .cluster, .constant (single literal), .composed
// (multi-part, its value never re-splits), .split (pre-parsed inputs)
function compileArgument(argument, parent) {
    let compiled = compiledArguments.get(argument);
    if (compiled === undefined) {
        let { values } = argument;
        let isVarRead = v => v.type === 'text' && /^\-\-\w/.test(v.value);
        if (values.length === 1 && values[0].type === 'text' && !isVarRead(values[0])) {
            let value = values[0].value;
            let type = typeof value;
            compiled = () => value;
            compiled.constant = true;
            if (!argument.cluster && (type === 'number' || type === 'string')) {
                compiled.split = parseValueGroup(value, NO_SPACE);
            }
        } else {
            let parts = values.map(v => {
                if (v.type === 'text') {
                    if (isVarRead(v)) {
                        if (parent && parent.name === '@var') {
                            return () => v.value;
                        }
                        return env => env.rules.readVar(v.value, env.coords, env.contextVariable);
                    }
                    let text = v.value;
                    return () => text;
                }
                if (v.type === 'func') {
                    let compiledFn = compileFunc(v);
                    return (env, extra) => compiledFn(env, extra, true).value;
                }
                return () => undefined;
            });
            if (parts.length === 1) {
                let single = parts[0];
                compiled = (env, extra) => {
                    env.coords.extra.push(extra);
                    let value = single(env, extra);
                    env.coords.extra.pop();
                    return value;
                };
            } else {
                compiled = (env, extra) => {
                    env.coords.extra.push(extra);
                    let value = parts.map(part => part(env, extra)).join('');
                    env.coords.extra.pop();
                    return value;
                };
                compiled.composed = true;
            }
        }
        compiled.cluster = argument.cluster;
        compiledArguments.set(argument, compiled);
    }
    return compiled;
}

function isStaticRule(token) {
    let prop = token.property;
    if (prop.startsWith('@') || prop.startsWith('--')) return false;
    if (prop.startsWith('animation')) return false;
    if (prop === 'background-size') return false;
    return token.value?.hasFunc === false;
}

function ruleFlags(prop) {
    return {
        animation: /^animation(-[a-z]+)*$/.test(prop),
        size: prop === 'width' || prop === 'height',
        bgImage: /^background(\-image)?$/.test(prop),
        var: prop.startsWith('--'),
        at: (prop.startsWith('@') && Property[prop.slice(1)]) ? prop.slice(1) : null,
        gridLike: /^grid/.test(prop),
    };
}

class Rules {

    constructor(tokens) {
        this.tokens = tokens;
        this.rules = new Map();
        this.ruleKeys = {};
        this.props = {};
        this.keyframes = {};
        this.grid = null;
        this.seed = null;
        this.isGridSet = false;
        this.isGapSet = false;
        this.uniforms = {};
        this.skips = new WeakSet();
        this.memo = new WeakMap();
        this.reset();
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
        this.doodles = {};
        this.pattern = {};
        this.shaders = {};
        this.filters = {};
        this.content = {};
        this.vars = {};
        for (let key of this.rules.keys()) {
            if (key.startsWith('#c')) {
                this.rules.delete(key);
            }
        }
    }

    addRule(selector, rule) {
        let rules = this.rules.get(selector);
        if (!rules) {
            this.rules.set(selector, rules = []);
        }
        if (!rule) {
            return;
        }
        if (selector === ':top:' || selector === ':gf:') {
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

    applyFunc(fn, coords, args, fname, contextVariable = {}) {
        let input = [];
        for (let arg of args) {
            let type = typeof arg.value;
            if (!arg.cluster && (type === 'number' || type === 'string')) {
                input.push(...parseValueGroup(arg.value, NO_SPACE));
            }
            else if (typeof arg === 'function') {
                input.push(arg);
            }
            else if (!isNil(arg.value)) {
                input.push(getValue(arg.value));
            }
        }
        input = removeEmptyValues(input);
        return this.callFunc(fn, coords, input, fname, contextVariable);
    }

    callFunc(fn, coords, input, fname, contextVariable = {}) {
        let _fn = fn(coords);
        if (typeof _fn === 'function') {
            if (fname.startsWith('$')) {
                let group = this.scopedVars(coords.count, contextVariable);
                let context = {};
                let unit = '';
                for (let [name, key] of Object.entries(group)) {
                    context[name.slice(2)] = key;
                }
                if (fname.length > 1) {
                    unit = fname.split('$')[1] ?? '';
                }
                return _fn(input, context) + unit;
            }
            return _fn(...input);
        }
        return _fn;
    }

    composeAname(...args) {
        return args.join('-');
    }

    composeSelector(coords, pseudo = '') {
        let base = coords.__selector;
        if (!base) {
            base = coords.__selector = '#' + cellId(coords.x, coords.y, coords.z);
        }
        return pseudo ? (base + pseudo) : base;
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

    composeComposable(fname, node, coords, selector) {
        let parts = (node.arguments || []).map(a => getValue((a.values || [])[0]));
        let temp;
        if (parts.length && /^\d/.test(parts[0])) {
            temp = parts[0];
            parts = parts.slice(1);
        }
        let value = parts.join(',');
        if (!isNil(value) && value !== '') {
            switch (fname) {
                case 'doodle':
                    return this.composeDoodle(
                        this.injectVariables(value, coords.count), temp,
                        coords.extra.length ? structuredClone(coords.extra) : undefined);
                case 'shaders':
                case 'pattern':
                    return this.composePaint(fname, value, coords, temp, selector);
            }
        }
    }

    composeArgument(argument, coords, extra = [], parent, contextVariable, selector) {
        let compiled = compileArgument(argument, parent);
        let value = compiled.constant
            ? compiled()
            : compiled({ rules: this, coords, contextVariable, selector }, extra);
        // the wrapped shape applyFunc interprets: composed values stay boxed
        // so they read as one argument
        return {
            cluster: compiled.cluster,
            value: compiled.composed ? { value } : value,
        };
    }

    composeDoodle(doodle, arg, upextra) {
        let id = uniqueId('doodle');
        this.doodles[id] = { doodle, arg, upextra };
        return '${' + id + '}';
    }

    getTarget(selector, cellSelector) {
        let target = {
            selector: 'cell',
            type: 'background'
        };
        if (selector && selector.property === '@content') {
            target.type = 'content';
        } else if (selector && selector.property === '@grid') {
            target.selector = ':host';
        } else if (isSpecialSelector(selector)) {
            target.selector = selector;
        }
        if (target.selector === 'cell') {
            target.selector = cellSelector;
        }
        return target;
    }

    composePaint(fname, source, { x, y, z }, arg, selector) {
        // the renderer reads `shader` for shaders and `code` for patterns
        let isShader = fname === 'shaders';
        let id = uniqueId(isShader ? 'shader' : 'pattern');
        let cellSelector = cellId(x, y, z);
        this[isShader ? 'shaders' : 'pattern'][id] = {
            [isShader ? 'shader' : 'code']: source,
            target: this.getTarget(selector, cellSelector),
            arg,
            id: '--' + id,
            cell: cellSelector
        };
        return '${' + id + '}';
    }

    checkUniforms(name) {
        switch (name) {
            case 'ut': case 'UT': case 't': case 'T': case 'ts': case 'TS':
                this.uniforms.time = true; break;
            case 'ux': this.uniforms.mousex = true; break;
            case 'uy': this.uniforms.mousey = true; break;
            case 'uw': this.uniforms.width = true; break;
            case 'uh': this.uniforms.height = true; break;
            case 'shaders': this.uniforms.mouse = true; break;
        }
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

    composeValue(value, coords, contextVariable = {}, selector) {
        if (!Array.isArray(value)) {
            return {
                value: '',
                extra: '',
            }
        }
        return compileValue(value)({ rules: this, coords, contextVariable, selector });
    }

    getComposedValue(value, coords, context, selector) {
        let extra;
        let group = [];
        if (Array.isArray(value)) {
            let ctx = context || {};
            for (let v of value) {
                let composed = this.composeValue(v, coords, ctx, selector);
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
            info = {
                static: isStaticRule(token),
                flags: ruleFlags(token.property),
                cache: null,
            };
            this.memo.set(token, info);
        }
        if (!info.static) {
            return this.composeRuleValue(token, coords, selector, info.flags);
        }
        if (!info.cache) {
            info.cache = new Map();
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
        let composed = this.getComposedValue(token.value, coords, {}, selector);
        let extra = composed.extra;
        let value = composed.value;

        if (flags.animation) {
            this.props.hasAnimation = true;

            if (isHostSelector(selector)) {
                let prefix = timePrefix[prop];
                if (prefix && value) {
                    value = prefix + ',' + value;
                }
            }

            if (coords.count > 1) {
                let { count } = coords;
                switch (prop) {
                    case 'animation-name': {
                        value = composed.group
                            .map(n => this.composeAname(n, count))
                            .join(',');
                        break;
                    }
                    case 'animation': {
                        value = composed.group
                            .map(n => {
                                let group = (n || '').split(/\s+/);
                                group[0] = this.composeAname(group[0], count);
                                return group.join(' ');
                            })
                            .join(',');
                    }
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
      return css`
        ${reset.size ? `counter-reset:${Array.from(reset.values()).join(' ')};` : ''}
        content:${value};
      `;
    }

    if (prop === 'transition') {
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

    if (flags.bgImage && isImageValue(value)) {
      let sizes = parseValueGroup(value, NO_SPACE)
        .map(v => isImageValue(v) ? 'cover' : 'auto')
        .join(',');
      if (!coords.hasBgsize) {
        rule = `background-size:${sizes};` + rule;
      }
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
            this.addRule(':container', `gap:${transformed};`);
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
        case 'use': {
          if (token.value.length) {
            this.compose(coords, token.value);
          }
          rule = '';
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

  preComposeRule(token, _coords, selector) {
    let coords = Object.assign({}, _coords);
    let prop = token.property;
    let context = this.scopedVars(coords.count);
    if (/^\-\-/.test(prop)) {
      let value = this.getComposedValue(token.value, coords, context, selector).value;
      this.composeVars(_coords, selector, prop, value);
    }
    switch (prop) {
      case '@grid': {
        let value = this.getComposedValue(token.value, coords, context, selector).value;
        let transformed = Property['grid'](value, {
          maxGrid: _coords.maxGrid
        });
        this.grid = transformed.grid;
        break;
      }
      case '@use': {
        if (token.value.length) {
          this.preCompose(coords, token.value);
        }
        break;
      }
    }
  }

  preCompose(coords, tokens) {
    if (isNil(this.seed)) {
      // get seed first
      ;(tokens || this.tokens).forEach(token => {
        if (token.type === 'rule' && token.property === '@seed') {
          this.seed = token.rawValue();
        }
        if (token.type === 'pseudo' && isHostSelector(token.selector)) {
          for (let t of makeArray(token.styles)) {
            if (t.type === 'rule' && t.property === '@seed') {
              this.seed = t.rawValue();
            }
          }
        }
      });
    }
    if (!tokens && this.seed) {
      coords.updateRandom(this.seed);
    }
    ;(tokens || this.tokens).forEach(token => {
      switch (token.type) {
        case 'rule': {
          this.preComposeRule(token, coords)
          break;
        }
        case 'pseudo': {
          if (isHostSelector(token.selector)) {
            (token.styles || []).forEach(token => {
              this.preComposeRule(token, coords, token.selector);
            });
          }
          break;
        }
      }
    });
  }

  composeCond(token, coords) {
    let composedSelector = token.name + ' ' + token.segments.map(n => {
      if (n.keyword) return n.keyword;
      if (Array.isArray(n.arguments)) {
        let names = n.arguments.map(arg => {
          return this.composeArgument(arg, coords).value;
        }).join(', ');
        return '(' + names + ')';
      }
      return '';
    }).join(' ');

    let rules = '';

    token.styles.forEach(t => {
      if (t.type === 'rule') {
        rules += this.composeRule(t, coords);
      }
      if (t.type === 'pseudo' && t.selector) {
        for (let selector of t.selectors) {
          let styles = join(t.styles.map(s => this.composeRule(s, coords, selector)));
          rules += `${this.composeSelector(coords, selector)} {${styles}}`;
        }
      }
      if (t.type === 'cond') {
        rules += this.composeCond(t, coords);
      }
    });
    return `${composedSelector} {${rules}}`;
  }

  compose(coords, tokens) {
    this.coords.push(coords);
    for (let token of (tokens || this.tokens)) {
      if (this.skips.has(token)) continue;
      if (token.property === '@gap' && this.isGapSet) {
        continue;
      }
      if (token.property === '@grid' && this.isGridSet) {
        continue;
      }
      switch (token.type) {
        case 'rule': {
          this.addRule(
            this.composeSelector(coords),
            this.composeRule(token, coords, token)
          );
          break;
        }

        case 'pseudo': {
          let special = isSpecialSelector(token.selector);
          if (special) {
            this.skips.add(token);
          }
          token.selectors.forEach(selector => {
            let composed = special
              ? selector
              : this.composeSelector(coords, selector);

            token.styles.forEach(s => {
              if (s.type === 'rule') {
                this.addRule(composed, this.composeRule(s, coords, selector));
              }
              if (s.type === 'pseudo') {
                let result = s.styles.map(_s =>
                  this.composeRule(_s, coords, composed)
                );
                this.addRule(composed + s.selector, result);
              }
              if (s.type === 'cond' && s.name.startsWith('&')) {
                let result = s.styles.map(_s =>
                  this.composeRule(_s, coords, composed)
                ).join('');
                this.addRule(composed, s.name + '{' + result + '}');
              }
            });
          });

          break;
        }

        case 'cond': {
          let name = token.name.slice(1);
          let fn = Selector[name];
          if (fn) {
            let group = token.segments.find(n => n.arguments);
            let args = group
              ? group.arguments.map(arg => this.composeArgument(arg, coords))
              : [];
            coords.position = token.position;
            let cond = this.applyFunc(fn, coords, args, name);
            if (token.segments && token.segments[0] && token.segments[0].keyword === 'not') {
              cond = !cond;
            }
            if (cond) {
              this.compose(coords, token.styles);
            }
          } else {
            this.addRule(':top:', this.composeCond(token, coords));
          }
          break;
        }

        case 'keyframes': {
          if (!this.keyframes[token.name]) {
            const composeSteps = coords => css`
              ${join(token.steps.map(step => css`
                ${this.getComposedValue(step.name, coords).value} {
                  ${join(step.styles.map(s => this.composeRule(s, coords)))}
                }
              `))}
            `;
            // a keyframes body without functions reads the same for
            // every cell; compose it once
            let isStatic = token.steps.every(step =>
              step.name.hasFunc === false
              && step.styles.every(isStaticRule));
            if (isStatic) {
              let body = null;
              this.keyframes[token.name] = coords => body ??= composeSteps(coords);
            } else {
              this.keyframes[token.name] = composeSteps;
            }
          }
          break;
        }

        case 'at-rule': {
          this.addRule(':top:', token.value);
          break;
        }
      }
    }
  }

  output() {
    for (let [selector, rule] of this.rules) {
      if (isParentSelector(selector)) {
        let name = selector.replace(/^:container\(?/, 'cssd-grid').replace(/\)?$/, '');
        this.styles.container += `${name} {${join(rule)}}`;
      } else if (selector === ':top:') {
        this.styles.top += join(rule);
      } else if (selector === ':gf:') {
        this.styles.gf = rule;
      } else {
        let target = (selector === 'cssd-b') ? 'backdrop'
          : isHostSelector(selector) ? 'host' : 'cells';
        let value = join(rule).trim();
        if (value.length) {
          let name = (target === 'host') ? `${selector},.host` : selector;
          this.styles[target] += `${name} {${value}}`;
        }
      }
    }

    if (this.uniforms.time) {
      let n = 'animation-name';
      let t = utime.ticks;
      let un = utime.name;
      let Un = UTime.name;
      this.styles.container += css`
        :host,.host {
          animation:${timePrefix.animation};
        }
      `;
      this.styles.keyframes += css`
        @keyframes ${utime[n]} {
          from {--${un}:0} to {--${un}:${t}}
        }
        @keyframes ${UTime[n]} {
          from {--${Un}:0} to {--${Un}:${t}}
        }
      `;
    }

    this.coords.forEach((coords, i) => {
      for (let [name, keyframe] of Object.entries(this.keyframes)) {
        let aname = this.composeAname(name, coords.count);
        this.styles.keyframes += css`
          ${i === 0 ? `@keyframes ${name} {${keyframe(coords)}}` : ''}
          @keyframes ${aname} {${keyframe(coords)}}
        `;
      }
    });

    let { keyframes, host, container, cells, backdrop, top, gf } = this.styles;
    // container before host, so a host animation with its prefixed
    // time-uniform entries overrides the standalone time animation
    let main = keyframes + container + host;

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

export default function generateCss(tokens, gridSize, seedValue, maxGrid, seedRandom, upextra = []) {
  let rules = new Rules(tokens);
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

  let { grid, seed } = rules.output();

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
