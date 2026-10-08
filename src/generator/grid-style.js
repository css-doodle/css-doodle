import { css } from '../lib/tagged-template.js';
import parseCompoundValue from '../parser/parse-compound-value.js';

function isBareNumber(value) {
    let { value: num, unit } = parseCompoundValue(value);
    return num !== undefined && unit === undefined;
}

/**
 * Add the static rules of the transformed @grid options.
 */
export default function gridStyleRules({
    fill, clip, rotate, hueRotate, scale, translate, enlarge, persp,
    flex, p3d, border, gap, rowRule, columnRule, backdropFilter
}, add) {
    if (fill) {
        add(':host', `background:${fill};`);
    }
    if (!clip) {
        add(':host', 'contain:none;');
    }
    if (rotate) {
        if (isBareNumber(rotate)) {
            rotate += 'deg';
        }
        add(':container', `rotate:${rotate};`);
    }
    if (hueRotate) {
        if (isBareNumber(hueRotate)) {
            hueRotate += 'deg';
        }
        add(':host', `filter:hue-rotate(${hueRotate});`);
    }
    if (scale) {
        add(':container', `scale:${scale};`);
    }
    if (translate) {
        add(':container', `translate:${translate};`);
    }
    if (persp) {
        let [value, ...origin] = persp;
        add(':host', `perspective:${value};`);
        if (origin.length) {
            add(':host', `perspective-origin:${origin.join(' ')};`);
        }
    }
    if (enlarge) {
        let [sx, sy = sx] = enlarge;
        let width = isBareNumber(sx) ? `calc(${sx} * 100%)` : `calc(${sx} + 100%)`;
        let height = isBareNumber(sy) ? `calc(${sy} * 100%)` : `calc(${sy} + 100%)`;
        add(':container', css`
            width: ${width};
            height: ${height};
            left: 50%;
            top: 50%;
            transform-origin: 0 0;
            transform: translate(-50%, -50%);
        `);
    }
    if (flex) {
        add(':container', 'display:flex;');
        add('cell', 'flex: 1;');
        if (flex === 'column') {
            add(':container', 'flex-direction:column;');
        }
    }
    if (p3d) {
        let s = 'transform-style:preserve-3d;';
        add(':host', s);
        add(':container', s);
    }
    if (border !== undefined) {
        add(':host', `border: ${border};`);
    }
    if (gap) {
        add(':container', `gap: ${gap};`);
    }
    if (rowRule) {
        add(':container', `row-rule: ${rowRule};column-rule: ${columnRule};`);
    }
    if (backdropFilter) {
        add('bd', css`
      backdrop-filter: ${backdropFilter};
    `);
    }
}
