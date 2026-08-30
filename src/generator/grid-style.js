import { css } from '../utils/tagged-template.js';

/**
 * Map the transformed @grid options to static [selector, rule] pairs.
 */
export default function gridStyleRules({
  fill, clip, rotate, hueRotate, scale, translate, enlarge, skew, persp,
  flex, p3d, border, borderLegacy, gap, backdropFilter
}) {
  let rules = [];
  let add = (selector, rule) => rules.push([selector, rule]);
  if (fill) {
    add(':host', `background:${fill};`);
  }
  if (!clip) {
    add(':host', 'contain:none;');
  }
  if (rotate) {
    if (/[0-9]$/.test(rotate)) {
      rotate += 'deg';
    }
    add(':container', `rotate:${rotate};`);
  }
  if (hueRotate) {
    if (/[0-9]$/.test(hueRotate)) {
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
    let width = `calc(${sx} + 100%)`;
    let height = `calc(${sy} + 100%)`;
    if (/[0-9]$/.test(sx)) {
      width = `calc(${sx} * 100%)`;
    }
    if (/[0-9]$/.test(sy)) {
      height = `calc(${sy} * 100%)`;
    }
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
    add('cssd-cell', 'flex: 1;');
    if (flex === 'column') {
      add(':container', 'flex-direction:column;');
    }
  }
  if (p3d) {
    let s = 'transform-style:preserve-3d;';
    add(':host', s);
    add(':container', s);
  }
  if (borderLegacy !== undefined) {
    add(':host', `border: 1px solid ${borderLegacy};`);
  }
  if (border !== undefined) {
    add(':host', `border: ${border};`);
  }
  if (gap) {
    add(':container', `gap: ${gap};`);
  }
  if (backdropFilter) {
    add('cssd-b', css`
      backdrop-filter: ${backdropFilter};
    `);
  }
  return rules;
}
