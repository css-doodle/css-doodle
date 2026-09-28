import test from 'node:test';
import assert from 'node:assert/strict';

import { svgUrl, frameSvg } from '../../src/component/doodle-image.js';

test('svgUrl escapes only what a data url needs', () => {
    assert.equal(svgUrl('<svg a="#b">50%</svg>'), 'data:image/svg+xml,%3Csvg a=%22%23b%22%3E50%25%3C/svg%3E');
});

test('frameSvg draws the sized svg through an image of the same size', () => {
    let svg = '<svg width="400px" height="300px" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none" viewBox="0 0 400 300"><foreignObject/></svg>';
    let framed = frameSvg(svg, '400px', '300px');
    assert.match(framed, /^<svg width="400px" height="300px" xmlns="http:\/\/www\.w3\.org\/2000\/svg" preserveAspectRatio="none" viewBox="0 0 400 300"><image width="400" height="300" preserveAspectRatio="none" href="data:image\/svg\+xml,[^"]+"\/><\/svg>$/);
    // the inner svg keeps its size and loses its viewBox, so it is drawn unscaled
    let inner = decodeURIComponent(/href="data:image\/svg\+xml,([^"]+)"/.exec(framed)[1]);
    assert.equal(inner, svg.replace(' viewBox="0 0 400 300"', ''));
    // texture sizes come as numbers
    assert.match(frameSvg('<svg></svg>', 64, 32), /^<svg width="64" height="32" [^>]*viewBox="0 0 64 32"><image width="64" height="32"/);
    // only the outer viewBox goes: inline svg content keeps its own
    let content = '<svg width="8" height="8"><foreignObject><svg viewBox="0 0 10 10"/></foreignObject></svg>';
    assert.ok(decodeURIComponent(frameSvg(content, 8, 8)).includes('<foreignObject><svg viewBox="0 0 10 10"/>'));
});
