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

export function getValue(input) {
    if (typeof input === 'string' || typeof input === 'number') {
        return input;
    }
    let v = input;
    while (v && !isNil(v.value)) v = v.value;
    if (typeof v == 'object' && 'value' in v) {
        return v.value ?? '';
    }
    return v ?? '';
}
