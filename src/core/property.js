import parseValueGroup from '../parser/parse-value-group.js';
import parseGrid from '../parser/parse-grid.js';
import generateShape from '../generator/shapes.js';

import { isPreset, getPreset } from './preset-size.js';

import { addAlias } from '../lib/fn.js';
import { isEmpty } from '../lib/type.js';
import { memo } from '../lib/cache.js';
import { css } from '../lib/tagged-template.js';

const iw = '--_cell-width';
const ih = '--_cell-height';
const cw = `var(${iw}, 25%)`;
const ch = `var(${ih}, 25%)`;

// keywords resolve to edge percentages, remaining values fill x then y
function resolvePlace(value) {
    let x, y, rest = [], safe = false;
    for (let token of parseValueGroup(value)) {
        if (isEmpty(token)) continue;
        switch (token) {
            case 'safe':   safe = true; break;
            case 'unsafe': safe = false; break;
            case 'left':   x = '0%';   break;
            case 'right':  x = '100%'; break;
            case 'top':    y = '0%';   break;
            case 'bottom': y = '100%'; break;
            case 'center': rest.push('50%'); break;
            default:       rest.push(token);
        }
    }
    return [x ?? rest.shift() ?? '50%', y ?? rest.shift() ?? '50%', safe];
}

const borderStyles = /^(solid|dotted|dashed|double|groove|ridge|inset|outset)$/;
const lengthValue = /^([.\d]|calc\(|var\()/;
const ruleWidths = /^(thin|medium|thick)$/;
const ruleWidthPx = { thin: '1px', medium: '3px', thick: '5px' };

function completeRule(values) {
    let i = values.findIndex(v => Number(v));
    if (i >= 0) values[i] += 'px';
    if (!values.some(v => borderStyles.test(v))) values.push('solid');
    return values;
}

function formatBorder(value) {
    let values = parseValueGroup(value, { symbol: ' ' }).slice();
    let [head] = values;
    if (values.length === 1 && !/^\.?\d/.test(head) && !ruleWidths.test(head)) {
        values.push('1px');
    }
    return completeRule(values).join(' ');
}

function formatGap(value) {
    let values = parseValueGroup(value, { symbol: ' ' }).slice();
    let gap = [];
    while (gap.length < 2 && values.length && lengthValue.test(values[0])) {
        let head = values.shift();
        gap.push(/^[.\d]+$/.test(head) ? head + 'px' : head);
    }
    let rowRule = '', columnRule = '';
    if (values.length) {
        completeRule(values);
        let width = values.find(v => lengthValue.test(v) || ruleWidths.test(v));
        if (width === undefined) {
            // a rule with no width of its own fills its gap
            // (% can't be a line width and falls back to a hairline)
            let [row = '1px', column = row] = gap.map(v => /%/.test(v) ? '1px' : v);
            rowRule = values.concat(row).join(' ');
            columnRule = values.concat(column).join(' ');
            width = row;
        } else {
            rowRule = columnRule = values.join(' ');
        }
        if (!gap.length) {
            // a missing gap takes the rule width
            gap.push(ruleWidthPx[width] || width);
        }
    }
    return { gap: gap.join(' '), rowRule, columnRule };
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
            if (/^\(.+\)$/.test(ratio)) ratio = ratio.slice(1, -1);
            else if (!/^calc/.test(ratio)) ratio = `calc(${ratio})`;
        } else if (isSpecialSelector) {
            ratio = grid.ratio;
        }
        if (ratio) styles += `aspect-ratio: ${ratio};`;
    }
    if (!isSpecialSelector) {
        styles += `${iw}:${w};${ih}:${h};`;
    }
    return styles;
};

Property.place = (value, { extra }) => {
    let [left, top, safe] = resolvePlace(value);
    return css`
    position: absolute;
    left: ${left};
    right: calc(100% - ${left});
    top: ${top};
    bottom: calc(100% - ${top});
    width: ${cw};
    height: ${ch};
    place-self: ${safe ? 'center' : 'unsafe center'};
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
        if (/^row$/i.test(item)) result.flex = 'row';
        else if (/^col$/i.test(item)) result.flex = 'column';
        else if (/^border(:|$)/i.test(item)) result.borderLegacy = item.split(':')[1] || '';
        else if (/^no\-*clip$/i.test(item)) result.clip = false;
        else if (/^p3d$/i.test(item)) result.p3d = true;
        else {
            result.grid ??= parseGrid(item, options.maxGrid);
            return item;
        }
        return '§';
    });

    let groups = parseValueGroup(temp.join(' '), {
        symbol: ['/ 2', '+', '^', '*', '~', '∆', '_', 'ß', '|', '§'],
        noSpace: true,
        verbose: true
    });
    for (let { group, value } of groups) {
        switch (group) {
            case '+': result.scale = value; break;
            case '~': result.translate = value; break;
            case '_': {
                let { gap, rowRule, columnRule } = formatGap(value);
                if (gap) result.gap = gap;
                if (rowRule) {
                    result.rowRule = rowRule;
                    result.columnRule = columnRule;
                }
                break;
            }
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
            case 'ß': result.border = formatBorder(value); break;
        }
    }
    return result;
};

Property.gap = formatGap;

Property.seed = Property.content = value => value;

Property.shape = memo('shape-property', value => {
    let { points, preset } = generateShape(value);
    return preset ? `clip-path:polygon(${points.join(',')});` : '';
});

export const alias = {
    // legacy names.
    'place-cell': 'place',
    'offset': 'place',
};

export default addAlias(Property, alias);
