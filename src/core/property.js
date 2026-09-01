import parseValueGroup from '../parser/parse-value-group.js';
import parseGrid from '../parser/parse-grid.js';
import generateShape from '../generator/shapes.js';

import { isPreset, getPreset } from './preset-size.js';

import { addAlias } from '../utils/fn.js';
import { isEmpty } from '../utils/type.js';
import { memo } from '../utils/cache.js';
import { css } from '../utils/tagged-template.js';

const iw = '--_cell-width';
const ih = '--_cell-height';
const cw = `var(${iw}, 25%)`;
const ch = `var(${ih}, 25%)`;

// keywords resolve to edge percentages, remaining values fill x then y
function resolvePlace(value) {
    let x, y, rest = [];
    for (let token of parseValueGroup(value)) {
        if (isEmpty(token)) continue;
        switch (token) {
            case 'left':   x = '0%';   break;
            case 'right':  x = '100%'; break;
            case 'top':    y = '0%';   break;
            case 'bottom': y = '100%'; break;
            case 'center': rest.push('50%'); break;
            default:       rest.push(token);
        }
    }
    for (let token of rest) {
        if (x === undefined) x = token;
        else if (y === undefined) y = token;
    }
    return [x ?? '50%', y ?? '50%'];
}

const borderStyles = /^(solid|dotted|dashed|double|groove|ridge|inset|outset)$/;

// fill in the parts a shorthand border value leaves out:
// bare numbers get px, a lone color gets 1px, no style gets solid
function formatBorder(value) {
    let values = parseValueGroup(value, { symbol: ' ' });
    for (let i = 0; i < values.length; i++) {
        if (Number(values[i])) {
            values[i] += 'px';
            break;
        }
    }
    let head = values[0];
    let isWidth = /^\.?\d/.test(head) || /^(thin|thick|medium)$/.test(head);
    if (values.length === 1 && !isWidth) {
        values.push('1px');
    }
    if (!values.some(v => borderStyles.test(v))) {
        values.push('solid');
    }
    return values.join(' ');
}

const Property = Object.create(null);

Property.size = (value, { isSpecialSelector, grid }) => {
    let [w, h = w, ratio] = parseValueGroup(value);
    if (isEmpty(w)) return '';
    if (isPreset(w)) {
        [w, h] = getPreset(w, h);
    }
    let styles = `width:${w};height:${h};`;
    if (w === 'auto' || h === 'auto') {
        if (ratio) {
            if (/^\(.+\)$/.test(ratio)) {
                ratio = ratio.slice(1, -1);
            } else if (!/^calc/.test(ratio)) {
                ratio = `calc(${ratio})`;
            }
        }
        if (isSpecialSelector) {
            styles += `aspect-ratio: ${ratio || grid.ratio};`;
        } else if (ratio) {
            styles += `aspect-ratio: ${ratio};`;
        }
    }
    if (!isSpecialSelector) {
        styles += `${iw}:${w};${ih}:${h};`;
    }
    return styles;
};

Property.place = (value, { extra }) => {
    let [left, top] = resolvePlace(value);
    return css`
    position: absolute;
    left: ${left};
    top: ${top};
    width: ${cw};
    height: ${ch};
    margin-left: calc(${cw} / -2);
    margin-top: calc(${ch} / -2);
    grid-area: unset;
    ${extra ? `rotate: ${extra}deg;` : ''}
  `;
};

Property.grid = (value, options) => {
    let result = {
        clip: true,
        p3d: false,
    };
    let temp = parseValueGroup(value, { symbol: ' ' }).map(item => {
        if (/^row$/i.test(item)) {
            result.flex = 'row';
            return '§';
        }
        if (/^col$/i.test(item)) {
            result.flex = 'column';
            return '§';
        }
        if (/^border(:|$)/i.test(item)) {
            result.borderLegacy = item.split(':')[1] || '';
            return '§';
        }
        if (/^no\-*clip$/i.test(item)) {
            result.clip = false;
            return '§';
        }
        if (/^p3d$/i.test(item)) {
            result.p3d = true;
            return '§';
        }
        if (!result.grid) {
            result.grid = parseGrid(item, options.maxGrid);
        }
        return item;
    });

    let groups = parseValueGroup(temp.join(' '), {
        symbol: ['/ 2', '+', '^', '*', '~', '∆', '_', 'ß', 'β', '|', '§'],
        noSpace: true,
        verbose: true
    });
    for (let { group, value } of groups) {
        switch (group) {
            case '+': result.scale = value; break;
            case '~': result.translate = value; break;
            case '_': result.gap = value; break;
            case '|': result.backdropFilter = value; break;
            case '^': result.enlarge = parseValueGroup(value, { symbol: ' ' }); break;
            case '∆': result.persp = parseValueGroup(value, { symbol: ' ' }); break;
            case '*': {
                let [head, ...rest] = parseValueGroup(value, { symbol: ' ' });
                if (head === 'h') result.hueRotate = rest.join(' ');
                else result.rotate = value;
                break;
            }
            case '/':
                if (result.size === undefined) result.size = Property.size(value, options);
                else result.fill = value;
                break;
            case 'β':
            case 'ß': result.border = formatBorder(value); break;
            case '':
                if (!result.grid) result.grid = parseGrid(value, options.maxGrid);
                break;
        }
    }
    return result;
};

Property.gap = value => value;

Property.seed = value => value;

Property.content = value => value;

Property.shape = memo('shape-property', value => {
    let { points, preset} = generateShape(value);
    if (!preset) return '';
    return `clip-path: polygon(${points.join(',')});`;
});

Property.use = rules => {
    if (rules.length > 2) {
        return rules;
    }
};

export default addAlias(Property, {
    // legacy names.
    'place-cell': 'place',
    'offset': 'place',
    'position': 'place',
});
