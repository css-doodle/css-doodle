import { nextId } from '../lib/fn.js';
import { isNil, removeQuotes } from '../lib/type.js';
import { NS, NSXLink, adjustName } from '../lib/svg.js';
import parseValueGroup from '../parser/parse-value-group.js';
import { getEasingPoints } from '../core/easing.js';
import { GROUPS } from '../parser/parse-shape-commands.js';
import { traceRings, toPairs } from './shapes.js';
import { overlay, corners, bounds, offset, flatten, thin } from './tiling.js';

const { atan2, ceil, abs, max, hypot, PI } = Math;

const nextInlineId = nextId();

const startPath = value => String(value).replace(/^\s*[lL]/, 'M');

// a quoted value as text, its escapes read: "a\"b" is a"b
function unquote(value) {
    let text = removeQuotes(value);
    return text === String(value) ? text : text.replace(/\\(.)/gs, '$1');
}

// the body holds child tags and text, text as plain strings
class Tag {
    constructor(name) {
        this.name = name;
        this.body = [];
        this.attrs = Object.create(null);
    }
    find(target) {
        let id = target.attrs.id;
        let name = target.name;
        if (id !== undefined) {
            return this.body.find(tag => tag.name === name && tag.attrs.id === id);
        }
    }
    findSpareDefs() {
        return this.body.find(n => n.name === 'defs' && !n.attrs.id);
    }
    append(tag) {
        this.body.push(tag);
    }
    merge(tag) {
        Object.assign(this.attrs, tag.attrs);
        this.body.push(...tag.body);
    }
    attr(name, value) {
        if (value === undefined) {
            return this.attrs[name];
        }
        // SMIL spells it indefinite
        if (name === 'repeatCount' && value === 'infinite') {
            value = 'indefinite';
        }
        if (name === 'd') {
            value = startPath(value);
        }
        return this.attrs[name] = value;
    }
    toString() {
        // a drawing runs no script: no script tags, handlers or javascript: links
        if (/^script$/i.test(this.name)) return '';
        let open = '<' + this.name;
        for (let name in this.attrs) {
            let value = unquote(this.attrs[name]);
            if (/^on/i.test(name) || /^javascript:/i.test(plain(value))) continue;
            open += ' ' + name + '="' + escapeAttr(value) + '"';
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
    if (text.indexOf('&') < 0 && text.indexOf('<') < 0 && text.indexOf(']]>') < 0) return text;
    text = text.replace(RE_AMP, '&amp;').replace(RE_LT_TEXT, '&lt;');
    return text.includes('<![CDATA[') ? text : text.replaceAll(']]>', ']]&gt;');
}

function plain(text) {
    return text
        .replace(/&#x([0-9a-f]+);?/gi, (_, h) => String.fromCodePoint(Math.min(parseInt(h, 16), 0x10ffff)))
        .replace(/&#(\d+);?/g, (_, d) => String.fromCodePoint(Math.min(+d, 0x10ffff)))
        .replace(/&(tab|newline);?/gi, '')
        .replace(/&colon;?/gi, ':')
        .replace(/[\0-\x20\x7f-\x9f]/g, '');
}

function escapeAttr(text) {
    text = String(text);
    if (text.indexOf('&') < 0 && text.indexOf('<') < 0 && text.indexOf('"') < 0) return text;
    return text.replace(RE_AMP, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
}

function ringsOf(tag, warn) {
    let { name, attrs } = tag, rings, d;
    let n = key => {
        let value = parseFloat(attrs[key]) || 0;
        if (/%/.test(attrs[key])) warn(`<${name}> ignores %`);
        return value;
    };
    if (name === 'g') {
        for (let child of tag.body) {
            let next = ringsOf(child, warn);
            if (next) rings = rings ? overlay(rings, next, 'union') : next;
        }
    } else if (name === 'path') {
        d = attrs.d;
    } else if (name === 'polygon' || name === 'polyline') {
        d = 'M' + attrs.points + 'Z';
    } else if (name === 'circle' || name === 'ellipse') {
        let x = n('cx'), y = n('cy'), rx = n(name === 'circle' ? 'r' : 'rx'), ry = name === 'circle' ? rx : n('ry');
        d = `M${x - rx} ${y}A${rx} ${ry} 0 1 0 ${x + rx} ${y}A${rx} ${ry} 0 1 0 ${x - rx} ${y}Z`;
    } else if (name === 'rect') {
        let x = n('x'), y = n('y'), w = n('width'), h = n('height');
        let rx = Math.min(n(attrs.rx === undefined ? 'ry' : 'rx'), w / 2), ry = Math.min(n(attrs.ry === undefined ? 'rx' : 'ry'), h / 2);
        let a = (x, y) => rx && ry ? `A${rx} ${ry} 0 0 1 ${x} ${y}` : '';
        d = `M${x + rx} ${y}H${x + w - rx}${a(x + w, y + ry)}V${y + h - ry}${a(x + w - rx, y + h)}H${x + rx}${a(x, y + h - ry)}V${y + ry}${a(x + rx, y)}Z`;
    }
    if (d) rings = Object.assign(traceRings(d, 32), { evenodd: attrs['fill-rule'] === 'evenodd' });
    if (rings && attrs.transform !== undefined) warn(`<${name}> transform ignored`);
    return rings;
}

function combine(group, op, warn) {
    let { smooth, grow, ...attrs } = group.attrs, path = new Tag('path'), joints = new Set(), rings, scale = 0, d = '';
    group.body.forEach(tag => {
        let next = ringsOf(tag, warn), [x0, y0, x1, y1] = bounds((next || []).flat(2));
        if (next) rings = rings ? overlay(rings, next, op, joints) : next, scale = max(scale, x1 - x0, y1 - y0);
        else if (/^(animate|set|title|desc)/.test(tag.name)) path.append(tag);
        else if (tag.name) warn(`<${tag.name}> lacks outline`);
    });
    rings ??= [];
    let k = parseFloat(smooth), g = parseFloat(grow), tol = 2e-5 * (scale + abs(g || 0));
    if (g) {
        rings = offset(k > 0 ? rings.map(ring => toPairs(flatten(corners(ring, joints, k), tol))) : rings, g, rings.evenodd, tol);
        k = 0;
    }
    let [x0, y0, x1, y1] = bounds(rings.flat(2)), size = max(x1 - x0, y1 - y0), digits = max(0, ceil(4 - Math.log10(size)));
    let f = v => +v.toFixed(digits), xy = ([x, y]) => f(x) + ' ' + f(y);
    for (let ring of rings) {
        ring = thin(ring, tol / 200);
        let ps = k > 0 ? corners(ring, joints, k) : ring;
        d += 'M' + xy(ps[0]);
        for (let i = 0; i < ps.length;) {
            let [j, r, large, sweep] = arcRun(ps, i, 5 * tol), [, , bx, by] = ps[j % ps.length];
            if (r) d += `A${f(r)} ${f(r)} 0 ${large} ${sweep} ` + xy(ps[j % ps.length]);
            else if (j < ps.length) d += (bx === undefined ? 'L' : `Q${f(bx)} ${f(by)} `) + xy(ps[j]);
            i = j;
        }
        d += 'Z';
    }
    Object.assign(path.attrs, attrs);
    if (rings.evenodd) path.attrs['fill-rule'] = 'evenodd';
    path.attr('d', d);
    return path;
}

function arcRun(ps, i, tol) {
    let n = ps.length, P = j => ps[j % n], run = [i + 1], lo = i + 1, hi = n + 1;
    let fit = j => {
        let [ax, ay] = P(i), [bx, by] = P(i + j >> 1), [cx, cy] = P(j), den = 2 * ((bx - ax) * (cy - ay) - (by - ay) * (cx - ax));
        if (abs(den) < 1e-12) return;
        let b2 = (bx - ax) ** 2 + (by - ay) ** 2, c2 = (cx - ax) ** 2 + (cy - ay) ** 2;
        let ox = ax + ((cy - ay) * b2 - (by - ay) * c2) / den, oy = ay + ((bx - ax) * c2 - (cx - ax) * b2) / den, r = hypot(ax - ox, ay - oy), turn = 0;
        for (let m = i + 1; m <= j; ++m) {
            let [px, py] = P(m - 1), [qx, qy, curve] = P(m), ux = px - ox, uy = py - oy, vx = qx - ox, vy = qy - oy;
            let a = atan2(ux * vy - uy * vx, ux * vx + uy * vy);
            if (curve !== undefined || abs(hypot(vx, vy) - r) > tol || r - hypot((px + qx) / 2 - ox, (py + qy) / 2 - oy) > tol || a * turn < 0) return;
            turn += a;
        }
        if (abs(turn) < 1.99 * PI) return [j, r, +(abs(turn) > PI), +(turn > 0)];
    };
    for (let step = 1, f; lo < hi - 1; step *= 2) {
        let j = Math.min(i + 1 + step, n);
        if (!(f = fit(j))) { hi = j; break; }
        run = f, lo = j;
        if (j == n) break;
    }
    while (hi - lo > 1) {
        let m = lo + hi >> 1, f = fit(m);
        f ? (run = f, lo = m) : hi = m;
    }
    return run;
}

function transformViewBox(token, warn) {
    let viewBox = token.detail.value;
    let p = token.detail.padding || token.detail.p;
    // `viewBox: 10` is `0 0 10 10`, `viewBox: 10 5` is `0 0 10 5`
    if (viewBox.length === 1) {
        viewBox = [0, 0, viewBox[0], viewBox[0]];
    } else if (viewBox.length === 2) {
        viewBox = [0, 0, viewBox[0], viewBox[1]];
    }
    if (viewBox.length !== 4) {
        warn(`invalid viewBox "${token.value}"`);
        return '';
    }
    let [x, y, w, h] = viewBox;
    if (p) {
        [x, y, w, h] = [x-p, y-p, w+p*2, h+p*2];
    }
    return `${x} ${y} ${w} ${h}`;
}

function timing(animate, value, warn) {
    let times = [], repeatCount, fill, calcMode, spline;
    for (let word of parseValueGroup(value)) {
        if (word === 'infinite' || word === 'indefinite') {
            repeatCount = 'indefinite';
        } else if (/^(-?\d*\.?\d+(m?s|min|h)|\d*\.?\d+)$/.test(word)) {
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
                warn(`unknown timing ${word}`);
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
        else if (token.test !== undefined) {
            if (Number(token.test)) {
                for (let block of token.value) {
                    let id = generate(block, element, parent, root, warn);
                    if (id) { inlineId = id }
                }
            }
        }
        else {
            let el = new Tag(token.name);
            let fresh = false;
            if (!root) {
                root = el;
                root.attr('xmlns', NS.split('=')[1]);
            }
            if (token.name === 'defs') el = root.findSpareDefs() || el;
            for (let block of token.value) {
                let id = generate(block, el, token, root, warn);
                if (id) { inlineId = id }
            }
            if (GROUPS.includes(token.name)) el = combine(el, token.name, warn);
            let isInlineAndNotDefs = token.inline && token.name !== 'defs';
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
                    fresh = true;
                }
            }
            if (token.inline && /^(linearGradient|radialGradient|pattern|filter|clipPath|mask|marker|symbol)$/.test(token.name)) {
                element = root.findSpareDefs();
                if (!element) {
                    root.append(element = new Tag('defs'));
                }
            }
            let existedTag = !fresh && element.find(el);
            if (existedTag) {
                if (existedTag !== el) {
                    existedTag.merge(el);
                }
            } else {
                if (token.name === 'defs') {
                    // append only when there's no defs and spare defs
                    let defsElement = root.findSpareDefs();
                    if (defsElement && !el.attrs.id) {
                        if (el !== defsElement) {
                            defsElement.body.push(...el.body);
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
            element.append(unquote(value));
        }
        // inline style, `style fill: red` or `style: { fill: red }`
        else if (keyword === 'style') {
            let rule = name ? `${name}:${value};` : String(value).trim().replace(/;?$/, ';');
            element.attr('style', (element.attr('style') || '') + rule);
        }
        else {
            // handle inline block value
            if (value?.type === 'block') {
                let id = generate(token.value, root, token, root, warn);
                if (isNil(id)) {
                    warn('defs: one element');
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
                if (!/^(path|line|circle|ellipse|rect|polygon|polyline)$/.test(parent.name) && !GROUPS.includes(parent.name)) {
                    warn(`<${parent.name}> lacks path`);
                } else {
                    element.attr('stroke-dasharray', 10);
                    element.attr('pathLength', 10);
                    let animate = new Tag('animate');
                    animate.attr('attributeName', 'stroke-dashoffset');
                    animate.attr('from', 10);
                    animate.attr('to', 0);
                    if (!timing(animate, value, warn)) {
                        warn(`${keyword} needs duration`);
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
                if (name === 'd') {
                    values = values.map(startPath);
                }
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
                if (!timing(animate, slash < 0 ? '' : text.slice(slash + 1), warn)) {
                    warn(`${name} needs duration`);
                }
                element.append(animate);
            }
            else if (/^[\p{L}_:][\p{L}\d_:.-]*$/u.test(token.name)) {
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

export default function generateSvg(token, warn = () => {}) {
    return generate(token, null, null, null, warn);
}
