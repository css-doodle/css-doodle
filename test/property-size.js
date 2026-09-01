import test from 'node:test';

import property from '../src/core/property.js';
import compare from './_compare.js';

compare.use(input => {
    return property.size(input, { isSpecialSelector: true, grid: { ratio: 1 } });
});

test('basic size', () => {
    compare('100px', 'width:100px;height:100px;');
    compare('100px 50px', 'width:100px;height:50px;');
});

test('preset sizes ignore case', () => {
    compare('a4', 'width:297mm;height:210mm;');
    compare('A4', 'width:297mm;height:210mm;');
    compare('a4 p', 'width:210mm;height:297mm;');
});

test('prototype names are not preset sizes', () => {
    compare('constructor', 'width:constructor;height:constructor;');
    compare('hasOwnProperty', 'width:hasOwnProperty;height:hasOwnProperty;');
});

test('aspect ratio from grid on special selectors', () => {
    compare('auto', 'width:auto;height:auto;aspect-ratio: 1;');
});
