export function isNil(s) {
    return s === undefined || s === null;
}

export function isInvalidNumber(v) {
    return isNil(v) || Number.isNaN(v);
}

export function isEmpty(value) {
    return isNil(value) || value === '';
}

export function isLetter(c) {
    return /^[a-zA-Z]$/.test(c);
}

export function removeQuotes(text) {
    text = String(text);
    let q = text[0];
    if ((q === '"' || q === "'") && text.endsWith(q)) {
        return text.substring(1, text.length - 1);
    }
    return text;
}

export function getValue(input) {
    if (typeof input === 'string' || typeof input === 'number') {
        return input;
    }
    if (input && typeof input === 'object' && 'value' in input) {
        return input.value ?? '';
    }
    return input ?? '';
}
