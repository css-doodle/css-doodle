import test from 'node:test';
import assert from 'node:assert/strict';

import parseCss from '../../src/parser/parse-css.js';
import parseGrid from '../../src/parser/parse-grid.js';
import generateCss from '../../src/generator/css.js';
import { getBasicStyles } from '../../src/component/markup.js';
import prerender from '../../src/exports/generator/prerender.js';

function shadowStyle(html) {
    return /<template shadowrootmode="open"><style>([\s\S]*?)<\/style>/.exec(html)[1];
}

test('renders a declarative shadow root after the source', async () => {
    let code = '@grid: 2 / 100px; background: @p(red, blue);';
    let { html, seed, needs, warnings } = await prerender(code, { seed: 3 });
    assert.equal(seed, 3);
    assert.deepEqual(needs, []);
    assert.deepEqual(warnings, []);
    assert.ok(html.startsWith(`<css-doodle role="img" seed="3">${code}<template shadowrootmode="open"><style>`));
    assert.ok(html.endsWith('</grid></template></css-doodle>'));
    assert.equal(html.match(/<cell id="c-\d-\d-1" part="cell"><\/cell>/g).length, 4);
});

test('the shadow sheet is the one the runtime writes', async () => {
    let code = '@grid: 3 / 90px; transform: rotate(@r(360deg)); :after { content: @i; }';
    let { html } = await prerender(code, { seed: 'abc' });
    let compiled = generateCss(parseCss(code), parseGrid(null), 'abc', 64, null, [], 'x');
    let sheet = compiled.styles.top + getBasicStyles(compiled.grid) + compiled.styles.all;
    assert.equal(shadowStyle(html), sheet.replace(/\n\s+/g, ' '));
});

test('the same input renders the same output', async () => {
    let code = '@grid: 4; background: hsl(@r(360) 50% 50%); filter: @svg-filter(<svg><filter><feTurbulence baseFrequency=".1"/></filter></svg>);';
    let a = await prerender(code, { seed: 9 });
    let b = await prerender(code, { seed: 9 });
    let c = await prerender(code, { seed: 10 });
    assert.equal(a.html, b.html);
    assert.notEqual(a.html, c.html);
});

test('the seed comes from options or the seed attribute', async () => {
    let code = '@grid: 1; background: red;';
    assert.match((await prerender(code, { seed: 5, attributes: { seed: 6 } })).html, / seed="5"/);
    assert.match((await prerender(code, { attributes: { seed: 6 } })).html, / seed="6"/);
    // without one the source picks it, and it is written out so the runtime can redraw it
    let picked = await prerender(code);
    assert.equal(typeof picked.seed, 'number');
    assert.match(picked.html, new RegExp(` seed="${picked.seed}"`));
    assert.equal((await prerender(code)).html, picked.html);
    assert.notEqual((await prerender(code + ' ')).seed, picked.seed);
    assert.notEqual((await prerender(code, { attributes: { grid: '2' } })).seed, picked.seed);
});

test('attributes are kept and escaped', async () => {
    let { html } = await prerender('background: red;', {
        seed: 1,
        attributes: { grid: '5', 'click:update': '', title: 'a "b" & c' },
    });
    assert.match(html, /^<css-doodle role="img" grid="5" click:update title="a &quot;b&quot; &amp; c" seed="1">/);
    assert.equal(html.match(/<cell /g).length, 25);
});

test('the source is escaped as text', async () => {
    let code = '@content: "<b>&amp;</b>";';
    let { html } = await prerender(code, { seed: 1 });
    assert.ok(html.includes('>@content: "&lt;b>&amp;amp;&lt;/b>";<template'));
});

test('a closing style tag in the sheet does not end the style element', async () => {
    let { html } = await prerender('@grid: 1; :after { content: "</style><b>x</b></STYLE >"; }', { seed: 1 });
    assert.match(shadowStyle(html), /content:"<\\\/style><b>x<\/b><\\\/STYLE >"/);
});

test('an unmatched closing template tag in content does not end the shadow root', async () => {
    let stray = await prerender('@grid: 2; @content: "</template >hi";', { seed: 1 });
    assert.equal(stray.html.match(/<cell [^>]+>hi<\/cell>/g).length, 4);
    let kept = await prerender('@grid: 1; @content: "<template><i>t</i></template>ok";', { seed: 1 });
    assert.match(kept.html, /<cell [^>]+><template><i>t<\/i><\/template>ok<\/cell>/);
});

