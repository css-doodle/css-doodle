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
    assert.equal(svg('text `content: {hi`;'), `<svg ${NS} text \`content=" hi\`"></svg>`);
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
