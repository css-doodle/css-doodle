import { removeParens } from '../lib/type.js';

export function getVariable(element, name) {
    return removeParens(getComputedStyle(element).getPropertyValue(name).trim());
}

export function getAllVariables(element) {
    if (typeof getComputedStyle === 'undefined') {
        return '';
    }
    let styles = getComputedStyle(element);
    let result = [];
    for (let prop of styles) {
        if (prop.startsWith('--')) {
            result.push(prop + ':' + styles.getPropertyValue(prop));
        }
    }
    return result.join(';');
}

export function getRgbaColor(root, value) {
    if (!CSS.supports('color', value)) {
        return null;
    }
    let element = root.querySelector('style');
    if (!element) {
        return [0, 0, 0, 1];
    }
    element.style.color = `color-mix(in srgb, ${value} 100%, transparent)`;
    let [r, g, b, a = 1] = getComputedStyle(element).color.match(/-?[\d.]+/g).map(Number);
    return [r, g, b, a];
}
