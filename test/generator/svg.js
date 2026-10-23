import test from 'node:test';
import assert from 'node:assert/strict';

import parseSvg from '../../src/parser/parse-svg.js';
import generateSvg from '../../src/generator/svg.js';

const svg = input => generateSvg(parseSvg(input));

// expected markup is written indented; strip the layout whitespace
const markup = text => text.split(/\n+/g).map(n => n.trim()).join('');

const NS = 'xmlns="http://www.w3.org/2000/svg"';

// Generated ids (linearGradient-1, circle-2, g-3, …) come from one
// counter shared across this file: keep the tests that use them in order.

test('empty input and a bare svg block', () => {
    assert.equal(svg(''), `<svg ${NS}></svg>`);
    assert.equal(svg('svg {}'), `<svg ${NS}></svg>`);
});

test('elements are wrapped in svg by default', () => {
    assert.equal(svg('g {}'), `<svg ${NS}><g/></svg>`);
});

test('an inline defs element is referenced by url(#id)', () => {
    assert.equal(svg(`svg {
        circle {
            filter: defs linearGradient {}
        }
    }`), markup(`
        <svg ${NS}>
            <defs>
                <linearGradient id="linearGradient-1"/>
            </defs>
            <circle filter="url(#linearGradient-1)"/>
        </svg>
    `));
});

test('an inline defs element on href is referenced by #id', () => {
    assert.equal(svg(`svg {
        use {
            href: defs circle {}
        }
    }`), markup(`
        <svg ${NS}>
            <defs>
                <circle id="circle-2"/>
            </defs>
            <use href="#circle-2"/>
        </svg>
    `));
});

test('#id shorthand', () => {
    assert.equal(svg('circle#id {}'), `<svg ${NS}><circle id="id"/></svg>`);
});

test('content becomes the text node', () => {
    assert.equal(svg('text { content: hello; }'), `<svg ${NS}><text>hello</text></svg>`);
    assert.equal(svg('title { content: hello; } desc { content: world; }'),
        `<svg ${NS}><title>hello</title><desc>world</desc></svg>`);
    // several contents concatenate
    assert.equal(svg('svg { text { content: hello; content: world; } }'),
        `<svg ${NS}><text>helloworld</text></svg>`);
});

test('quotes around text are removed, special characters inside stay', () => {
    assert.equal(svg('text { content: "hello"; }'), `<svg ${NS}><text>hello</text></svg>`);
    assert.equal(svg(`text { content: 'hello'; }`), `<svg ${NS}><text>hello</text></svg>`);
    assert.equal(svg('text { content: "}"; }'), `<svg ${NS}><text>}</text></svg>`);
});

test('a style block prints its rules, inline style declarations join', () => {
    assert.equal(svg(`svg {
        circle {}
        style {
            circle {
                fill: red;
            }
            circle:nth-child(1) {
            }
        }
    }`), markup(`
        <svg ${NS}>
            <circle/>
            <style>
                circle{fill:red;}
                circle:nth-child(1){}
            </style>
        </svg>
    `));
    assert.equal(svg(`svg {
        circle {
            style fill: red;
            style r: 1;
        }
    }`), `<svg ${NS}><circle style="fill:red;r:1;"/></svg>`);
});

