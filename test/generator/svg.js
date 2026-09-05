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
    assert.equal(svg('text `content: {hi`;'), `<svg ${NS} text \`content=" "></svg>`);
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
        warnings: ['draw: <g> has no path length to draw'],
    });
    assert.deepEqual(warned('circle { animate r: 1; 5 }'), {
        output: '<svg><circle><animate attributeName="r" values="1;5"/></circle></svg>',
        warnings: ['animate r: needs a duration after /, as in `/ 2s`'],
    });
    assert.deepEqual(warned('circle { filter: defs { circle {} rect {} } }').warnings,
        ['filter: an inline defs must hold exactly one element']);
    assert.deepEqual(warned('path { draw: 2s; animate r: 1 / 1s }').warnings, []);
});

test('timing takes a delay after the duration, like the css animation shorthand', () => {
    assert.equal(svg('circle { animate r: 1; 5 / 2s 1s infinite }'),
        `<svg ${NS}><circle><animate attributeName="r" values="1;5" dur="2s" begin="1s" repeatCount="indefinite"/></circle></svg>`);
    assert.equal(svg('circle { animate r: 1; 5 / 2s 3 }'),
        `<svg ${NS}><circle><animate attributeName="r" values="1;5" dur="2s" repeatCount="3"/></circle></svg>`);
    assert.equal(svg('path { draw: 2s .5s }').includes('dur="2s" begin=".5s"'), true);
    assert.equal(svg('path { draw: 3 2s }').includes('dur="2s" repeatCount="3"'), true);
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
