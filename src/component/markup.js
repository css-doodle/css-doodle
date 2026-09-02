import { utime, UTime } from '../core/uniforms.js';
import { cellId } from '../utils/cell.js';
import { css } from '../utils/tagged-template.js';

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
        --${utime.name}: 0;
        --${UTime.name}: 0
    }
    :host([hidden]),[hidden] {
        display: none
    }
    :host([cssd-paused]),
    :host([cssd-paused]) * {
        animation-play-state: paused !important
    }
    cssd-grid, cssd-cell {
        display: grid;
        position: relative
    }
    cssd-grid {
        gap: inherit;
        grid-template: repeat(${y},1fr)/repeat(${x},1fr)
    }
    cssd-b {
        position: absolute;
        inset: 0;
        pointer-events: none
    }
    cssd-cell {
        place-items: center;
        min-height: 0;
        min-width: 0
    }
    svg, canvas {
        position: absolute;
    }
    cssd-grid, svg, canvas {
        width: 100%;
        height: 100%
    }
    canvas {
        object-fit: cover
    }
  `;
}

function createCell(x, y, z, content, child = '') {
    let id = cellId(x, y, z);
    let head = content['#' + id] ?? '';
    if (/^\$\{(shader|pattern)/.test(head)) {
        head = '';
    }
    return `<cssd-cell id="${id}" part="cell">${head}${child}</cssd-cell>`;
}

export function createGrid(gridObj, compiled) {
    let { x, y, z } = gridObj || {};
    let { content, styles } = compiled;
    let result = '';
    if (z == 1) {
        for (let j = 1; j <= y; ++j) {
            for (let i = 1; i <= x; ++i) {
                result += createCell(i, j, 1, content);
            }
        }
    }
    else {
        let child = '';
        for (let i = z; i >= 1; i--) {
            child = createCell(1, 1, i, content, child);
        }
        result = child;
    }
    return `<cssd-grid part="grid">${result}</cssd-grid>${styles.backdrop ? '<cssd-b></cssd-b>' : ''}`;
}