test('elements with the same id at the same level merge', () => {
    assert.equal(svg(`svg {
        g#id { circle {} }
        g#id { rect {} }
    }`), markup(`
        <svg ${NS}>
            <g id="id">
                <circle/>
                <rect/>
            </g>
        </svg>
    `));
    // not across levels
    assert.equal(svg(`svg {
        g g#id { circle {} }
        g#id { rect {} }
    }`), markup(`
        <svg ${NS}>
            <g>
                <g id="id">
                    <circle/>
                </g>
            </g>
            <g id="id">
                <rect/>
            </g>
        </svg>
    `));
    // attributes and text merge too
    assert.equal(svg(`svg {
        circle#a {
            fill: red
        }
        circle#a {
            cx, cy, r: 5;
        }
    }`), `<svg ${NS}><circle fill="red" id="a" cx="5" cy="5" r="5"/></svg>`);
    assert.equal(svg(`svg {
        text#id { content: hello; }
        text#id { content: world; }
    }`), `<svg ${NS}><text id="id">helloworld</text></svg>`);
    assert.equal(svg(`svg {
        text#id {
            content: hello;
            tspan { content: ok; }
        }
        text#id { content: world; }
    }`), `<svg ${NS}><text id="id">hello<tspan>ok</tspan>world</text></svg>`);
    // elements without an id never merge
    assert.equal(svg(`svg {
        circle { fill: red }
        circle { cx, cy, r: 5; }
    }`), `<svg ${NS}><circle fill="red"/><circle cx="5" cy="5" r="5"/></svg>`);
});

test('quoted attribute values are normalized', () => {
    assert.equal(svg('circle { name: "hello"; }'), `<svg ${NS}><circle name="hello"/></svg>`);
    assert.equal(svg(`circle { name: 'hello'; }`), `<svg ${NS}><circle name="hello"/></svg>`);
});

test('draw animates the stroke over the given duration', () => {
    const drawn = animate => markup(`
        <svg ${NS}>
            <path stroke-dasharray="10" pathLength="10">
                <animate attributeName="stroke-dashoffset" from="10" to="0" ${animate}/>
            </path>
        </svg>
    `);
    assert.equal(svg('path { draw: 2s; }'), drawn('dur="2s"'));
    assert.equal(svg('path { draw: 2; }'), drawn('dur="2"'));
    assert.equal(svg('path { draw: 2s infinite; }'), drawn('dur="2s" repeatCount="indefinite"'));
    assert.equal(svg('path { draw: infinite 2s; }'), drawn('dur="2s" repeatCount="indefinite"'));
});

test('defs blocks combine into one', () => {
    assert.equal(svg('defs {} defs {}'), `<svg ${NS}><defs/></svg>`);
    assert.equal(svg('defs g {} defs path {}'), `<svg ${NS}><defs><g/><path/></defs></svg>`);
});

test('nested inline defs each get an id', () => {
    assert.equal(svg(`path {
        fill: defs g {
            mask: defs g {}
        }
    }`), markup(`
        <svg ${NS}>
            <defs>
                <g id="g-3"/>
                <g mask="url(#g-3)" id="g-4"/>
            </defs>
            <path fill="url(#g-4)"/>
        </svg>
    `));
});

test('an explicit id on a defs element is shared', () => {
    assert.equal(svg('defs g#1 {} defs g#1 {}'), `<svg ${NS}><defs><g id="1"/></defs></svg>`);
    assert.equal(svg(`
        path { href: defs g#1 {} }
        path { href: defs g#1 {} }
    `), `<svg ${NS}><defs><g id="1"/></defs><path href="#1"/><path href="#1"/></svg>`);
});

test('the generated id lands on the outermost defs element', () => {
    assert.equal(svg(`svg {
        circle {
            filter: defs g circle {}
        }
    }`), markup(`
        <svg ${NS}>
            <defs>
                <g id="g-5">
                    <circle/>
                </g>
            </defs>
            <circle filter="url(#g-5)"/>
        </svg>
    `));
    assert.equal(svg(`svg {
        circle {
            filter: defs g g g circle {}
        }
    }`), markup(`
        <svg ${NS}>
            <defs>
                <g id="g-6">
                    <g>
                        <g>
                            <circle/>
                        </g>
                    </g>
                </g>
            </defs>
            <circle filter="url(#g-6)"/>
        </svg>
    `));
});

test('viewBox with padding, incomplete viewBox dropped', () => {
    assert.equal(svg('svg { viewBox: 0 0 10 10 p 2; }'), `<svg ${NS} viewBox="-2 -2 14 14"></svg>`);
    assert.equal(svg('svg { viewBox: 0 0 10; }'), `<svg ${NS}></svg>`);
});

