import test from 'node:test';
import assert from 'node:assert/strict';

import { createSvgUrl } from '../../src/lib/svg.js';

test('an svg url escapes only what url("…") and the data: scheme need', () => {
    let svg = '<svg viewBox="0 0 1 1">\n<a href="#x" d="M 0 0 L 1 1">50%:\\</a></svg>';
    let url = createSvgUrl(svg);
    assert.equal(url, 'url("data:image/svg+xml;utf8,%3Csvg viewBox=%220 0 1 1%22%3E%0A%3Ca href=%22%23x%22 d=%22M 0 0 L 1 1%22%3E50%25%3A%5C%3C/a%3E%3C/svg%3E")');
    assert.equal(decodeURIComponent(url.slice(url.indexOf(',') + 1, -2)), svg);
});

test('an svg url keeps tabs, which the url parser would drop', () => {
    assert.equal(createSvgUrl('<t>a\tb</t>'), 'url("data:image/svg+xml;utf8,%3Ct%3Ea%09b%3C/t%3E")');
});
