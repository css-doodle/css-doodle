import { utime, UTime } from '../core/uniforms.js';
import { isTreeGrid } from '../lib/cell.js';
import { css } from '../lib/tagged-template.js';

export function getBasicStyles(grid) {
    let { x, y } = grid || {};
    return css`
    *,*::after,*::before,:host,.host {
        box-sizing: border-box;
    }
    :host,.host {
        display: block;
        visibility: visible;
        width: fit-content;
        height: fit-content;
        contain: content;
        ${utime}: 0;
        ${UTime}: 0
    }
    :host([hidden]),[hidden] {
        display: none
    }
    :host([cssd-paused]),
    :host([cssd-paused])::before,
    :host([cssd-paused])::after,
    :host([cssd-paused]) *,
    :host([cssd-paused]) *::before,
    :host([cssd-paused]) *::after {
        animation-play-state: paused !important
    }
    grid, cell {
        display: grid;
        position: relative
    }
    grid {
        gap: inherit;
        grid-template: repeat(${y},1fr)/repeat(${x},1fr)
    }
    bd {
        position: absolute;
        inset: 0;
        pointer-events: none
    }
    cell {
        place-items: center;
        min-height: 0;
        min-width: 0
    }
    ${isTreeGrid(grid) ? treeStyles(grid) : ''}
    svg, canvas {
        position: absolute;
    }
    grid, svg, canvas {
        width: 100%;
        height: 100%
    }
    canvas {
        object-fit: cover
    }
  `;
}

function treeStyles({ x, y }) {
    return css`
    cell > cell {
        width: 100%;
        height: 100%
    }
    cell:has(>cell) {
        gap: inherit;
        grid-template: repeat(${y},1fr)/repeat(${x},1fr)
    }
    `;
}

const EMBEDDED_CONTENT = /^\$\{(shader|pattern)/;

function hasKeys(obj) {
    for (let k in obj) return true;
    return false;
}

export function createGrid(gridObj, compiled) {
    let { x, y, z } = gridObj || {};
    let { content, styles } = compiled;
    let shared = isTreeGrid(gridObj);
    let open = shared ? '<cell class="c-' : '<cell id="c-';
    let key = shared ? '.c-' : '#c-';
    let hasContent = hasKeys(content);
    let child = '';
    for (let k = z; k >= 1; k--) {
        let lookup = hasContent && !(shared && child);
        let level = '';
        for (let j = 1; j <= y; ++j) {
            let suffix = '-' + j + '-' + k;
            for (let i = 1; i <= x; ++i) {
                let id = i + suffix;
                let head = '';
                if (lookup) {
                    head = content[key + id] ?? '';
                    if (head && head.charCodeAt(0) === 36 && EMBEDDED_CONTENT.test(head)) {
                        head = '';
                    }
                }
                level += open + id + '" part="cell">' + head + child + '</cell>';
            }
        }
        child = level;
    }
    return `<grid part="grid">${child}</grid>${styles.backdrop ? '<bd></bd>' : ''}`;
}