test('no id for multiple inline defs child elements', () => {
    assert.equal(svg(`svg {
        circle {
            filter: defs {
                a {}
                b {}
            }
        }
    }`), `<svg ${NS}><defs><a/><b/></defs><circle filter=""/></svg>`);
});

test('a selector of nothing but spaces opens no block', () => {
    // getSelectors returned [''] for a whitespace-only fragment, which
    // reached the generator as a tag with no name and threw
    assert.equal(svg('text `content: {hi`;'), `<svg ${NS}></svg>`);
    assert.equal(svg('a { { } }'), `<svg ${NS}><a/></svg>`);
    // named selectors are untouched
    assert.equal(svg('g circle { fill: red }'), `<svg ${NS}><g><circle fill="red"/></g></svg>`);
});

test('text and attribute values are escaped, markup and entities pass through', () => {
    assert.equal(svg('text { content: Tom & Jerry }'), `<svg ${NS}><text>Tom &amp; Jerry</text></svg>`);
    assert.equal(svg('text { content: 1 < 2 }'), `<svg ${NS}><text>1 &lt; 2</text></svg>`);
    assert.equal(svg('a { href: https://x.com/?a=1&b=2 }'), `<svg ${NS}><a href="https://x.com/?a=1&amp;b=2"/></svg>`);
    assert.equal(svg('text { content: <tspan>a</tspan> b &amp; }'),
        `<svg ${NS}><text><tspan>a</tspan> b &amp;</text></svg>`);
    assert.equal(svg('style { a > b { fill: red } }'), `<svg ${NS}><style>a > b{fill:red}</style></svg>`);
});

test('script tags, event handlers and javascript: links are dropped', () => {
    assert.equal(svg('script { content: alert(1) } rect { onload: alert(1); fill: red }'),
        `<svg ${NS}><rect fill="red"/></svg>`);
    assert.equal(svg('svg { onLoad: alert(1) } a { href: javascript:alert(1) }'), `<svg ${NS}><a/></svg>`);
    // references and whitespace inside the scheme do not slip past
    assert.equal(svg('a { href: "&#106;avascript:alert(1)" }'), `<svg ${NS}><a/></svg>`);
    assert.equal(svg('a { href: "jav&#x0A;ascript:alert(1)" }'), `<svg ${NS}><a/></svg>`);
});

test('comma selectors and the child combinator', () => {
    assert.equal(svg('circle, rect { fill: red }'), `<svg ${NS}><circle fill="red"/><rect fill="red"/></svg>`);
    assert.equal(svg('g > circle { fill: red }'), `<svg ${NS}><g><circle fill="red"/></g></svg>`);
});

test('names are matched against the svg camelCase names', () => {
    assert.equal(svg('defs { lineargradient#g { gradientunits: userSpaceOnUse } } fegaussianblur { stddeviation: 2 }'),
        `<svg ${NS}><defs><linearGradient gradientUnits="userSpaceOnUse" id="g"/></defs><feGaussianBlur stdDeviation="2"/></svg>`);
    assert.equal(svg('viewbox: 0 0 1 1'), `<svg ${NS} viewBox="0 0 1 1"></svg>`);
    // unknown names are lowercased like in html
    assert.equal(svg('Cirlce { stopColor: red }'), `<svg ${NS}><cirlce stopcolor="red"/></svg>`);
    // names that are also Object.prototype keys are ordinary names
    assert.equal(svg('constructor { __proto__: 1; toString: 2 }'), `<svg ${NS}><constructor __proto__="1" tostring="2"/></svg>`);
    // the generator's own decisions see the canonical name
    assert.equal(svg('Circle { draw: 1s }').includes('<animate'), true);
    assert.equal(svg('feGaussianBlur { animate stddeviation: 1; 5 / 1s }'),
        `<svg ${NS}><feGaussianBlur><animate attributeName="stdDeviation" values="1;5" dur="1s"/></feGaussianBlur></svg>`);
});

