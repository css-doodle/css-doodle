import { nextId } from '../lib/fn.js';
import { isNil, removeQuotes } from '../lib/type.js';
import { NS, NSXLink, adjustName, isDefinitionTag } from '../lib/svg.js';
import parseValueGroup from '../parser/parse-value-group.js';
import { getEasingPoints } from '../core/easing.js';

const nextInlineId = nextId();
const noop = () => {};

class Tag {
    constructor(name, value = '') {
        if (!name) {
            throw new Error("Tag name is required");
        }
        this.id = Symbol();
        this.name = name;
        this.body = [];
        this.attrs = Object.create(null);
        if (this.isTextNode()) {
            this.body = value;
        }
    }
    isTextNode() {
        return this.name === 'text-node';
    }
    find(target) {
        let id = target.attrs.id;
        let name = target.name;
        if (Array.isArray(this.body) && id !== undefined) {
            return this.body.find(tag => tag.attrs.id === id && tag.name === name);
        }
    }
    findSpareDefs() {
        return this.body.find(n => n.name === 'defs' && !n.attrs.id);
    }
    append(tags) {
        if (!Array.isArray(tags)) {
            tags = [tags];
        }
        for (let tag of tags) {
            if (!this.isTextNode()) {
                this.body.push(tag);
            }
        }
    }
    merge(tag) {
        for (let [name, value] of Object.entries(tag.attrs)) {
            this.attrs[name] = value;
        }
        if (Array.isArray(tag.body)) {
            this.body.push(...tag.body);
        }
    }
    attr(name, value) {
        if (!this.isTextNode()) {
            if (value === undefined) {
                return this.attrs[name];
            }
            // SMIL spells it indefinite
            if (name === 'repeatCount' && value === 'infinite') {
                value = 'indefinite';
            }
            return this.attrs[name] = value;
        }
    }
    toString() {
        if (this.isTextNode()) {
            return escapeText(removeQuotes(this.body));
        }
        let open = '<' + this.name;
        for (let name in this.attrs) {
            open += ' ' + name + '="' + escapeAttr(removeQuotes(this.attrs[name])) + '"';
        }
        let content = '';
        for (let tag of this.body) {
            content += typeof tag === 'string' ? escapeText(tag) : tag.toString();
        }
        if (content.length || /svg/i.test(this.name)) {
            return open + '>' + content + '</' + this.name + '>';
        }
        return open + '/>';
    }
}

