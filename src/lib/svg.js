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

// the camelCase names of SVG, keyed by their lowercase spelling
const NAMES = 'animateMotion animateTransform clipPath feBlend feColorMatrix feComponentTransfer '
    + 'feComposite feConvolveMatrix feDiffuseLighting feDisplacementMap feDistantLight '
    + 'feDropShadow feFlood feFuncA feFuncB feFuncG feFuncR feGaussianBlur feImage feMerge '
    + 'feMergeNode feMorphology feOffset fePointLight feSpecularLighting feSpotLight '
    + 'feTile feTurbulence foreignObject linearGradient radialGradient textPath '
    + 'attributeName attributeType baseFrequency calcMode clipPathUnits diffuseConstant '
    + 'edgeMode filterUnits gradientTransform gradientUnits kernelMatrix kernelUnitLength '
    + 'keyPoints keySplines keyTimes lengthAdjust limitingConeAngle markerHeight '
    + 'markerUnits markerWidth maskContentUnits maskUnits numOctaves pathLength '
    + 'patternContentUnits patternTransform patternUnits pointsAtX pointsAtY pointsAtZ '
    + 'preserveAlpha preserveAspectRatio primitiveUnits refX refY repeatCount repeatDur '
    + 'requiredExtensions specularConstant specularExponent spreadMethod startOffset '
    + 'stdDeviation stitchTiles surfaceScale systemLanguage tableValues targetX targetY '
    + 'textLength viewBox xChannelSelector yChannelSelector';

const tagsMapping = new Map(NAMES.split(' ').map(name => [name.toLowerCase(), name]));

export function adjustName(name) {
    name = name.toLowerCase();
    return tagsMapping.get(name) || name;
}

export function isSpecialNamespaceAttr(name) {
    return /^(xlink:(actuate|arcrole|href|role|show|title|type)|xml:(base|lang|space))$/i.test(name);
}

export function isDefinitionTag(tagName) {
    return /^(linearGradient|radialGradient|pattern|filter|clipPath|mask|marker|symbol)$/.test(tagName);
}
