// Doodles drawn by render.js and pixel.js. Keep every case static and
// self-contained: nothing driven by time, no fonts from the network, no
// @use. A seed reproduces the randomness (1 unless `seed` says otherwise).
//
//   warnings  the messages its `warn` events carry, in order; none if left out
//   probes    [x, y, color] points the drawing must have, within a tolerance,
//             so they still hold on SwiftShader; pick them away from edges
//   blank     nothing is drawn, as with a shader that fails to compile
export default [
    {
        name: 'checker',
        code: `@grid: 6 / 120px; background: @pn(#000, #fff); @nth(2n) { background: tomato; }`,
        probes: [[10, 10, '#000'], [30, 10, '#ff6347']],
    },
    {
        name: 'index-content',
        code: `@grid: 4 / 120px; font: 12px/1 monospace; :after { content: "@i"; } color: @match(x > 2, red, blue); background: #eee; margin: 1px;`,
        probes: [[28, 28, '#eee']],
    },
    {
        name: 'shape-preset',
        code: `@grid: 3 / 120px; clip-path: @shape(circle); background: @pn(red, gold, teal); @nth(5) { clip-path: @shape(star); }`,
        probes: [[20, 20, '#f00'], [2, 2, '#fff'], [60, 60, '#ffd700']],
    },
    {
        name: 'shape-commands',
        code: `@grid: 1 / 120px; background: #09f; clip-path: @shape(split: 200; scale: .9; r: 1 + .3 * cos(6t));`,
        probes: [[60, 60, '#09f'], [2, 2, '#fff']],
    },
    {
        name: 'svg-times',
        code: `@grid: 2 / 120px; background: @svg(viewBox: 0 0 16 16; circle*4 { cx: @n(4); cy: 8; r: 1; fill: red; });`,
        probes: [[15, 30, '#f00'], [30, 10, '#fff']],
    },
    {
        name: 'svg-filter',
        code: `@grid: 1 / 120px; background: #fc0; filter: @svg-filter(feTurbulence { type: fractalNoise; baseFrequency: .05; seed: 3; } feDisplacementMap { in: SourceGraphic; scale: 30; });`,
        probes: [[60, 60, '#fc0']],
    },
    {
        name: 'place-size',
        code: `@grid: 1 / 120px; @size: 40px; @place: 30% 60%; background: #09f; :after { content: ""; position: absolute; inset: 4px; background: #fff; }`,
        probes: [[18, 72, '#09f'], [36, 72, '#fff'], [90, 20, '#fff']],
    },
    {
        name: 'gap-border',
        code: `@grid: 4 / 120px _4px #333; background: #fc0; @even { background: #0cf; }`,
        probes: [[10, 10, '#fc0'], [45, 10, '#0cf']],
    },
    {
        name: 'host-doodle',
        code: `@grid: 1 / 120px; :doodle { background: linear-gradient(45deg, #f0f, #0ff); border-radius: 30px; } background: none;`,
        probes: [[1, 1, '#fff']],
    },
    {
        name: 'nested',
        code: `@grid: 2 / 120px; background: @doodle(@grid: 3 / 100%; background: @pn(#000, #fff, #f00););`,
        probes: [[10, 10, '#000'], [30, 10, '#fff'], [50, 10, '#f00']],
    },
    {
        name: 'calc-vars',
        code: `@grid: 5 / 120px; --n: @i; width: $(n * 4)px; height: $(n * 4)px; background: hsl($(n * 14), 80%, 50%);`,
    },
    {
        name: 'media-hover',
        code: `@grid: 3 / 120px; background: #ddd; @media (min-width: 10px) { @x(2) { background: #333; } } :hover { background: red; }`,
        probes: [[60, 20, '#333'], [20, 20, '#ddd']],
    },
    {
        name: 'gradient-stripe',
        code: `@grid: 2 / 120px; background: linear-gradient(90deg, @stripe(red, gold, teal)); @y(2) { background: @svg-polygon(hexagon); }`,
        probes: [[5, 30, '#f00'], [55, 30, '#008080']],
    },
    {
        name: 'seeded-random',
        seed: 7,
        code: `@grid: 5 / 120px; background: @pick(red, gold, teal, #333); transform: rotate(@rand(360deg)) scale(@rand(.5, 1)); @random(.4) { border-radius: 50%; }`,
    },
    {
        name: 'shader-static',
        code: `@grid: 2 / 120px; background: @shaders(void main() { vec2 p = gl_FragCoord.xy / u_resolution; gl_FragColor = vec4(p.x, p.y, .5, 1.0); });`,
        probes: [[5, 55, '#0a0a80'], [55, 5, '#f5f580']],
    },
    {
        name: 'shader-content',
        code: `@grid: 2 / 120px; @content: @shaders(void main() { vec2 p = gl_FragCoord.xy / u_resolution; gl_FragColor = vec4(p.y, p.x, .2, 1.0); });`,
        probes: [[5, 5, '#f50a33'], [55, 55, '#0af533']],
    },
    {
        name: 'pattern',
        code: `@grid: 1 / 120px; background: @pattern(grid: 6; shape: circle; size: .8; match(x % 2 == 0) { fill: hsl(x / X, .7, .5); } match(x % 2 == 1) { fill: #223; });`,
        probes: [[10, 10, '#223'], [1, 1, '#fff']],
    },
    {
        name: 'pattern-match-gt',
        code: `@grid: 1 / 120px; background: @pattern(grid: 8; shape: circle; size: .9; match(x > y) { fill: #333; } match(x <= y) { fill: #eee; });`,
        probes: [[7, 7, '#eee'], [112, 7, '#333']],
    },
    {
        name: 'pattern-match-list',
        code: `@grid: 1 / 120px; background: @pattern(grid: 6; match(x < 3 or x > 4) { fill: #09f; } match(x >= 3 and x <= 4) { fill: #fc0; } match(mod(x, 2) == 0 and y > 3) { fill: red; });`,
        probes: [[10, 10, '#09f'], [60, 10, '#fc0'], [30, 100, '#f00']],
    },
    {
        name: 'depth',
        code: `@grid: 1x1x4 / 120px; background: @pn(#000, #444, #888, #ccc); @size: calc(100% - @z(*12px)); @place: center;`,
    },
    {
        name: 'scene',
        code: `@grid: 1 / 120px; background: @scene(sphere { r: .5; fill: #09f });`,
        probes: [[2, 2, '#fff'], [50, 40, '#0078c8']],
    },
    {
        name: 'scene-in-doodle',
        code: `@grid: 1 / 120px; background: @doodle(@grid: 1 / 100%; background: @scene(sphere { r: .5; fill: #09f }););`,
        probes: [[2, 2, '#fff'], [50, 40, '#0078c8']],
    },
    {
        name: 'pattern-in-doodle',
        code: `@grid: 1 / 120px; background: @doodle(@grid: 2 / 100%; background: @pattern(fill: #f00););`,
        probes: [[30, 30, '#f00'], [90, 90, '#f00']],
    },
    {
        name: 'texture-css',
        code: `@grid: 1 / 120px; background: @pattern(texture_0 { background: linear-gradient(90deg, #f00 50%, #00f 50%); } fill: texture(texture_0, uv););`,
        probes: [[20, 60, '#f00'], [100, 60, '#00f']],
    },
    {
        name: 'texture-pattern',
        code: `@grid: 1 / 120px; background: @pattern(texture_0 { background: @pattern(fill: #0c0); } fill: texture(texture_0, uv););`,
        probes: [[60, 60, '#0c0']],
    },
    {
        name: 'pattern-pseudo',
        code: `@grid: 1 / 120px; background: #eee; :after { content: ""; position: absolute; inset: 30px; background: @pattern(fill: #00f); }`,
        probes: [[10, 10, '#eee'], [60, 60, '#00f']],
    },
    {
        name: 'pattern-size',
        code: `@grid: 1 / 120px; background: @pattern20(fill: vec3(step(.5, uv.x)));`,
        probes: [[10, 60, '#000'], [110, 60, '#fff'], [60, 60, '#909090']],
    },
    {
        name: 'host-only',
        code: `:doodle { width: 120px; height: 120px; background: #09f; }`,
        probes: [[60, 60, '#09f']],
    },
    {
        name: 'svg-content',
        code: `@grid: 1 / 120px; @content: @svg(viewBox: 0 0 10 10; rect { width: 10; height: 5; fill: red; });`,
        probes: [[60, 20, '#f00'], [60, 100, '#fff']],
    },
    {
        name: 'nested-warning',
        code: `@grid: 1 / 120px; background: @doodle(@grid: 1 / 100%; background: @pikc(red););`,
        warnings: ['unknown function @pikc()'],
        blank: true,
    },
    {
        // an unknown name reads 0, so this fills black rather than drawing nothing
        name: 'pattern-unknown-name',
        code: `@grid: 1 / 120px; background: @pattern(fill: vec3(foo));`,
        warnings: ['unknown name foo'],
        probes: [[60, 60, '#000']],
    },
    {
        name: 'pattern-glsl-error',
        code: `@grid: 1 / 120px; background: @pattern(fill: vec3(nosie(uv)));`,
        warnings: ["@pattern: no matching overloaded function found at 'nosie'"],
        blank: true,
    },
    {
        name: 'shaders-glsl-error',
        code: `@grid: 1 / 120px; background: @shaders(void main() { gl_FragColor = vec4(foo); });`,
        warnings: [`@shaders: undeclared identifier at 'foo' in "gl_FragColor = vec4(foo)"`],
        blank: true,
    },
];