test('nested doodles are resolved to svg images', async () => {
    let { html } = await prerender('@grid: 2; background: @doodle(@grid: 2; background: @p(red, blue));', { seed: 1 });
    let style = shadowStyle(html);
    assert.doesNotMatch(style, /\$\{/);
    assert.equal(style.match(/url\("data:image\/svg\+xml,/g).length, 4);
});

test('filter defs go in the shadow root and a slotted light child', async () => {
    let code = '@grid: 1; filter: @svg-filter(<svg><filter><feTurbulence baseFrequency=".1"/></filter></svg>);';
    let { html } = await prerender(code, { seed: 1 });
    let id = /filter:url\(#([\w-]+)\)/.exec(html)[1];
    assert.match(html, new RegExp(`<slot name="ft"></slot><ft style="[^"]+"><svg[^>]*> ?<filter id="${id}"`));
    assert.match(html, new RegExp(`</template><ft slot="ft" style="[^"]+"><svg[^>]*> ?<filter id="${id}"`));
    // another doodle on the same page gets other ids
    let other = await prerender(code, { seed: 2 });
    assert.notEqual(/filter:url\(#([\w-]+)\)/.exec(other.html)[1], id);
    // so does the same source with other variables
    let withRule = async color => /filter:url\(#([\w-]+)\)/.exec((await prerender(code, {
        seed: 1,
        attributes: { use: 'var(--rule)' },
        variables: { '--rule': `(color: ${color};)` },
    })).html)[1];
    assert.notEqual(await withRule('red'), await withRule('blue'));
});

test('needs lists what only the runtime can do', async () => {
    let needs = async (code, options = {}) => (await prerender(code, { seed: 1, ...options })).needs;
    assert.deepEqual(await needs('background: @shaders(void main() {});'), ['shader']);
    assert.deepEqual(await needs('background: @pattern(grid: 2; fill: 1;);'), ['shader']);
    assert.deepEqual(await needs('background: @doodle(background: @shaders(void main() {}));'), ['shader']);
    assert.deepEqual(await needs('left: @ux;'), ['mouse']);
    assert.deepEqual(await needs('width: @uw;'), ['size']);
    assert.deepEqual(await needs('rotate: @TS(*6deg);'), ['clock']);
    assert.deepEqual(await needs('background: @doodle(rotate: @TS(*6deg));'), ['clock']);
    assert.deepEqual(await needs('rotate: @t(*1deg);'), []);
    assert.deepEqual(await needs('color: red;', { attributes: { 'click:update': '' } }), ['update']);
    assert.deepEqual(await needs('color: red;', { attributes: { 'auto:update': '2s' } }), ['update']);
    assert.deepEqual(await needs('color: red; transition: color 1s;'), []);
    assert.deepEqual(await needs('', { attributes: { use: 'var(--rule)' } }), ['variables']);
});

test('use reads variables from options', async () => {
    let { html, needs } = await prerender('', {
        seed: 1,
        attributes: { use: 'var(--rule)' },
        variables: { '--rule': ' (@grid: 3; background: teal;) ' },
    });
    assert.deepEqual(needs, []);
    assert.equal(html.match(/<cell /g).length, 9);
    assert.match(shadowStyle(html), /background:teal/);
});

test('the time uniform is registered in the document', async () => {
    let { html } = await prerender('rotate: @t(*1deg);', { seed: 1 });
    assert.match(html, /^<style>@property --cssd-utime\{[^}]+\}@property --cssd-UTime\{[^}]+\}<\/style><css-doodle /);
    let plain = await prerender('color: red;', { seed: 1 });
    assert.ok(plain.html.startsWith('<css-doodle '));
});

test('google fonts are linked before the element', async () => {
    let { html } = await prerender('font-family: @google-font(Lato);', { seed: 1 });
    assert.match(html, /^<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com\/css\?display=swap&amp;family=Lato"><css-doodle /);
});

test('warnings are returned', async () => {
    let { warnings } = await prerender('color: @nope(1);', { seed: 1 });
    assert.match(warnings[0].message, /unknown function @nope/);
});

test('shader and pattern images are left as unset variables', async () => {
    for (let code of [
        '@grid: 2; background: @shaders(void main() {});',
        '@grid: 2; background: @pattern(grid: 2; fill: 1;);',
        '@grid: 2; background: @doodle(background: @shaders(void main() {}));',
    ]) {
        let style = shadowStyle((await prerender(code, { seed: 1 })).html);
        assert.doesNotMatch(style, /\$\{/, code);
    }
    let style = shadowStyle((await prerender('@grid: 1; background: @shaders(void main() {});', { seed: 1 })).html);
    assert.match(style, /background:var\(--[\w-]+\)/);
});

test('cell transitions start from no cell rules, as the element paints them', async () => {
    let starting = '@starting-style{cell,bd{all:revert!important}}';
    let { html } = await prerender('@grid: 2; background: red; transition: background 1s;', { seed: 1 });
    assert.ok(shadowStyle(html).endsWith(starting));
    let plain = await prerender('@grid: 2; background: red;', { seed: 1 });
    assert.ok(!plain.html.includes('@starting-style'));
});

test('a still sized nested doodle is framed, an animated one is left for the runtime', async () => {
    let still = await prerender('@grid: 1; background: @doodle200(@grid: 2; background: @p(red, blue));', { seed: 1 });
    assert.deepEqual(still.needs, []);
    assert.match(shadowStyle(still.html), /url\("data:image\/svg\+xml,%3Csvg width=%22200px%22 [^"]*%3Cimage /);

    let moving = await prerender('@grid: 1; background: @doodle200(background: red; animation: s 1s infinite; @keyframes s { to { opacity: 0; } });', { seed: 1 });
    assert.deepEqual(moving.needs, ['safari']);
    assert.doesNotMatch(shadowStyle(moving.html), /%3Cimage /);

    let unsized = await prerender('@grid: 1; background: @doodle(background: red);', { seed: 1 });
    assert.doesNotMatch(shadowStyle(unsized.html), /%3Cimage /);
});

test('a cssd-paused attribute renders the paused sheet', async () => {
    let code = '@grid: 1 / 100px; background: @doodle(@grid: 2; background: red);';
    let { html } = await prerender(code, { seed: 1, attributes: { 'cssd-paused': '' } });
    assert.match(html, /background:url\("data:image\/svg\+xml/);
});
