import test from 'node:test';
import assert from 'node:assert/strict';

import parseFilterRegion from '../../src/parser/parse-filter-region.js';

test('a single percentage grows the region equally on every side', () => {
    assert.deepEqual(parseFilterRegion('20%'), {
        x: '-20%', y: '-20%', width: '140%', height: '140%',
    });
    assert.deepEqual(parseFilterRegion('0%'), {
        x: '0%', y: '0%', width: '100%', height: '100%',
    });
});

test('position / size with one or two values each', () => {
    assert.deepEqual(parseFilterRegion('-20% / 140%'), {
        x: '-20%', y: '-20%', width: '140%', height: '140%',
    });
    assert.deepEqual(parseFilterRegion('-30% -10% / 160% 120%'), {
        x: '-30%', y: '-10%', width: '160%', height: '120%',
    });
    assert.deepEqual(parseFilterRegion('-10px 0 / 120px 100%'), {
        x: '-10px', y: '0', width: '120px', height: '100%',
    });
});

test('malformed regions are undefined', () => {
    for (let value of [
        '', '20px', '-20%', '1e308%', '-20% /', '/ 100%', 'foo / bar',
        '1 2 3 / 100%', '0 / 100% 100% 100%',
    ]) {
        assert.equal(parseFilterRegion(value), undefined, value);
    }
});
