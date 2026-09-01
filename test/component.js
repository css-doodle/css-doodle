import test from 'node:test';
import assert from 'node:assert/strict';

import parseCss from '../src/parser/parse-css.js';
import generateCss from '../src/generator/css.js';
import parseGrid from '../src/parser/parse-grid.js';

// the component only defines its class when HTMLElement exists
globalThis.HTMLElement ??= class {};
const { CSSDoodle } = await import('../src/component/index.js');

test('reflow reads the host when no grid is rendered', () => {
    let touched = [];
    let noGrid = {
        shadowRoot: { querySelector: () => null },
        get offsetWidth() { touched.push('host'); return 0; }
    };
    assert.doesNotThrow(() => CSSDoodle.prototype.reflow.call(noGrid));
    assert.deepStrictEqual(touched, ['host']);

    let grid = { get offsetWidth() { touched.push('grid'); return 0; } };
    CSSDoodle.prototype.reflow.call({ shadowRoot: { querySelector: () => grid } });
    assert.deepStrictEqual(touched, ['host', 'grid']);
});

test('host-only rules ask for a reflow without rendering a grid', () => {
    // buildGrid and patch reflow on hasTransition/hasAnimation, but only
    // render <cssd-grid> when there are cell styles, container styles or
    // content — these doodles have neither
    for (let code of [
        ':doodle { animation: foo 1s; }',
        ':doodle { background: red; transition: background .4s; }',
    ]) {
        let compiled = generateCss(parseCss(code), parseGrid('1'), 42, 64);
        let { props, styles, content } = compiled;
        assert.ok(props.hasAnimation || props.hasTransition, code);
        assert.equal(styles.cells, '', code);
        assert.equal(styles.container, '', code);
        assert.equal(Object.keys(content).length, 0, code);
    }
});