test('a leading lineto in d becomes the moveto, so @arc data chains', () => {
    assert.equal(svg('path { d: L 10 0 A 10 10 0 0 1 0 10 L 0 5 L 0 5 A 5 5 0 0 0 5 0 Z }'),
        `<svg ${NS}><path d="M 10 0 A 10 10 0 0 1 0 10 L 0 5 L 0 5 A 5 5 0 0 0 5 0 Z"/></svg>`);
    assert.equal(svg('path { d: M 0 0 L 5 5 }'), `<svg ${NS}><path d="M 0 0 L 5 5"/></svg>`);
    assert.equal(svg('path { animate d: L 1 0 A 1 1 0 0 1 0 1; L 2 0 A 2 2 0 0 1 0 2 / 1s }'),
        `<svg ${NS}><path><animate attributeName="d" values="M 1 0 A 1 1 0 0 1 0 1;M 2 0 A 2 2 0 0 1 0 2" dur="1s"/></path></svg>`);
});

test('a bare name is an empty element', () => {
    assert.equal(svg('feMerge { feMergeNode; feMergeNode { in: SourceGraphic } }'),
        `<svg ${NS}><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></svg>`);
});

test('repeatCount accepts infinite', () => {
    assert.equal(svg('circle { animate { attributeName: r; values: 1;5; dur: 2s; repeatCount: infinite } }'),
        `<svg ${NS}><circle><animate attributeName="r" values="1;5" dur="2s" repeatCount="indefinite"/></circle></svg>`);
});

test('animate name: adds an animate child', () => {
    assert.equal(svg('circle { animate r: 1; 5; 1 / 2s infinite; fill: red }'), markup(`
        <svg ${NS}>
            <circle fill="red">
                <animate attributeName="r" values="1;5;1" dur="2s" repeatCount="indefinite"/>
            </circle>
        </svg>
    `));
    // a single value animates to it
    assert.equal(svg('circle { animate cx: 5 / 1s }'),
        `<svg ${NS}><circle><animate attributeName="cx" to="5" dur="1s"/></circle></svg>`);
    // the repeat count may come first
    assert.equal(svg('circle { animate r: 1; 2 / infinite 2s }'),
        `<svg ${NS}><circle><animate attributeName="r" values="1;2" dur="2s" repeatCount="indefinite"/></circle></svg>`);
    // transform takes its type first
    assert.equal(svg('g { animate transform: rotate 0 5 5; 360 5 5 / 4s infinite }'), markup(`
        <svg ${NS}>
            <g>
                <animateTransform attributeName="transform" type="rotate" values="0 5 5;360 5 5" dur="4s" repeatCount="indefinite"/>
            </g>
        </svg>
    `));
});

test('style: with a block and style prefixes add up', () => {
    assert.equal(svg('circle { style: { fill: red; stroke: blue }; style opacity: .5 }'),
        `<svg ${NS}><circle style="fill:red;stroke:blue;opacity:.5;"/></svg>`);
    assert.equal(svg('circle { style opacity: .5; style: { fill: red } }'),
        `<svg ${NS}><circle style="opacity:.5;fill:red;"/></svg>`);
});

test('viewBox shorthands', () => {
    assert.equal(svg('viewBox: 10'), `<svg ${NS} viewBox="0 0 10 10"></svg>`);
    assert.equal(svg('viewBox: 10 5'), `<svg ${NS} viewBox="0 0 10 5"></svg>`);
    assert.equal(svg('viewBox: 10 p 1'), `<svg ${NS} viewBox="-1 -1 12 12"></svg>`);
    assert.equal(svg('viewBox: -5 -5 10 10'), `<svg ${NS} viewBox="-5 -5 10 10"></svg>`);
});

test('elements beside svg {} join it', () => {
    assert.equal(svg('svg { circle {} } rect {}'), `<svg ${NS}><circle/><rect/></svg>`);
    assert.equal(svg('viewBox: 10; svg { viewBox: 20; circle {} } svg { rect {} }'),
        `<svg ${NS} viewBox="0 0 20 20"><circle/><rect/></svg>`);
});