// leaves XML's own references and raw markup inside `content:` alone
const RE_AMP = /&(?!(#\d+|#x[0-9a-fA-F]+|amp|lt|gt|quot|apos);)/g;
const RE_LT_TEXT = /<(?![a-zA-Z\/!?])/g;

function escapeText(text) {
    text = String(text);
    if (text.indexOf('&') < 0 && text.indexOf('<') < 0) return text;
    return text.replace(RE_AMP, '&amp;').replace(RE_LT_TEXT, '&lt;');
}

function escapeAttr(text) {
    text = String(text);
    if (text.indexOf('&') < 0 && text.indexOf('<') < 0 && text.indexOf('"') < 0) return text;
    return text.replace(RE_AMP, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
}

function transformViewBox(token, warn) {
    let viewBox = token.detail.value;
    let p = token.detail.padding || token.detail.p || token.detail.expand;
    // `viewBox: 10` is `0 0 10 10`, `viewBox: 10 5` is `0 0 10 5`
    if (viewBox.length === 1) {
        viewBox = [0, 0, viewBox[0], viewBox[0]];
    } else if (viewBox.length === 2) {
        viewBox = [0, 0, viewBox[0], viewBox[1]];
    }
    if (viewBox.length !== 4) {
        warn(`viewBox needs 1, 2 or 4 numbers, got "${token.value}"`);
        return '';
    }
    let [x, y, w, h] = viewBox;
    if (p) {
        [x, y, w, h] = [x-p, y-p, w+p*2, h+p*2];
    }
    return `${x} ${y} ${w} ${h}`;
}

function timing(animate, value, label, warn) {
    let times = [], repeatCount, fill, calcMode, spline;
    for (let word of parseValueGroup(value)) {
        if (word === 'infinite' || word === 'indefinite') {
            repeatCount = 'indefinite';
        } else if (/^\d*\.?\d+(m?s|min|h)?$/.test(word)) {
            times.push(word);
        } else if (word === 'forwards' || word === 'freeze') {
            fill = 'freeze';
        } else if (word === 'discrete' || word === 'paced' || word === 'step-end') {
            calcMode = word === 'step-end' ? 'discrete' : word;
        } else if (word !== 'linear') {
            let points = getEasingPoints(word);
            if (points) {
                spline = points.join(' ');
            } else {
                warn(`${label}: unknown timing word "${word}"`);
            }
        }
    }
    // a bare number beside a duration is the repeat count, alone it is seconds
    let count = times.findIndex(t => /^\d+$/.test(t));
    if (count >= 0 && times.some(t => /[a-z]$/.test(t))) {
        repeatCount = times.splice(count, 1)[0];
    }
    let [dur, begin] = times;
    if (dur) animate.attr('dur', dur);
    if (begin) animate.attr('begin', begin);
    if (repeatCount) animate.attr('repeatCount', repeatCount);
    if (fill) animate.attr('fill', fill);
    if (spline) {
        let values = animate.attr('values');
        let segments = values ? values.split(';').length - 1 : 1;
        animate.attr('calcMode', 'spline');
        if (!values) {
            animate.attr('keyTimes', '0;1');
        }
        animate.attr('keySplines', Array(segments).fill(spline).join(';'));
    } else if (calcMode) {
        animate.attr('calcMode', calcMode);
    }
    return dur;
}

function isGraphicElement(name) {
    return name === 'path'
        || name === 'line'
        || name === 'circle'
        || name === 'ellipse'
        || name === 'rect'
        || name === 'polygon'
        || name === 'polyline';
}

function generate(token, element, parent, root, warn) {
    let inlineId;
    if (!element) {
        element = new Tag('root');
    }
    if (token.type === 'block') {
        // style tag
        if (token.name === 'style') {
            let el = new Tag('style');
            el.append(token.value);
            element.append(el);
        }
        // normal svg elements
        else {
            let el = new Tag(token.name);
            if (!root) {
                root = el;
                root.attr('xmlns', NS.split('=')[1]);
            }
            if (token.name === 'defs') {
                let defsElement = root.findSpareDefs();
                // replace with existing defs
                if (defsElement) {
                    el = defsElement;
                }
            }
            for (let block of token.value) {
                let id = generate(block, el, token, root, warn);
                if (id) { inlineId = id }
            }
            let isInlineAndNotDefs = token && token.inline && token.name !== 'defs';
            let isParentInlineDefs = parent && parent.inline && parent.name === 'defs';
            let isSingleDefChild = isParentInlineDefs && parent.value.length == 1;

            if (isInlineAndNotDefs || isParentInlineDefs) {
                // generate id for inline block if no id is found
                let found = token.value.find(n => n.type === 'statement' && n.name === 'id');
                if (found) {
                    inlineId = found.value;
                } else if (isSingleDefChild || isInlineAndNotDefs) {
                    inlineId = nextInlineId(token.name);
                    el.attr('id', inlineId);
                }
            }
            if (token.inline && isDefinitionTag(token.name)) {
                element = root.findSpareDefs();
                if (!element) {
                    root.append(element = new Tag('defs'));
                }
            }
            let existedTag = element.find(el);
            if (existedTag) {
                if (existedTag !== el) {
                    existedTag.merge(el);
                }
            } else {
                if (token.name === 'defs') {
                    // append only when there's no defs and spare defs
                    let defsElement = root.findSpareDefs();
                    if (defsElement && !el.attrs.id) {
                        if (el.id !== defsElement.id) {
                            defsElement.append(el.body);
                        }
                    } else {
                        root.append(el);
                    }
                } else {
                    element.append(el);
                }
            }
        }
    }
    if (token.type === 'statement' && !token.variable) {
        let value = token.value;
        // `style fill: red`, `animate r: …`: a keyword and the attribute it applies to
        let space = token.name.indexOf(' ');
        let keyword = space < 0 ? token.name : token.name.slice(0, space);
        let name = space < 0 ? '' : token.name.slice(space + 1).trim();
        if (keyword === 'content') {
            let text = new Tag('text-node', value);
            element.append(text);
        }
        // inline style, `style fill: red` or `style: { fill: red }`
        else if (keyword === 'style') {
            let rule = name ? `${name}:${value};` : String(value).trim().replace(/;?$/, ';');
            element.attr('style', (element.attr('style') || '') + rule);
        }
        else {
            // handle inline block value
            if (value && value.type === 'block') {
                let id = generate(token.value, root, token, root, warn);
                if (isNil(id)) {
                    warn(`${token.name}: an inline defs must hold exactly one element`);
                    value = '';
                } else {
                    value = `url(#${id})`;
                    if (token.name === 'xlink:href' || token.name === 'href') {
                        value = `#${id}`;
                    }
                }
            }
            if (keyword === 'viewBox') {
                value = transformViewBox(token, warn);
                if (value) {
                    element.attr(token.name, value);
                }
            }
            // `draw: 2s infinite` strokes a shape along its length
            else if (keyword === 'draw' || (keyword === 'animate' && !name)) {
                if (!isGraphicElement(parent.name)) {
                    warn(`${keyword}: <${parent.name}> has no path length to draw`);
                } else {
                    element.attr('stroke-dasharray', 10);
                    element.attr('pathLength', 10);
                    let animate = new Tag('animate');
                    animate.attr('attributeName', 'stroke-dashoffset');
                    animate.attr('from', 10);
                    animate.attr('to', 0);
                    if (!timing(animate, value, keyword, warn)) {
                        warn(`${keyword}: needs a duration, as in \`2s\``);
                    }
                    element.append(animate);
                }
            }
            // `animate r: 1; 5; 1 / 2s ease infinite`, `animate transform: rotate 0; 360 / 4s`
            else if (keyword === 'animate') {
                name = adjustName(name);
                let text = String(value);
                let slash = text.lastIndexOf('/');
                let values = parseValueGroup(slash < 0 ? text : text.slice(0, slash), { symbol: ';', noSpace: true })
                    .filter(v => v.length);
                let animate = new Tag(name === 'transform' ? 'animateTransform' : 'animate');
                animate.attr('attributeName', name);
                if (name === 'transform' && values.length) {
                    let [type, ...rest] = values[0].split(/\s+/);
                    animate.attr('type', type);
                    values[0] = rest.join(' ');
                }
                if (values.length === 1) {
                    animate.attr('to', values[0]);
                } else {
                    animate.attr('values', values.join(';'));
                }
                if (!timing(animate, slash < 0 ? '' : text.slice(slash + 1), `animate ${name}`, warn)) {
                    warn(`animate ${name}: needs a duration after /, as in \`/ 2s\``);
                }
                element.append(animate);
            }
            else {
                element.attr(token.name, value);
            }
            if (token.name.includes('xlink:')) {
                root.attr('xmlns:xlink', NSXLink.split('=')[1]);
            }
        }
    }
    if (!parent) {
        return root.toString();
    }
    return inlineId;
}

export default function generateSvg(token, warn = noop) {
    return generate(token, null, null, null, warn);
}
