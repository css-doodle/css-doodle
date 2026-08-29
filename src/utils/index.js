/* Compatibility barrel: kept because the published src tree and the
 * legacy diff snapshots (test/diff) import helpers through this path.
 * New code should import from the specific module instead. */
export * from './type.js';
export * from './math.js';
export * from './list.js';
export * from './cell.js';
export * from './fn.js';
export * from './browser.js';
export { sequence } from '../core/arguments.js';