test('problems are reported through the warn callback', () => {
    const warned = input => {
        let warnings = [];
        let output = generateSvg(parseSvg(input), m => warnings.push(m));
        return { output: output.replace(` ${NS}`, ''), warnings };
    };
    assert.deepEqual(warned('viewBox: 0 0 10; circle {}'), {
        output: '<svg><circle/></svg>',
        warnings: ['viewBox needs 1, 2 or 4 numbers, got "0 0 10"'],
    });
    assert.deepEqual(warned('g { draw: 2s }'), {
        output: '<svg><g/></svg>',
        warnings: ['draw: <g> has no path'],
    });
    assert.deepEqual(warned('circle { animate r: 1; 5 }'), {
        output: '<svg><circle><animate attributeName="r" values="1;5"/></circle></svg>',
        warnings: ['animate r: needs a duration after /'],
    });
    assert.deepEqual(warned('circle { filter: defs { circle {} rect {} } }').warnings,
        ['filter: inline defs needs one element']);
    assert.deepEqual(warned('path { draw: 2s; animate r: 1 / 1s }').warnings, []);
    assert.deepEqual(warned('circle { animate r: 1; 5 / 2s bounce }'), {
        output: '<svg><circle><animate attributeName="r" values="1;5" dur="2s"/></circle></svg>',
        warnings: ['animate r: unknown timing word "bounce"'],
    });
    assert.deepEqual(warned('path { draw: 2s steps(4) }').warnings, ['draw: unknown timing word "steps(4)"']);
    assert.deepEqual(warned('g { @seed: 7; circle { r: 5 } }'), { output: '<svg><g><circle r="5"/></g></svg>', warnings: [] });
});

test('timing takes a delay after the duration, like the css animation shorthand', () => {
    assert.equal(svg('circle { animate r: 1; 5 / 2s 1s infinite }'),
        `<svg ${NS}><circle><animate attributeName="r" values="1;5" dur="2s" begin="1s" repeatCount="indefinite"/></circle></svg>`);
    assert.equal(svg('circle { animate r: 1; 5 / 2s 3 }'),
        `<svg ${NS}><circle><animate attributeName="r" values="1;5" dur="2s" repeatCount="3"/></circle></svg>`);
    assert.equal(svg('path { draw: 2s .5s }').includes('dur="2s" begin=".5s"'), true);
    assert.equal(svg('path { draw: 3 2s }').includes('dur="2s" repeatCount="3"'), true);
    // a negative delay starts part way through
    assert.equal(svg('path { draw: 2s -1s }').includes('dur="2s" begin="-1s"'), true);
});

test('timing takes the css easing and fill words', () => {
    const tail = input => /<animate [^>]*?\/>/.exec(svg(input))[0].replace(/^<animate attributeName="r" (values|to)="[^"]*" /, '');
    // one spline per segment, calcMode spline
    assert.equal(tail('circle { animate r: 1; 5; 1 / 2s ease-in-out infinite }'),
        'dur="2s" repeatCount="indefinite" calcMode="spline" keySplines="0.42 0 0.58 1;0.42 0 0.58 1"/>');
    // a `to` animation eases only with explicit key times
    assert.equal(tail('circle { animate r: 5 / 1s ease }'), 'dur="1s" calcMode="spline" keyTimes="0;1" keySplines="0.25 0.1 0.25 1"/>');
    assert.equal(tail('circle { animate r: 1; 5 / 1s cubic-bezier(.2, 0, 0, 1) }'),
        'dur="1s" calcMode="spline" keySplines="0.2 0 0 1"/>');
    // the keywords are the ones of @nN and friends, dashes optional
    assert.equal(tail('circle { animate r: 1; 5 / 1s easeIn }'), 'dur="1s" calcMode="spline" keySplines="0.42 0 1 1"/>');
    // linear is the default, fill takes the css or the svg word
    assert.equal(tail('circle { animate r: 1; 5 / 1s linear forwards }'), 'dur="1s" fill="freeze"/>');
    assert.equal(tail('circle { animate r: 1; 5 / 1s freeze }'), 'dur="1s" fill="freeze"/>');
    // step-end is discrete, paced and discrete are SMIL's own
    assert.equal(tail('circle { animate r: 1; 5 / 1s step-end }'), 'dur="1s" calcMode="discrete"/>');
    assert.equal(tail('circle { animate r: 1; 5 / 1s paced }'), 'dur="1s" calcMode="paced"/>');
    // the words go in any order, the first time staying the duration; draw takes them too
    assert.equal(tail('circle { animate r: 1; 5 / forwards infinite ease-in 2s 1s }'),
        'dur="2s" begin="1s" repeatCount="indefinite" fill="freeze" calcMode="spline" keySplines="0.42 0 1 1"/>');
    assert.equal(svg('path { draw: 2s ease-out forwards }').includes('dur="2s" fill="freeze" calcMode="spline" keyTimes="0;1" keySplines="0 0 0.58 1"'), true);
});

