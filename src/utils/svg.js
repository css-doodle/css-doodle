export const NS = `xmlns="http://www.w3.org/2000/svg"`;
export const NSXHtml = `xmlns="http://www.w3.org/1999/xhtml"`;
export const NSXLink = `xmlns:xlink="http://www.w3.org/1999/xlink"`;

export const FilterHolderStyle = 'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none';

export function createSvgUrl(svg, id) {
    let encoded = encodeURIComponent(svg) + (id ? `#${ id }` : '');
    return `url("data:image/svg+xml;utf8,${ encoded }")`;
}

export function normalizeSvg(input) {
    if (!input.includes('<svg')) {
        input = `<svg ${NS} ${NSXLink}>${input}</svg>`;
    }
    if (!input.includes('xmlns')) {
        input = input.replace(/<svg([\s>])/, `<svg ${NS} ${NSXLink}$1`);
    }
    return input;
}
