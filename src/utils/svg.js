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

// the camelCase svg names, keyed by their lowercase form
const NAMES = 'altGlyph altGlyphDef altGlyphItem animateColor animateMotion '
    + 'animateTransform clipPath feBlend feColorMatrix feComponentTransfer '
    + 'feComposite feConvolveMatrix feDiffuseLighting feDisplacementMap '
    + 'feDistantLight feDropShadow feFlood feFuncA feFuncB feFuncG feFuncR '
    + 'feGaussianBlur feImage feMerge feMergeNode feMorphology feOffset '
    + 'fePointLight feSpecularLighting feSpotLight feTile feTurbulence '
    + 'foreignObject glyphRef linearGradient radialGradient textPath attributeName '
    + 'attributeType baseFrequency baseProfile calcMode clipPathUnits '
    + 'contentScriptType contentStyleType diffuseConstant edgeMode '
    + 'externalResourcesRequired filterRes filterUnits gradientTransform '
    + 'gradientUnits kernelMatrix kernelUnitLength keyPoints keySplines keyTimes '
    + 'lengthAdjust limitingConeAngle markerHeight markerUnits markerWidth '
    + 'maskContentUnits maskUnits numOctaves pathLength patternContentUnits '
    + 'patternTransform patternUnits pointsAtX pointsAtY pointsAtZ preserveAlpha '
    + 'preserveAspectRatio primitiveUnits refX refY repeatCount repeatDur '
    + 'requiredExtensions requiredFeatures specularConstant specularExponent '
    + 'spreadMethod startOffset stdDeviation stitchTiles surfaceScale '
    + 'systemLanguage tableValues targetX targetY textLength viewBox viewTarget '
    + 'xChannelSelector yChannelSelector zoomAndPan';

const tagsMapping = new Map(NAMES.split(' ').map(name => [name.toLowerCase(), name]));

export function adjustName(name) {
    name = name.toLowerCase();
    return tagsMapping.get(name) || name;
}

const SPECIAL_NAMESPACE_PREFIXES = [
    'xlink:actuate', 'xlink:arcrole', 'xlink:href', 'xlink:role',
    'xlink:show',    'xlink:title',   'xlink:type',
    'xml:base',      'xml:lang',      'xml:space',
];

export function isSpecialNamespaceAttr(name) {
    return SPECIAL_NAMESPACE_PREFIXES.includes(name.toLowerCase());
}
