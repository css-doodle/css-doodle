import Func, { MathFunc, alias as functionAlias } from '../../core/function.js';
import Selector, { alias as selectorAlias } from '../../core/selector.js';
import Property, { alias as propertyAlias } from '../../core/property.js';
import { operators } from '../../core/calc.js';

function canonical(registry, alias) {
    return Object.keys(registry).filter(n => !Object.hasOwn(alias, n)).sort();
}

function variants(registry, names) {
    let result = {};
    for (let name of names) {
        let fn = registry[name];
        let list = Object.keys(fn).filter(key => typeof fn[key] === 'function').sort();
        if (list.length) result[name] = list;
    }
    return result;
}

const functionNames = canonical(Func, functionAlias);
export const functions = {
    names: functionNames,
    alias: { ...functionAlias },
    variants: variants(Func, functionNames),
};

export const mathFunctions = Object.keys(MathFunc).sort();

export const selectors = {
    names: canonical(Selector, selectorAlias),
    alias: { ...selectorAlias },
};

export const properties = {
    names: canonical(Property, propertyAlias),
    alias: { ...propertyAlias },
};

export const calcOperators = Object.fromEntries(
    Object.entries(operators).filter(([name]) => name !== '(' && name !== ')')
);
