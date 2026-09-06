export function placeholder(id) {
    return '${' + id + '}';
}

export const RE_PLACEHOLDER = /\$\{([^}]*)\}/g;

export function hasPlaceholder(text) {
    return text.includes('${') && text.search(RE_PLACEHOLDER) >= 0;
}

export function placeholderId(text) {
    return (text.startsWith('${') && text.endsWith('}')) ? text.slice(2, -1) : undefined;
}
