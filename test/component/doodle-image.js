import test from 'node:test';
import assert from 'node:assert/strict';

import { svgUrl, frameSvg, doodleToImage } from '../../src/component/doodle-image.js';

test('svgUrl escapes only what a data url needs', () => {
    assert.equal(svgUrl('<svg a="#b">50%</svg>'), 'data:image/svg+xml,%3Csvg a=%22%23b%22%3E50%25%3C/svg%3E');
    assert.equal(svgUrl('<t>a\tb</t>'), 'data:image/svg+xml,%3Ct%3Ea%09b%3C/t%3E');
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

test('a nested doodle sheet carries no template indentation', async () => {
    let host = { extra: {}, compiled: { seed: 42 }, getMaxGrid: () => 64, report: () => {}, hasAttribute: () => false, _clock: { base: 0 }, clockNow: () => 0 };
    let url = await doodleToImage(host, 'background: red;', {});
    let svg = decodeURIComponent(url.slice(url.indexOf(',') + 1));
    let sheet = /<style><!\[CDATA\[([\s\S]*?)\]\]><\/style>/.exec(svg)[1];
    assert.ok(sheet.includes('background:red') || sheet.includes('background: red'));
    assert.doesNotMatch(sheet, /\n\s+/);
});

test('a paint inside a doodle image is inlined as the url its drawer gives', async () => {
    let seen = [];
    let host = {
        extra: {}, compiled: { seed: 42 }, getMaxGrid: () => 64, report: () => {}, hasAttribute: () => false,
        _clock: { base: 0 }, clockNow: () => 0,
        draw: { pattern: (h, v) => (seen.push(v.inside), Promise.resolve('url("p.png")')) },
    };
    let url = await doodleToImage(host, '@grid: 2x1; background: @pattern(fill: red;);', { width: 100, height: 50 });
    let svg = decodeURIComponent(url.slice(url.indexOf(',') + 1));
    assert.ok(svg.includes('url("p.png")'));
    assert.doesNotMatch(svg, /var\(--pattern/);
    // the drawer learns the image size and grid, to size the still
    assert.equal(seen[0].width, 100);
    assert.equal(seen[0].height, 50);
    assert.equal(seen[0].grid.x, 2);

    // a drawer that gives nothing leaves the custom property, as on the element
    host.draw.pattern = () => Promise.resolve();
    let left = await doodleToImage(host, 'background: @pattern(fill: blue;);', { width: 10, height: 10 });
    assert.match(decodeURIComponent(left), /var\(--pattern/);
});