test('a definition used as a value goes into defs without the keyword', () => {
    assert.equal(svg('rect { fill: linearGradient#lg { stop { offset: 0 } } }'), markup(`
        <svg ${NS}>
            <defs>
                <linearGradient id="lg">
                    <stop offset="0"/>
                </linearGradient>
            </defs>
            <rect fill="url(#lg)"/>
        </svg>
    `));
    // joins an existing defs, and the same id is shared
    assert.equal(svg(`
        defs { linearGradient#a {} }
        rect { fill: linearGradient#a {} }
        circle { mask: mask#m {} }
    `), `<svg ${NS}><defs><linearGradient id="a"/><mask id="m"/></defs><rect fill="url(#a)"/><circle mask="url(#m)"/></svg>`);
    // a plain element used as a value stays at the root
    assert.equal(svg('use { href: g#x {} }'), `<svg ${NS}><g id="x"/><use href="#x"/></svg>`);
});

test('a defs that takes an id from its statements joins the shared defs once', () => {
    assert.equal(svg(`svg {
        defs { circle {} }
        defs#x { rect {} }
    }`), markup(`
        <svg ${NS}>
            <defs id="x">
                <circle/>
                <rect/>
            </defs>
        </svg>
    `));
});

test('an @match block puts its body in place unless the test is 0', () => {
    assert.equal(svg('circle {} @match(1) { rect {} } @match(0) { line {} }'), `<svg ${NS}><circle/><rect/></svg>`);
    assert.equal(svg('@match(1) { @match(0) { line {} } g {} }'), `<svg ${NS}><g/></svg>`);
    // declarations go to the element around the block
    assert.equal(svg('path { @match(1) { fill: red } @match(0) { stroke: blue } }'), `<svg ${NS}><path fill="red"/></svg>`);
    // an inline defs reads the id of the element the block keeps
    assert.match(svg('rect { fill: defs { @match(1) { linearGradient {} } } }'), /<rect fill="url\(#linearGradient-\d+\)"\/>/);
});

