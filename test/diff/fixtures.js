/**
 * Hand-written fixtures for the parse-css / generator differential harness.
 * Each case: { name, code, extra? } where extra is a plain map backing
 * extra.getVariable for @use.
 */
export default [

  // --- plain rules and values ---
  { name: 'rule-basic', code: `color: red; width: 10px;` },
  { name: 'rule-multi-value', code: `margin: 1px 2px 3px 4px; background: linear-gradient(45deg, red, blue);` },
  { name: 'rule-comma-groups', code: `background-size: 10px 10px, cover; transition: all .2s, color 1s ease;` },
  { name: 'rule-repeat-fr', code: `grid-template-columns: repeat(3, 1fr);` },
  { name: 'rule-hex-color', code: `color: #f00; border-color: #00ff0080;` },
  { name: 'rule-numbers', code: `opacity: .5; width: 10e2px; --x: 0x1f; z-index: -1;` },
  { name: 'rule-important', code: `color: red !important;` },
  { name: 'rule-custom-prop', code: `--size: 10px; width: var(--size, 4px);` },
  { name: 'rule-url', code: `background: url(https://example.com/a.png) no-repeat;` },
  { name: 'value-nth-spaces', code: `width: calc(100% - 10px); height: calc( 100% / 3 );` },

  // --- quotes and content ---
  { name: 'content-empty', code: `:after { content: ""; }` },
  { name: 'content-paren', code: `:after { content: "("; }` },
  { name: 'content-brace', code: `:after { content: "}"; }` },
  { name: 'content-semi', code: `:after { content: "x;"; }` },
  { name: 'content-quote-mix', code: `:after { content: "it's"; }` },
  { name: 'content-at', code: `:after { content: '@'; }` },
  { name: 'content-escaped-quote', code: `:after { content: "a\\"b"; } color: red;` },
  { name: 'content-backtick', code: `@content: @svg(text { content: \`hi\`; });` },
  { name: 'content-unbalanced-quote', code: `:after { content: "oops; color: red;` },

  // --- comments ---
  { name: 'comment-before-rule', code: `/* note */ color: red;` },
  { name: 'comment-leading-tight', code: `/*x*/color: red;` },
  { name: 'comment-in-value', code: `width: /* c */ 10px;` },
  { name: 'comment-in-args', code: `background: @pick(/*c*/ red, blue);` },
  { name: 'comment-in-string', code: `:after { content: "a /* b */ c"; }` },

  // --- pseudo selectors ---
  { name: 'pseudo-nth', code: `:nth-child(2n - 1) { color: red; }` },
  { name: 'pseudo-nth-spaced', code: `:nth-child( 2n - 1 ) { color: blue; }` },
  { name: 'pseudo-multi', code: `:before, :after { content: "x"; color: red; }` },
  { name: 'pseudo-nested', code: `:hover { color: red; :after { content: "!"; } }` },
  { name: 'pseudo-doodle-host', code: `:doodle { @grid: 4 / 100px; background: red; }` },
  { name: 'pseudo-container', code: `:container { display: flex; }` },

  // --- functions ---
  { name: 'func-basic', code: `background: @pick(red, blue, green);` },
  { name: 'func-nested', code: `background: @pick(@pick(red, pink), blue);` },
  { name: 'func-rand-range', code: `width: @rand(10px, 20px); height: @r(2em);` },
  { name: 'func-plusminus', code: `transform: rotate(@pick(±45deg));` },
  { name: 'func-pi', code: `--a: @calc(2π); --b: @calc(2 π); rotate: @r(π, 2π)rad;` },
  { name: 'func-index-vars', code: `background: @pick(@i, @x, @y, @n, @nx, @ny);` },
  { name: 'func-trailing-digit', code: `background: @p(red, blue); border-color: @p3(red, blue, pink);` },
  { name: 'func-rand2', code: `--n: @rand2(30);` },
  { name: 'func-composition', code: `background: @p(red, blue).nth(2);` },
  { name: 'func-composition-chain', code: `--v: @i.mul(2).add(3);` },
  { name: 'func-composition-dot', code: `background: @stripe(red, blue).noise(10%);` },
  { name: 'func-empty-args', code: `background: @p();` },
  { name: 'func-trailing-comma', code: `background: @p(red,);` },
  { name: 'func-no-paren', code: `width: @i0px; content: "@i";` },
  { name: 'func-multiline-args', code: `background: @pick(\n  red,\n  blue\n);` },

  // --- function registry coverage (diff vs legacy function.js) ---
  { name: 'func-stripe', code: `background: linear-gradient(@stripe(red, blue, green));` },
  { name: 'func-stripe-sized', code: `background: linear-gradient(@stripe(red 20%, blue, green 30%));` },
  { name: 'func-cycle', code: `--v: @p(@cycle(red, blue, green));` },
  { name: 'func-mirror', code: `--v: @p(@mirror(a, b, c)); --w: @p(@Mirror(a, b, c));` },
  { name: 'func-code', code: `:after { content: @code(9728); }` },
  { name: 'func-hex', code: `--h: @hex(255); --g: @hex(abc);` },
  { name: 'func-once', code: `--o: @once(@i);` },
  { name: 'func-path-invert', code: `--p: @invert(M 0 0 L 5 5 v 2 h 3);` },
  { name: 'func-path-flip', code: `--a: @flipH(M 0 0 h 5 v 5); --b: @flipV(M 0 0 h 5 v 5); --c: @flip(M 0 0 h 5 v 5); --d: @reverse(M 0 0 h 5 v 5);` },
  { name: 'func-last-pick', code: `background: @p(red, blue); border-color: @lp;` },
  { name: 'func-last-rand', code: `--r: @r(10); --l: @lr;` },
  { name: 'func-pick-by-turn', code: `--a: @m5(@pl(x, y, z)); --b: @m5(@pr(x, y, z)); --c: @m5(@pd(x, y, z));` },
  { name: 'func-pick-turn-standalone', code: `--a: @pl(x, y, z); --b: @pd(1, 2, 3); background: @pr(red, blue);` },
  { name: 'func-pick-upstream', code: `--v: @m3(@PD(a, b, c)); --w: @m3(@PL(a, b, c));` },
  { name: 'func-pick-range', code: `--v: @m6(@p([a-f]));` },
  { name: 'func-plot', code: `--p: @plot(r 5); --q: @Plot(r 5); --s: @m4(@plot(r 5));` },
  { name: 'func-ri', code: `--i: @ri(1, 10);` },
  { name: 'func-rn-named', code: `--n: @rn(from=-1, to=1, frequency=2, octave=2);` },
  { name: 'func-m-forms', code: `--a: @m2x3(@nx @ny); --b: @m1-4(@n); --c: @M3(@n); --d: @repeat3(x); --e: @rep3(y);` },
  { name: 'func-m-no-action', code: `--v: @m(3);` },
  { name: 'func-match', code: `background: @match(x > 2, red, blue); --v: @m6(@match(n > 3, big, small));` },
  { name: 'func-nd', code: `--v: @m3(@nd(1)); --w: @m3(@nd);` },
  { name: 'func-n-in-argument', code: `--u: @pick(@n, @nx);` },
  { name: 'func-id', code: `--id: @id;` },
  { name: 'func-svg-polygon', code: `background: @svg-polygon(circle);` },
  { name: 'func-gradient', code: `background: @linearGradient(red, blue); border-image-source: @radialGradient(red, blue);` },
  { name: 'func-var', code: `--c: 10px; width: @var(--c);` },
  { name: 'func-uniform-time', code: `--t: @ut;` },

  // --- calc / $ ---
  { name: 'calc-dollar', code: `width: $(2 * 5)px;` },
  { name: 'calc-dollar-short', code: `--w: $w2;` },
  { name: 'calc-adjacent-parens', code: `width: $((5) % (3))px; height: $((5 + 20) % (3))px;` },
  { name: 'calc-wrap-whole', code: `width: $((5 % 3))px;` },
  { name: 'calc-in-func', code: `background: @pick(@calc(1 + 2), 3);` },

  // --- cond selectors ---
  { name: 'cond-even-odd', code: `@even { color: red; } @odd { color: blue; }` },
  { name: 'cond-nth', code: `@nth(2n - 1) { color: red; }` },
  { name: 'cond-nth-tight', code: `@nth(2n-1) { color: red; }` },
  { name: 'cond-random', code: `@random { color: red; } @random(.5) { color: blue; }` },
  { name: 'cond-not', code: `@nth(not 2) { color: red; }` },
  { name: 'cond-nested', code: `@even { color: red; @odd { color: blue; } }` },
  { name: 'cond-pseudo-inside', code: `@even { :after { content: "e"; } }` },
  { name: 'cond-media', code: `@media (min-width: 100px) { color: red; }` },
  { name: 'cond-media-pseudo', code: `@media (min-width: 100px) { :after { content: "m"; } color: red; }` },
  { name: 'cond-supports', code: `@supports (display: grid) { color: red; }` },
  { name: 'cond-amp', code: `:after { content: "x"; & { color: red; } }` },
  { name: 'cond-rule-inside', code: `@even { @size: 10px; --v: 1; }` },

  // --- at-rules ---
  { name: 'at-rule-import', code: `@import url(x.css);` },

  // --- keyframes ---
  { name: 'keyframes-basic', code: `animation: spin 1s linear infinite; @keyframes spin { from { rotate: 0deg } to { rotate: 360deg } }` },
  { name: 'keyframes-percent', code: `animation: x 2s; @keyframes x { 0% { opacity: 0 } 50% { opacity: .5 } 100% { opacity: 1 } }` },
  { name: 'keyframes-multi-step-name', code: `animation: y 1s; @keyframes y { 0%, 100% { scale: 1 } 50% { scale: .5 } }` },
  { name: 'keyframes-dynamic-name', code: `animation: z 1s; @keyframes z { @pick(from, to) { opacity: @r(1) } }` },
  { name: 'keyframes-in-cond', code: `@even { animation: k 1s; @keyframes k { to { opacity: 0 } } }` },

  // --- special properties ---
  { name: 'prop-grid', code: `:doodle { @grid: 4x4 / 200px; } background: @p(red, blue);` },
  { name: 'prop-grid-flex', code: `@grid: 3 / 100%; background: red;` },
  { name: 'prop-gap', code: `:doodle { @grid: 4 / 80px; @gap: 2px; } background: red;` },
  { name: 'prop-seed', code: `@seed: 42; background: @p(red, blue, pink);` },
  { name: 'prop-seed-host', code: `:doodle { @seed: 7; @grid: 3 / 60px; } color: @p(red, blue);` },
  { name: 'prop-place', code: `@place: center; @size: 10px; background: red;` },
  { name: 'prop-shape', code: `clip-path: @shape(circle); background: red;` },
  { name: 'prop-size-ratio', code: `@size: 4em 2em; background: red;` },
  { name: 'prop-content', code: `@content: hello; color: red;` },
  { name: 'prop-animation-multi', code: `animation-name: a, b; @keyframes a { to { opacity: 0 } } @keyframes b { to { scale: 2 } }` },
  { name: 'prop-bg-size-set', code: `background-size: contain; background: @doodle( @grid: 2 / 100% ; background: red; );` },

  // --- doodle-mode bodies (raw, newline-preserving) ---
  {
    name: 'doodle-nested',
    code: `background: @doodle(\n  @grid: 2 / 100%;\n  background: @p(red, blue);\n);`
  },
  {
    name: 'shaders-glsl',
    code: `background: @shaders(\n  // it is a comment\n  vec3 color = vec3(0.0);\n  void main() {\n    gl_FragColor = vec4(color, 1.0); /* block */\n  }\n);`
  },
  {
    name: 'pattern-lines',
    code: `background: @pattern(\n  // grid lines\n  grid: 10;\n  match(gx % 2 == 0) {\n    fill: #000;\n  }\n);`
  },
  { name: 'canvas-body', code: `background: @canvas(\n  ctx.fillStyle = 'red';\n  ctx.fillRect(0, 0, 16, 16);\n);` },

  // --- svg ---
  { name: 'svg-basic', code: `background: @svg(svg { circle { cx: 8; cy: 8; r: 8; fill: red; } });` },
  { name: 'svg-quotes', code: `@content: @svg( text { content: "}"; });` },
  {
    name: 'svg-times',
    code: `background: @svg(viewBox: 0 0 16 16; circle*4 { cx: @n(4); cy: 8; r: 1; fill: red; });`
  },
  {
    name: 'svg-variables',
    code: `background: @svg(svg { $c: red; circle { cx: 8; cy: 8; r: 4; fill: $c; } });`
  },

  // --- @use ---
  {
    name: 'use-basic',
    code: `@use: var(--rule); color: blue;`,
    extra: { '--rule': 'width: 10px; height: 10px;' }
  },
  {
    name: 'use-nested-pseudo',
    code: `:after { @use: var(--deco); content: "d"; }`,
    extra: { '--deco': 'color: red; border: 1px solid;' }
  },
  {
    name: 'use-fallback',
    code: `@use: var(--missing, var(--other)); color: green;`,
    extra: { '--other': 'padding: 2px;' }
  },

  // --- misc structure ---
  { name: 'tag-skip', code: `<div>color: red;` },
  { name: 'value-lt-in-word', code: `@content: a</b;` },
  { name: 'stray-semicolons', code: `;;color: red;;;` },
  { name: 'empty-input', code: `` },
  { name: 'only-comment', code: `/* nothing here */` },
  { name: 'var-in-func', code: `--c: red; background: @p(var(--c), blue);` },
  { name: 'unicode-symbols', code: `--a: @calc(5 ≥ 3); --b: @calc(2 ≤ 1);` },
];
