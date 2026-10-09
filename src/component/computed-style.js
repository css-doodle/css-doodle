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

export function getRgbaColor(root, value, space = 'srgb') {
    if (!CSS.supports('color', value)) {
        return null;
    }
    let element = root.querySelector('style') || root.appendChild(document.createElement('style'));
    element.style.color = `color-mix(in ${space}, ${value} 100%, transparent)`;
    let rgba = getComputedStyle(element).color.match(/-?[\d.]+(e-?\d+)?/gi);
    if (!rgba) return null;
    let [r, g, b, a = 1] = rgba.map(Number);
    return [r, g, b, a];
}
