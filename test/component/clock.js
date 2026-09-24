import test from 'node:test';
import assert from 'node:assert/strict';

import { stampSvgImages, stampSheet, stampSmil, shiftCssAnimations, hasImageClock } from '../../src/component/clock.js';

const url = svg => `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`;
const decode = sheet => decodeURIComponent(/utf8,([^"#]*)/.exec(sheet)[1]);
const PAUSED = '<style>*,*::before,*::after{animation-play-state:paused!important}</style>';

function host(seconds, paused) {
    return {
        _clock: { base: seconds * 1000, since: 0 },
        hasAttribute: () => paused,
        clockNow: () => seconds * 1000,
    };
}

test('svg urls are left alone until the host has been paused', () => {
    let sheet = url('<svg><animate attributeName="r" dur="1s"/></svg>');
    assert.equal(stampSvgImages({ _clock: { base: 0 }, hasAttribute: () => false }, sheet), sheet);
    assert.equal(stampSvgImages(host(2, false), url('<svg><circle/></svg>')), url('<svg><circle/></svg>'));
});

test('an image clock is a SMIL element or a named css animation', () => {
    assert.ok(hasImageClock(url('<svg><animateTransform type="rotate"/></svg>')));
    assert.ok(hasImageClock(url('<svg><style>r{animation:x 1s}</style></svg>')));
    assert.ok(hasImageClock(url('<svg><style>r{animation-name:x;animation-duration:1s}</style></svg>')));
    assert.ok(!hasImageClock(url('<svg><style>r{animation-duration:1s;transition:all 1s}</style></svg>')));
});

test('running animations restart from the host time', () => {
    let out = decode(stampSvgImages(host(2.5, false), url('<svg><animate attributeName="r" dur="1s" repeatCount="indefinite"/></svg>')));
    assert.equal(out, '<svg><animate attributeName="r" dur="1s" repeatCount="indefinite" begin="-2500ms"/></svg>');
    out = decode(stampSvgImages(host(1, false), url('<svg><animate attributeName="r" begin="3s" dur="1s"/></svg>')));
    assert.equal(out, '<svg><animate attributeName="r" begin="2000ms" dur="1s"/></svg>');
    // a negative begin is an offset to keep
    out = decode(stampSvgImages(host(2.5, false), url('<svg><animate begin="-1s" dur="4s" repeatCount="indefinite"/></svg>')));
    assert.equal(out, '<svg><animate begin="-3500ms" dur="4s" repeatCount="indefinite"/></svg>');
    // single quotes are read too
    out = decode(stampSvgImages(host(2.5, false), url("<svg><animate begin='1s' dur='4s'/></svg>")));
    assert.equal(out, `<svg><animate begin="-1500ms" dur='4s'/></svg>`);
});

test('paused animations hold the value at the host time', () => {
    let out = decode(stampSvgImages(host(2.5, true), url('<svg><animateTransform type="rotate" dur="4s" repeatCount="2"/></svg>')));
    assert.equal(out, '<svg><animateTransform type="rotate" dur="4s" repeatCount="2" begin="-2500ms" end="1ms" fill="freeze"/></svg>');
    // finished: only the begin is shifted, so its own fill applies
    out = decode(stampSvgImages(host(2.5, true), url('<svg><animate dur="1s"/></svg>')));
    assert.equal(out, '<svg><animate dur="1s" begin="-2500ms"/></svg>');
    // not started yet: must not start while paused
    out = decode(stampSvgImages(host(2.5, true), url('<svg><animate begin="3s" dur="1s"/></svg>')));
    assert.equal(out, '<svg><animate begin="indefinite" dur="1s"/></svg>');
    // paused right at its start
    out = decode(stampSvgImages(host(0, true), url('<svg><animate dur="1s"/></svg>')));
    assert.equal(out, '<svg><animate dur="1s" begin="0ms" end="1ms" fill="freeze"/></svg>');
    // event begins are not clock values
    out = decode(stampSvgImages(host(2.5, true), url('<svg><animate begin="click" dur="1s"/></svg>')));
    assert.equal(out, '<svg><animate begin="click" dur="1s"/></svg>');
});

test('css animation delays shift by the host time', () => {
    const shift = css => shiftCssAnimations(css, 1600);
    assert.equal(shift('a{animation:spin 2s linear infinite}'), 'a{animation:spin 2s -1600ms linear infinite}');
    assert.equal(shift('a{animation:spin 2s linear .5s infinite;}'), 'a{animation:spin 2s linear -1100ms infinite;}');
    assert.equal(shift('a{animation: 2s spin !important}'), 'a{animation: 2s -1600ms spin !important}');
    assert.equal(shift('a{animation-delay:1s,500ms}'), 'a{animation-delay:-600ms,-1100ms}');
    // commas inside functions do not split the list
    assert.equal(
        shift('a{animation:x 1s cubic-bezier(.1, .2, .3, .4) 1s, y 2s steps(4, end)}'),
        'a{animation:x 1s cubic-bezier(.1, .2, .3, .4) -600ms, y 2s -1600ms steps(4, end)}');
    // the time uniform line of a nested doodle
    assert.equal(
        shift('.host {animation:86400000ms steps(10368000) 0ms infinite cssd-utime-animation,86400000ms steps(10368000) -71847571ms infinite cssd-UTime-animation;}'),
        '.host {animation:86400000ms steps(10368000) -1600ms infinite cssd-utime-animation,86400000ms steps(10368000) -71849171ms infinite cssd-UTime-animation;}');
    // nothing to shift
    for (let css of ['a{animation:none}', 'a{animation-delay:var(--d)}', 'a{animation:x min(1s, max(2s, 3s))}', 'a{animation-duration:2s}', 'a{transition:all 2s 1s}', '@keyframes spin{to{rotate:1turn}}']) {
        assert.equal(shift(css), css);
    }
    assert.equal(shiftCssAnimations('a{animation:spin 2s}', 0), 'a{animation:spin 2s}');
});

test('css animations inside an svg image are shifted and frozen', () => {
    let svg = '<svg><style>@keyframes r{to{fill:red}}rect{animation:r 10s linear}</style><rect style="animation:r 10s 1s"/></svg>';
    let out = decode(stampSvgImages(host(1.6, false), url(svg)));
    assert.equal(out, '<svg><style>@keyframes r{to{fill:red}}rect{animation:r 10s -1600ms linear}</style><rect style="animation:r 10s -600ms"/></svg>');
    out = decode(stampSvgImages(host(1.6, true), url(svg)));
    assert.equal(out, `<svg><style>@keyframes r{to{fill:red}}rect{animation:r 10s -1600ms linear}</style><rect style="animation:r 10s -600ms"/>${PAUSED}</svg>`);
    // longhands are frozen, though not shifted
    svg = '<svg><style>rect{animation-name:r;animation-duration:2s}</style></svg>';
    assert.equal(decode(stampSvgImages(host(1.6, false), url(svg))), svg);
    assert.equal(decode(stampSvgImages(host(1.6, true), url(svg))), svg.replace('</svg>', PAUSED + '</svg>'));
});

test('the fragment of a filter url survives', () => {
    let sheet = url('<svg><animate dur="1s"/></svg>').replace('")', '#f1")');
    let out = stampSvgImages(host(0.5, false), sheet);
    assert.ok(out.endsWith('#f1")'));
    assert.equal(decode(out), '<svg><animate dur="1s" begin="-500ms"/></svg>');
});

test('a nested sheet runs with the host clock and holds when paused', () => {
    const PAUSED_RULE = PAUSED.slice(7, -8);
    let sheet = 'cell{animation:spin 4s}';
    // a running host that was never paused is left alone
    assert.equal(stampSheet({ _clock: { base: 0 }, hasAttribute: () => false }, sheet), sheet);
    // a resumed host keeps the phase, still running
    assert.equal(stampSheet(host(2.5, false), sheet), 'cell{animation:spin 4s -2500ms}');
    // a paused host holds that frame
    assert.equal(stampSheet(host(2.5, true), sheet), 'cell{animation:spin 4s -2500ms}' + PAUSED_RULE);
});

test('inline SMIL markup follows the host clock', () => {
    let markup = '<cell><svg><circle r="1"><animate attributeName="r" dur="2s" repeatCount="indefinite"/></circle><animateTransform type="rotate" begin="3s" dur="1s"/></svg></cell>';
    assert.equal(stampSmil({ _clock: { base: 0 }, hasAttribute: () => false }, markup), markup);
    // paused: active ones freeze, pending ones wait
    assert.equal(stampSmil(host(1.5, true), markup),
        '<cell><svg><circle r="1"><animate attributeName="r" dur="2s" repeatCount="indefinite" begin="-1500ms" end="1ms" fill="freeze"/></circle><animateTransform type="rotate" begin="indefinite" dur="1s"/></svg></cell>');
    // resumed: shifted, still running
    assert.equal(stampSmil(host(1.5, false), markup),
        '<cell><svg><circle r="1"><animate attributeName="r" dur="2s" repeatCount="indefinite" begin="-1500ms"/></circle><animateTransform type="rotate" begin="1500ms" dur="1s"/></svg></cell>');
    // a finished animation only shifts, so its own fill applies
    assert.equal(stampSmil(host(2.5, true), '<animate dur="1s"/>'), '<animate dur="1s" begin="-2500ms"/>');
    assert.equal(stampSmil(host(2.5, true), '<cell>text</cell>'), '<cell>text</cell>');
});