test('g|op joins its shapes into one path', () => {
    let squares = 'rect { width: 4; height: 4 } rect { x: 2; y: 2; width: 4; height: 4 }';
    assert.equal(svg(`g|union { ${squares} }`), `<svg ${NS}><path d="M4 0L4 2L6 2L6 6L2 6L2 4L0 4L0 0Z"/></svg>`);
    assert.equal(svg(`g|subtract { ${squares} }`), `<svg ${NS}><path d="M4 0L4 2L2 2L2 4L0 4L0 0Z"/></svg>`);
    assert.equal(svg(`g|intersect { ${squares} }`), `<svg ${NS}><path d="M2 4L2 2L4 2L4 4Z"/></svg>`);
    assert.equal(svg(`g|exclude { ${squares} }`), `<svg ${NS}><path d="M4 0L4 2L2 2L2 4L0 4L0 0ZM4 4L4 2L6 2L6 6L2 6L2 4Z"/></svg>`);
    assert.equal(svg(`g|union { fill: red; smooth: .5; title { content: t } animate opacity: 0; 1 / 1s; ${squares} }`), markup(`
        <svg ${NS}>
            <path fill="red" d="M4 1.5Q4 2 4.5 2L6 2L6 6L2 6L2 4.5Q2 4 1.5 4L0 4L0 0L4 0Z">
                <title>t</title>
                <animate attributeName="opacity" values="0;1" dur="1s"/>
            </path>
        </svg>
    `));
    assert.equal(svg(`g|subtract { g { ${squares} } rect { x: 1; y: 1; width: 1; height: 1 } }`),
        `<svg ${NS}><path d="M0 4L0 0L4 0L4 2L6 2L6 6L2 6L2 4ZM1 1L1 2L2 2L2 1Z"/></svg>`);
    assert.equal(svg('g|subtract { circle { cx: .5; cy: .5; r: .5 } circle { cx: .5; cy: .5; r: .25 } }'),
        `<svg ${NS}><path d="M0 0.5A0.5 0.5 0 1 1 0.001 0.5311A0.5 0.5 0 0 1 0 0.5ZM0.2501 0.5078A0.25 0.25 0 1 0 0.2501 0.4922A0.25 0.25 0 0 0 0.2501 0.5078Z"/></svg>`);
    assert.equal(svg('g|union { polygon { points: 1 0, .5 .866, -.5 .866, -1 0, -.5 -.866, .5 -.866 } }'),
        `<svg ${NS}><path d="M1 0L0.5 0.866L-0.5 0.866L-1 0L-0.5 -0.866L0.5 -0.866Z"/></svg>`);
});


test('g|op grows or shrinks the joined outline by grow', () => {
    assert.equal(svg('g|union { grow: 1; rect { width: 4; height: 4 } }'),
        `<svg ${NS}><path d="M-1 4L-1 0A1 1 0 0 1 0 -1L4 -1A1 1 0 0 1 5 0L5 4A1 1 0 0 1 4 5L0 5A1 1 0 0 1 -1 4Z"/></svg>`);
    assert.equal(svg('g|union { grow: -1; rect { width: 4; height: 4 } }'), `<svg ${NS}><path d="M1 3L1 1L3 1L3 3Z"/></svg>`);
});

test('g|op keeps a corner written twice, a hair apart', () => {
    let corner = 'L14.213975543499998 -11.5911099155L14.2139755435 -11.5911099155';
    assert.equal(svg(`g|subtract { path { d: M0 0${corner}L30 0Z } rect { x: -1; y: -2; width: 32; height: 1 } }`), `<svg ${NS}><path d="M2.453 -2L14.214 -11.591L27.276 -2ZM28.638 -1L30 0L0 0L1.226 -1Z"/></svg>`);
});

test('g|op cuts from the first shape even when it has no area', () => {
    let line = 'path { d: M0 0L4 4 }', square = 'rect { width: 4; height: 4 }';
    assert.equal(svg(`g|subtract { ${line} ${square} }`), `<svg ${NS}><path d=""/></svg>`);
    assert.equal(svg(`g|intersect { ${line} ${square} }`), `<svg ${NS}><path d=""/></svg>`);
    assert.equal(svg(`g|union { ${line} ${square} }`), `<svg ${NS}><path d="M4 0L4 4L0 4L0 0Z"/></svg>`);
});

test('g|op warns about what it cannot join', () => {
    let warnings = [];
    let out = generateSvg(parseSvg('rect|union {} g|xor {} g|union { text {} rect { width: 50%; height: 1; transform: rotate(9) } }'), m => warnings.push(m));
    assert.equal(out, `<svg ${NS}><rect/><g/><path d="M0 0L50 0L50 1L0 1Z"/></svg>`);
    assert.deepEqual(warnings, [
        'rect|union: needs g',
        'g|xor: needs union, subtract, intersect or exclude',
        'g|union: <text> has no outline',
        'g|union: <rect> reads 50% as 50',
        'g|union: <rect> transform is ignored',
    ]);
});
