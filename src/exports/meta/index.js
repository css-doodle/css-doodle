import Func, { MathFunc, alias as functionAlias } from '../../core/function.js';
import Selector, { alias as selectorAlias } from '../../core/selector.js';
import Property, { alias as propertyAlias } from '../../core/property.js';
import { operators } from '../../core/calc.js';

function canonical(registry, alias) {
    return Object.keys(registry).filter(n => !Object.hasOwn(alias, n)).sort();
}

// @-functions: canonical names plus the alias → target map
export const functions = {
    names: canonical(Func, functionAlias),
    alias: { ...functionAlias },
};

// JS Math members exposed as @-functions
export const mathFunctions = Object.keys(MathFunc).sort();

// & / @-cond selectors
export const selectors = {
    names: canonical(Selector, selectorAlias),
    alias: { ...selectorAlias },
};

// @-properties
export const properties = {
    names: canonical(Property, propertyAlias),
    alias: { ...propertyAlias },
};

// calc / $ operator precedence, higher binds tighter
export const calcOperators = Object.fromEntries(
    Object.entries(operators).filter(([name]) => name !== '(' && name !== ')')
);
