export function getVariable(element, name) {
    return getComputedStyle(element).getPropertyValue(name)
        .trim()
        .replace(/^\(|\)$/g, '');
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
        return { r: 0, g: 0, b: 0, a: 1 }
    }
    element.style.color = value;
    return splitRgba(getComputedStyle(element).color);
}

function splitRgba(color) {
    let [r, g, b, a = 1] = color
        .replace(/rgba?\((.+)\)/, '$1')
        .split(/,\s*/)
    return {r, g, b, a};
}

