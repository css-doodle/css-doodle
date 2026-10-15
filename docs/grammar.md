# Language Reference

css-doodle is CSS for drawing on a grid: you style one cell, and
css-doodle evaluates that style for every cell and emits plain CSS. It
adds functions, arithmetic, cell selectors and small languages for
SVG, shapes, patterns and shaders; anything else passes through as
CSS. This is a reference, not a tutorial: it covers what the parser
accepts and how the generator reads it.

```css
@grid: 8 / 200px;
background: @p(#f00, #00f);
@cell(2n) {
  rotate: @r(360deg);
}
```

**Contents.** 1 [Tokens](#1-tokens) · 2 [Statements](#2-statements) ·
3 [Selectors](#3-selectors) · 4 [Conditional blocks](#4-conditional-blocks) ·
5 [Values](#5-values) · 6 [Functions](#6-functions) ·
7 [Arguments](#7-arguments) · 8 [Expressions](#8-expressions) ·
9 [Embedded languages](#9-embedded-languages) ·
10 [Directive values](#10-directive-values) ·
11 [Error recovery](#11-error-recovery)

**Notation.** `[ a ]` is optional, `{ a }` repeats zero or more times,
`a | b` is a choice, `'x'` is literal text. *Top level* means outside
parentheses and quotes; *adjacent* means with no whitespace between.

## 1. Tokens

```
number = ( '0x' | '0X' ) hex-digits
       | [ '-' ] ( digits [ '.' [ digits ] ] | '.' digits ) [ ( 'e' | 'E' ) [ '+' | '-' ] digits ]
symbol = one of  : ; , ( ) [ ] { } + - * / % ^ = < > & | ! ? ~ _ @ " ' ` π ± ß ≤ ≥ ≠ ∆
word   = run of characters that are not whitespace, digits or symbols
```

The source splits into whitespace, numbers, symbols and words.

- A `-` before a digit is a sign unless a number, word, `)` or `]`
  precedes it: `a -1` is two tokens, `a-1` three.
- A digit ends a word (`h1` → `h` `1`), and a number ends where it
  cannot continue (`10px` → `10` `px`). `#` is not a symbol, so `#fff`
  is one word.
- Quotes, `"`, `'` and `` ` ``, keep whitespace as written; function
  calls inside them are still recognized.
- Whitespace is trimmed and each run collapses to one space. It is
  dropped next to `:` `;` `,` `{` `}` `[` `]`, after `(` and before
  `)`, but kept before `(` and after `)`: `a (b)` and `a(b)` differ.
- `/* … */` is whitespace. `//` comments exist only in `@pattern`,
  `@scene` and `@shaders` bodies (§9.2–§9.4).

## 2. Statements

```
doodle           = { top-statement }
top-statement    = declaration | at-statement | keyframes | definition
                 | selector-block | conditional-block | ';'
nested-statement = declaration | keyframes | selector-block | conditional-block | ';'
```

A statement is a block when its first top-level `{` precedes any
top-level `;` or `}`, and otherwise a declaration or at-statement.
Markup tags (`<…>`) between statements outside blocks are skipped.

### Declarations

```css
background: @p(red, blue);
--size: 10px;
@grid: 8 / 200px;
```

```
declaration = property ':' value [ ';' ]
```

The property is everything before the first top-level `:`; the value
runs to the next top-level `;`, or to a `}` or `<`. A property starting
with `@` is a directive: `@grid`, `@size`, `@place`, `@gap`, `@shape`,
`@content`, `@seed` or `@use`. All others, custom properties included,
are emitted as CSS.

`@use: var(--rule), var(--other, var(--fallback))` inserts the
statements stored in custom properties. Fallbacks and nested `@use`
work; a variable already being inserted is skipped and reported (§11).

### Function definitions

```css
twice(x): $(x * 2);
dot(r, c = red): circle { r: $r; fill: $c }
dots(): { @dot(1) @dot(2, blue) }

width: @twice(3)px;
background: @svg(viewBox: 0 0 10 10; @dots);
```

```
definition = name '(' [ param { ',' param } ] ')' ':' body
param      = name [ '=' text ]
body       = '{' text '}' | statement
```

A top-level statement starting with `name(params):` defines a function
and emits nothing. The body is the text inside braces, or else one
statement, up to its `;` or through the block it opens. `@name(args)`,
or `@name` without arguments, calls it anywhere except inside quotes.
A definition replaces a built-in function of the same name.

Calls are replaced by the body before parsing, so the body works
wherever its text would: as a value, as `@svg` elements, with `*N`
copies. In the body, `$p`, and a bare `p` inside `$()`, become the
argument of parameter `p`, parenthesized inside `$()`. A call with
fewer arguments takes the defaults, `c = red`, of the parameters left.
Arguments and defaults are pasted as written, so `@dot(@r(5))` draws a
new radius at each `$r`; store a shared random value in a variable
first.

### At-statements

A statement starting with `@` with no top-level `:`, such as
`@import url(fonts.css);`, ends at the first top-level `;` and is
emitted with whitespace collapsed and comments removed. Inside a block
it is dropped.

### Keyframes

```css
@keyframes spin {
  from { rotate: 0deg }
  to   { rotate: @r(360deg) }
}
```

```
keyframes = '@keyframes' name '{' { step } '}'
step      = value '{' { declaration } '}'
```

The name runs to the next whitespace or `{`. Step selectors are values
and may contain function calls.

## 3. Selectors

```css
:hover  { background: red; }
::after { content: ''; }
span    { color: blue; }
.dark & { opacity: .5; }
```

A block whose head does not start with `@` is a selector block: a
comma-separated list of CSS selectors whose subject is the current
cell, `&`. Each is resolved against every selector of the enclosing
block: a leading `:` is appended (`:hover` → `&:hover`), anything else
becomes a descendant (`span` → `& span`), and each `&` is replaced by
the outer selector.

`:doodle` (the component) and `:container` (the grid container) are
not nested under the cell. `:doodle(<compound>)` and
`:container(<compound>)` match only when the element matches the
compound; `:doodle.dark:hover` is short for `:doodle(.dark:hover)`. A
rule whose selectors are all `:doodle` or `:container` is generated
once, not per cell.

## 4. Conditional blocks

```css
@nth(2n + 1)   { background: #000; }
@random(.3)    { opacity: .5; }
@match(x > y)  { border-radius: 50%; }
@media (hover) { :hover { color: red; } }
```

```
conditional-block = '@' name { segment } '{' { statement } '}'
segment           = keyword | '(' arguments ')'
keyword           = run of tokens without whitespace or parentheses
```

A block whose head starts with `@` is treated by its name:

- **Cell selectors** apply to the cells they match: `@at(x, y)`,
  `@nth(an+b)`, `@row(an+b)`, `@col(an+b)`, `@depth(an+b)`, `@even`,
  `@odd`, `@random(ratio)`, `@match(expression)`, `@cell(…)`. A `not`
  before the arguments inverts the test: `@cell not (x = y)`. `@even`
  and `@odd` use checkerboard parity (`x + y` odd or even), unlike the
  `even` and `odd` arguments of `@nth`, `@row` and `@col`.
- **CSS group rules**, `@media`, `@supports`, `@container`, `@layer`,
  `@scope`, `@starting-style`, `@document` and their vendor-prefixed
  forms, wrap their statements as in CSS.
- **Other names**, such as `@font-face`, are copied unchanged and
  hoisted to the top level of the stylesheet.

Whitespace before a segment is kept: `@media (hover)`.

## 5. Values

```
value = group { ',' group }
group = { text | function-call }
```

A value is a comma-separated list of groups of CSS text and function
calls. Text is emitted as written, except that a `π` not preceded by a
digit becomes pi; `2π` stays, and only expressions (§8) evaluate it.

## 6. Functions

```css
background: @p(red, blue);
rotate: @r(360deg);
width: $px(@i * 10);
```

```
function-call  = ( '@' | '$' ) ( name [ '(' arguments ')' ] | '(' arguments ')' )
name           = name-start { name-character }
name-start     = letter | digit | '_' | '%' | '-'
name-character = letter | digit | '_' | '.' | '%' | '-'
```

`@` or `$` starts a call only when a name or `(` is adjacent to it,
and is text otherwise; the name and its `(` must be adjacent too. `@(`
and `$(` are calls with an empty name.

- **Digits in a name** split off as the first argument: `@m3(a)` is
  `@m(3, a)`, `@n1.5(a)` is `@n(1.5, a)`, `@p1-2(a)` is `@p(1-2, a)`.
  `Math` names keep them (`@log2(8)`), and `@doodle`, `@shaders`,
  `@pattern` and `@scene` read them as a size: `@doodle100x50(…)`
  renders at 100 by 50, and one number is square.
- **A `.` before a letter** ends the name and composes calls, rightmost
  first: `@a.b(x)` and `@a.@b(x)` are `@a(@b(x))`, `@a.b.c(x)` is
  `@a(@b(@c(x)))`. Before a digit it stays in the name: `@a.5(x)` is
  `@a(.5, x)`. When `a` has a variant `b`, `@a.b(x)` calls the variant
  instead (`@plot.scatter(star)` spreads the points inside the star);
  `.@b` and `@a(@b(x))` always compose.
- **`$` is the calc function.** `$(expr)` evaluates an expression
  (§8). `$unit(expr)` appends `unit` verbatim: `$px(1+1)` is `2px`,
  `$4(1+1)` is `24`. `$name`, without parentheses, reads the variable
  `name` (§8).

## 7. Arguments

```
arguments = [ argument { ',' argument } ]
argument  = { text | function-call | variable }
```

Arguments split at top-level commas: parentheses nest, and a comma in
quotes does not split. Whitespace belongs to the argument, so
`@p(a b, c)` has two.

- `(…)`, `"…"` or `'…'` around a whole argument is removed and the
  content passed as one unit; around part of it, it stays: `"a" "b"`
  is two strings.
- An argument starting with `--x`, `(--x)` or `"--x"` refers to that
  custom property.
- An argument starting with `±` expands into two arguments, `-x` and
  `x`: `±1`,
  `±(a + 1)`, `±@r(10)`. Elsewhere `±` is text.
- Backticks read as double quotes, so a doodle fits in a double-quoted
  HTML attribute.
- Calls are recognized anywhere, quotes included; a bare `@` or `$` is
  a call with an empty name.

`@doodle`, `@shaders`, `@pattern` and `@scene` take a raw body up to
the matching `)`, respecting quotes; `@scene` runs its `@` functions
for each cell, and once per copy in a `*N` block. `@svg` reads an SVG
body (§9.1): `--name: value` anywhere in it defines a variable for the
call, the last one winning, and `element*count` expands before the
body is split into arguments.

## 8. Expressions

One language serves `$(…)`, `@match(…)` (function and cell selector),
`@cell(…)`, `@random(ratio)` and the `@shape` commands. `@pattern` and
`@scene` use a GLSL-oriented one (§9.3).

```
expression = operand { operator operand }
operand    = [ '+' | '-' | '!' ] ( number | name | call | '(' expression ')' )
call       = name { '.' name } '(' [ expression { ',' expression } ] ')'
name       = letter or '_', then letters, digits or '_'
```

| Operators, highest precedence first         | Meaning                     | Associativity |
| ------------------------------------------- | --------------------------- | ------------- |
| `!`                                         | not (prefix)                | right         |
| `^` `**`                                    | power                       | right         |
| `*` `/` `÷` `%`                             | multiply, divide, remainder | left          |
| `+` `-`                                     | add, subtract               | left          |
| `<<` `>>`                                   | shift                       | left          |
| `&`                                         | bitwise and                 | left          |
| `\|`                                        | bitwise or                  | left          |
| `<` `>` `<=` `>=` `≤` `≥` `=` `==` `!=` `≠` | compare, gives `1` or `0`   | left          |
| `&&` `∧`                                    | and, short-circuit          | left          |
| `\|\|` `∨`                                  | or, short-circuit           | left          |

- **Everything is a number.** Units drop: with `--w: 10px`, `$(w * 2)`
  is `20`. `&&` and `||` return the deciding operand; `%` takes the
  sign of the left operand. Right after a number `%` is a percent
  sign, dropped unless an unsigned number, a name or `(` follows:
  `25% > 10` is `1`, so `@tile.y > 50` works; `25%-5` is `20`; `7%3`
  is `1`.
- **Adjacent values multiply**: `2x`, `2(3)`, `2π`. A space ends the
  product (`2 x` is `2`), and a name directly before `(` is a call. A
  sign binds to the next value: `-2^2` is `4`, `-(2^2)` is `-4`.
- **Dashed names.** `a-b` is one variable if the context defines it,
  else `a - b`; the longest defined name wins.
- **Names** are looked up in the context, then among `π`, `random`,
  `gcd` and `match`, then in JavaScript's `Math` (`PI`, `sin`,
  `hypot`, …). Any other name is `0`.
- **Calls chain** right to left: `tan.cos.sin(x)` is
  `tan(cos(sin(x)))`. `match(c, a, b)` evaluates only the branch it
  returns.
- **No errors.** Unknown names, cycles and missing operands read as
  `0`; division by zero gives `Infinity`.

Each caller provides its own context:

- **`$(…)`** sees the doodle's custom properties at host, container
  and cell level, without `--`, and the `--name` declarations of an
  enclosing `@svg`. Calls inside it run first. The result is rounded
  to 12 significant digits, magnitudes below `1e-9` become `0`, and
  the unit suffix is appended. A lone name like `$w` is a
  generation-time `var()`: arithmetic is evaluated, anything else
  passes through, so with `--c: tomato`, `$c` is `tomato`.
- **`@match`, `@cell` and `@random`** see the cell variables below,
  and the `@match` function inside `@m` or `@M` also sees `n`, `nx`,
  `ny` and `N`. The result is read as true or false. `@random(ratio)`
  defaults to `.5`: below `1` it is a per-cell probability, from `1`
  up it selects that many distinct cells, at most all of them.
- **`@shape`** sees the shape commands (§9.2), unrounded.

| Name             | Value                                                       |
| ---------------- | ----------------------------------------------------------- |
| `x`, `y`         | column and row, from 1                                      |
| `X`, `Y`         | number of columns and rows                                  |
| `z`, `Z`         | depth from 1, number of depth levels                        |
| `i`, `I`         | cell index from 1, cell count                               |
| `dx`, `dy`       | offset from the grid center                                 |
| `dr`, `dc`, `dm` | Euclidean, Chebyshev and Manhattan distance from the center |
| `da`             | angle from the center                                       |
| `db`             | distance to the edge                                        |

## 9. Embedded languages

All embedded languages use the tokens of §1 and one structure:

```
body        = { declaration | block | ';' }
declaration = head ':' value [ ';' ]
block       = head '{' ( body | raw ) '}'
```

Each defines its heads and values, and which block bodies stay raw
text (`style { … }` in SVG, every shader section). At the doodle level
`a: b { … }` is a selector block, since a head may contain a colon
(`a:hover { }`); inside `@svg` it is a declaration with a block value.

### 9.1 SVG

```css
@svg(
  viewBox: 0 0 16 16;
  circle*4 {
    cx: @n(4); cy: 8; r: 1;
    fill: defs radialGradient { stop { offset: 0; stop-color: red; } };
  }
)
```

```
svg-body        = { svg-block | svg-element | svg-declaration }
svg-block       = selector { ',' selector } '{' svg-body '}'
svg-element     = name [ ';' ]
selector        = element { [ '>' ] element }
element         = name [ '#' id ] { '.' class } [ '*' count ]
count           = number | number 'x' number | number '-' number
svg-declaration = attribute { ',' attribute } ':' ( value | svg-block ) [ ';' ]
                | 'style' [ property ] ':' ( value | '{' css '}' ) [ ';' ]
                | 'animate' attribute ':' value { ';' value } [ '/' timing ] [ ';' ]
                | 'draw' ':' timing [ ';' ]
timing          = duration { delay | repeat-count | easing | fill }
```

An element block becomes an SVG element and its declarations its
attributes. `#id` and `.class` set `id` and `class`; `id:` overrides
`#id`, and `class:` adds to the selector's classes. Names are
case-insensitive and emitted in SVG spelling (`lineargradient` →
`linearGradient`), except custom property names. `g circle` and
`g > circle` both nest. Declarations beside an `svg { … }` block belong
to it, and `svg` blocks merge. A bare name, `feMergeNode;`, is an empty
element, except right after a declaration, where it is the next
`;`-separated value: `values: 1; 2; 3`.

`*count` repeats an element like `@M(count, …)`; the count is a
number, a grid (`2x3`) or a range (`1-3`). Inside, `@n` is the
sequence value, plus `@nx` and `@ny` for a grid. `x, y: 1, 2` splits
only when the value has as many parts as names. `content: text` adds
a text node.

A block value gets a generated id: `url(#id)`, or `#id` for `href`.
Gradients, `pattern`, `filter`, `clipPath`, `mask`, `marker` and
`symbol` go into `<defs>` with or without a `defs` prefix:
`fill: linearGradient { … }` is `fill: defs linearGradient { … }`.

`viewBox` takes four numbers, one (`0 0 n n`) or two (`0 0 w h`), and
`padding n` grows it; other counts drop it. `style { … }` is raw CSS;
`style: { … }` and `style fill: red` add to the `style` attribute. SVG
1.1 `xlink:` and `xml:` attributes are supported.

**Animation.** `animate r: 1; 5 / 2s ease-in-out infinite` adds an
`<animate>`: values before `/`, where a single value animates `to` it,
and timing after, read like the CSS `animation` shorthand.
`animate transform: rotate 0; 90` makes an `<animateTransform>` whose
first word is the `type`. `draw: 2s` strokes a shape along its length.
Timing words not in this table are dropped and reported:

| Timing word                    | Becomes                                 |
| ------------------------------ | --------------------------------------- |
| first time, second time        | `dur`, `begin`                          |
| a number beside a duration     | `repeatCount`; without one, it is `dur` |
| `infinite`                     | `repeatCount="indefinite"`              |
| easing keyword, `cubic-bezier` | `keySplines`; `linear` is the default   |
| `forwards`                     | `fill="freeze"`                         |

**`@svg-filter`** builds a filter from short commands.

```css
filter: @svg-filter(
  region: 20%;
  frequency: .003 .008; scale: 80; octave: 10; seed: @r(1000);
  channels { g: g - .5r; b: 2b + .2; }
);
```

- **Commands.** `frequency` (one or two values), `octave` and `seed`
  make turbulence, and `scale` displaces by it; `blur`, `erode` and
  `dilate` add their primitive. Adjacent commands form a group,
  emitted as dilation, erosion, blur, turbulence, then displacement;
  any other attribute or a block starts a new group.
- **Inputs.** `scale` displaces the nearest earlier primitive, or
  `SourceGraphic` if there is none. `scale`, `octave` or `seed`
  without `frequency` is dropped and reported. Generated result names
  never collide with the author's.
- **`region`** is `x [y] / width [height]`. One percentage grows every
  side equally: `20%` is `-20% -20% / 140% 140%`, the default once any
  command is used. `x`, `y`, `width` and `height` attributes override
  their part.
- **`channels { … }`** becomes an `feColorMatrix`. Declare only the
  output channels that change, `r`, `g`, `b` or `a`, as `an+b` sums of
  input channels and constants: `g - .5r`, `.5 * r`, `2b + .2`. All
  read the original input, so `r: b; b: r` swaps red and blue.
  Anything else is reported and leaves the channel unchanged; `in` and
  `result` pass through, and nested blocks are dropped.
- **Legacy forms**, `@svg-filter(.003, 80, 10)` and `blur=5px`, keep
  the old graph, where displacement always reads `SourceGraphic`.

**`@arc(r: 40; from: 0; to: 120; move: 50 50)`** is the path data of
an arc, `L x y A …`, for `d:`. `r` is one or two radii, `move` the
center. Angles are degrees clockwise from three o'clock, as in SVG's
`rotate()`, and accept `deg`, `rad`, `grad` and `turn`; `from`
defaults to `0`, `to` to `360`, and a full turn or more draws the
whole circle. The arc continues the current path; at the start of `d:`
or `path()` its first `L` becomes an `M`. So `@arc(…) L 0 0 Z` is a
pie slice, and `@arc(r: 50; to: 120) L -15 26 @arc(r: 30; from: 120; to: 0) Z`
a ring segment.

### 9.2 Shapes

```css
clip-path: @shape(
  polygon#tooth { points: -.11 0, .11 0, .07 .22, -.07 .22 }
  subtract {
    union { circle { r: .72 } #tooth*12 { move: 0 .66; rotate: n * 30 } }
    circle { r: .26 }
  }
  round: .03;
);

background: @scene(
  box#leg { size: .06 .5 .06 }
  box { size: 1 .06 .7; move: 0 .28 0; round: .02 }
  #leg*2x2 { move: nx * .84 - 1.26, 0, ny * .54 - .81 }
  view: 35 25;
);
```

`@shape` draws 2D outlines for `clip-path`, and `@plot`, `@tile` and
`@svg-polygon` read the same body. `@scene` draws a 3D model as an
image. The two share one language; only their shapes and a few
commands differ.

```
shape-property = preset
body           = { row | shape }
row            = [ '-' ] name ':' value [ ';' ]
shape          = head [ '{' body '}' ] [ ';' ]
head           = kind [ '#' id ] [ copies ] | kind copies '#' id | '#' id [ copies ]
kind           = group | shape-name [ arguments ] | '(' body ')'
group          = 'union' | 'subtract' | 'intersect' | 'exclude'
copies         = '*' count [ 'x' count ]
```

**Rows** are commands, attributes of their shape, or, for any other
name, variables that the rows and shapes of their block read:
`k: .3; sphere { r: k }`. Unknown shapes and `#id`s are reported;
`@scene` also reports names nothing reads, such as a misspelled
attribute.

**Steps**, `move`, `rotate`, `scale`, `grow` and `frame`, run in the
order written on the shape so far, and one written twice runs twice:
`scale: .5; move: .5 0` halves the shape, then moves it a quarter of
the box right, and a `rotate` after `move` turns it around the center.
A preset's own steps come first, so `square; scale: .5` halves the
square. Other rows are attributes; the last one wins. `y` points up,
and `rotate` turns counterclockwise in degrees (`.25turn` is 90,
`2 * 30deg` is 60), but a call such as `sin(90deg)` takes radians. The
parts of `move` and `scale` split at spaces or commas, and an operator
keeps its operands: `move: k * .5 0` and `move: .5 -.25` have two
parts each.

**Groups.** `union`, `subtract` and `intersect` join whole shapes;
`subtract` takes the rest from the first, so
`subtract { circle; circle { scale: .9; move: .45 .135 } }` is a
crescent. `exclude` keeps what an odd number of the shapes cover
(`@shape` only; in 3D it would look like `union`). `smooth: r`
rounds every place two shapes meet with a curve of radius `r`. A
group's own rows, like the rows at the top of a body, apply to the
joined shapes.

**Names.** `name#id` keeps a shape or group for later instead of
drawing it; `#id` draws it with the rows given there added, an
attribute replacing its own and a command running after its own:
`circle#hole { scale: .2 } subtract { circle; #hole { move: .5 0 } }`.
A name may be used before it is given, the last one given wins, and
`#id` works at the top of a body too. The id goes right after the
name, before or after a count; a space before `#` starts a new shape,
so `#knob #knob { rotate: 90 }` draws two.

**Copies.** `name*N` or `name*XxY` repeats a shape or group. Each copy
sees `n` from 1, `N`, and `nx`, `ny` across the grid, and runs its `@`
functions anew: `circle*6 { scale: .2; move: 0 -.6; rotate: n * 60 }`
rings the center, and `circle*2 { move: @pn(-.6 0, .6 0) }` draws two
circles apart.

|            | `@shape`                                                                 | `@scene`                                                                 |
|------------|--------------------------------------------------------------------------|--------------------------------------------------------------------------|
| Shapes     | the presets, `circle`, `square`, `star 6 .3`, `heart`, …; `shape` with `r`, `x`, `y`, `t` and `points`; `polygon { points: x y, … }`; a body in parentheses | `sphere { r }`, `ellipsoid { r: x y z }`, `box { size }`, `cylinder { r; height }`, `cone { r: r1 r2; height }`, `torus { r: R r }`, `capsule { from; to; r }`, `polygon { points; depth }` or `polygon { body; depth }`, `lathe { points }` or `lathe { body }`, `plane`, `sdf { d }` |
| Steps      | `move: x y`, `rotate`, `scale: x [y]`, `grow`, `frame`                   | the same in 3D, `rotate: [axis] angle`, and `mirror`, `repeat`, `twist`  |
| Attributes | `round`, `smooth`, `fill-rule`, `unit`, `direction`, `seed`, `turn`      | `round` on `box`, `cylinder` and `polygon`, `smooth`, `fill`             |
| Groups     | `union`, `subtract`, `intersect`, `exclude`                              | `union`, `subtract`, `intersect`                                         |
| Space      | lengths in units where the box is 2 across, `0 0` at its center         | the camera fits the model, so only its proportions matter               |

#### In `@shape`

The `@shape:` directive takes a preset name and emits
`clip-path: polygon(…)`. The `@shape(…)` function takes a preset or a
body, where a bare name at the top is the preset:
`@shape(heart; scale: .5)`.

**Outlines.** `r`, `x` and `y` are expressions in the angle `t` (in
`@scene` and `@pattern`, `t` is the time), evaluated at `points`
points around the circle: by default 180 if they read `t`, else 3.
They also see the point index `i` from 1, `seq(a, b, …)`, which cycles
through its arguments point by point, and `range(a, b)`, which
interpolates from `a` to `b` across the shape. `points` may instead
list the corners as SVG `x y` pairs: `points: 0 1, 1 -1, -1 -1` is a
triangle, the same as `polygon { points: … }`.

**Values.** `points`, `rotate`, `round`, `frame`, `turn` and each part
of `move` and `scale` read like variables: a unit drops (`20px` is 20)
and `points: 4n` is worked out, the fraction cut off. A `-` before a
command name negates its value, each part of `move` and `scale` and
each item of a list, except on `fill-rule`.

**Contour lists.** A `,` in `points`, `r`, `t`, `x`, `y`, `rotate` or
`grow` draws one contour per item, the way `background` takes layers:
shorter lists repeat, `t` and `i` restart in each contour, and
`points: 0` leaves one out. Under `fill-rule: evenodd` inner contours
cut holes, so `points: 120, 60; r: 1, .5` is a ring. `frame` and `grow`
treat each contour as a shape of its own. Contour lists suit rings and
other shapes around one center; for holes and cutouts elsewhere a
`subtract` group is plainer.

**Stored bodies.** A body in parentheses reads as commands, so one
kept in a custom property is reused with `$name`: given
`--gear: (points: 4n; r: 1, .5)`, `@shape($gear; n: 6)` adds to or
overrides it, and `@plot`, `@tile` and `@svg-polygon` read it the same
way.

**Group outlines** are cut where they cross, so a cut that reaches
past the shape leaves nothing there, where `fill-rule: evenodd` would
fill. A body with a group draws only the group, not its own `r`, `x`,
`y`, `t` or preset. `points` at the top then spreads that many points
over the outlines by length, and a list gives each outline its own
count, so two groups with the same counts morph in `@keyframes`
(`points: 180, 20` with a hole); without it the count follows the
cuts.

**`round`, `grow`, `frame`.** `round: r` turns every corner into a
curve of radius `r` as far as the sides allow, the same on 4 points or
400, before the steps run. `grow: d` pushes the outline out by `d` and
`frame: w` keeps a band `w` wide inside it, both exactly, as in
`@scene`, on the shape as it is at that step: corners the outline
turns away from come out round, and a group's outlines move together,
so its holes shrink as it grows. A frame's inner outlines take as many
points as the outline, so frames of different widths morph in
`@keyframes`. `grow` may also be an expression in `t`, which then runs
from 0 to 2π by length along the outline, not by angle; any difference
between its values at 0 and 2π is spread along the outline so the ends
meet, each point moves along the outline's normal, and sharp corners
come out beveled.

**`@plot` and `@tile`.** `@plot` spreads its cells along the outline,
over the contours by length, and reads only the points, ignoring
`fill-rule`, `frame`, `round` and `grow`. `@tile` and `@plot.scatter`
fill the region, holes included.

**Noise.** `@R.t(from, to)` writes a closed noise curve in `t` for one
cell, as in `r: @R.t(.8, 1)` or `grow: @R.t(-.05, .05)`, following the
doodle's seed or the `seed` command.

#### Tiles

`@tile(…)` of every kind and `@plot.scatter(…)` read the body as the
region to fill (`square` by default for `@tile`), along with these
commands. Here `points` counts what comes out, not the corners, so a
body copied from `@shape` leaves it out.

| Command         | Kinds                                   | Value                                                          |
|-----------------|-----------------------------------------|----------------------------------------------------------------|
| `points`        | all                                     | at most this many pieces, or points for `delaunay`; scatter returns that many as one list |
| `seed`          | all                                     | the seed, the doodle's by default                              |
| `aspect`        | all                                     | the element's width over its height, `2` or `16 / 9`, kept between 0.001 and 1000 |
| `gap`           | all but scatter                         | space between pieces, in percent of the element                |
| `density`       | `slice`, `voronoi`, `delaunay`, scatter | where pieces are smaller, an expression in `x` and `y`         |
| `relax`         | `voronoi`, `delaunay`, scatter          | rounds that even out the points, 0 to 50, default 10           |
| `spread`        | `slice`                                 | how far a cut may tilt, in degrees                             |
| `crack`         | `voronoi`                               | groups the regions, about this many each; a second `gap` value is the space inside a group |
| `stretch`       | `voronoi`                               | `ratio [angle]`, regions that many times longer, up to 1000    |
| `round`         | all but `circle` and scatter            | corner radius, in the units where the box is 2 across          |
| `jitter`        | `grid`, `hex`, `triangle`, `cube`, `penrose` | moves each corner by up to that part of a piece           |
| `shift`         | `grid`                                  | `a [b]`, slides every other row by `a`, or column by `b`       |
| `edge`, `slide` | `grid`, `hex`, `triangle`               | bend each edge across and along itself, expressions in `t`, `e`, `x`, `y` and `random()`; `edge` is ignored with `op` or `star` |
| `pair`          | `grid` without `shift`, `hex`           | `turn` pairs edges by a turn about a corner, so every piece is one shape turned by its kind |
| `op`            | `grid`, `hex`, `triangle`, `cube`, `penrose`, `voronoi` without `crack` or `stretch` | Conway's operators, one letter per step, right to left: `d a t k e b s`, and `g j m o` for `ds da kda de`; other letters and steps past the fifth are skipped |
| `star`          | the same as `op`                        | after `op`, turns every piece into a Hankin star: lines leave each side's middle at this angle, 0 to 90 degrees |
| `size`          | `circle`                                | the largest radius where a circle is centered, in average radii, an expression in `x` and `y`; by default 1.5 with a rare few larger |

The kinds, chosen as a variant like `@tile.hex(…)`, are `slice` (the
default), `voronoi`, `delaunay`, `grid`, `hex`, `triangle`, `cube`,
`penrose` and `circle`. A cell with a piece reads its center as
`@tile.x` and `@tile.y`, or `@tile.xy` for `x y`, its kind as
`@tile.k`, and as `@tile.r` the radius of the largest circle about the
center that fits in the piece, in percent of the element's shorter
side. At the top level a rule may read these before the rule that
makes the piece. A piece that `op` or `star` makes from a piece keeps
its kind; pieces made at the corners take the next kind up, and those
made along the sides by `e`, `b` and `s` the one after. `d` makes
every piece kind 1.

#### In `@scene`

The model is raymarched in WebGL into an image, like `@pattern`
(§9.3), and its values use the same math: `p` is the point in the
shape's own space, `t` the time in seconds, and `rand()` differs from
copy to copy.

**Fill** is a color, or an expression in `p` that gives one. Shapes in
a group take its fill unless they have their own, and shapes joined
with `smooth` blend their colors. `fill` also sees `normal`, the
surface normal as the camera sees it (x right, y up, z toward the
camera), so `1 - normal.z` is bright at the edges; the scene's light
still shades the result.

**Shapes.** `round` keeps the outer size of a `box`, `cylinder` or
`polygon`, while `grow` makes any shape bigger. `mirror: x z` keeps
the shape and its reflections across those axes, `repeat: x y z`
repeats it that far apart along each axis (0 for none), and
`twist: a` turns it `a` degrees per unit up `y`. `sdf { d: … }` takes
a distance written in `p`. `polygon` takes `points`, or a `@shape`
body as its outline, holes and all, in `@shape`'s units:
`polygon { heart; depth: .2 }`. Rows inside the body move the outline
in 2D and the polygon's own rows move it in 3D, except `points: n`,
which resamples the outline as in `@shape`. `lathe` turns the right
half of the same outline, where `x` is 0 or more, around `y`:
`lathe { vase }` is a vase.

**Camera.** At the top, `view: turn tilt` turns the camera around `y`
and tilts it, in degrees, and `perspective: d` sets its distance, 2 by
default or `none` for a parallel view. The camera fits the model, a
moving one as it is now and over its first 2π seconds, so it holds
still while the model or view moves: `view: 30t` spins it in place. An
animated scene draws best in `@content`.

### 9.3 Patterns

```css
@pattern(
  grid: 20;
  fill: #000;
  match(dr < .5) { fill: #fff; }
)
```

```
pattern-body  = { name ':' value ';' | match-block | repeat-block | texture-block }
texture-block = texture-name '{' doodle '}'
match-block   = 'match' '(' expression ')' '{' pattern-body '}'
              | 'match' '{' { expression '{' pattern-body '}' }
                            [ 'else' '{' pattern-body '}' ] '}'
repeat-block  = 'repeat' '(' integer [ 'as' name ]
                { ',' expression } ')' '{' repeat-body '}'
repeat-body   = { name ':' value ';' | match-block | repeat-block }
value         = css-color | expression { ',' expression }
```

**Names.** `grid`, `shape`, `size` and `fill` are built in. Any other
name is a variable, declared and typed by its first assignment:
numbers become floats, and a color is a `vec3`, or a `vec4` with
alpha. Undeclared, invalid and `cssd…` names are reported (§11).

**Blocks.** A `match` block runs where its test holds. `match { … }`
holds arms, each a test and a body, and runs the first whose test
holds, or a last `else { … }` arm when none does. Blocks nest, each
with its own scope. In a value, `match(t1, v1, t2, v2, …, else)` gives
the value after the first test that holds.

**Output.** `fill` is a CSS color, an expression, or a list whose
channels add up to three or four (`x / X, y / Y, .5`, `red, .5`); the
last one wins. After the body the cell is masked by `shape`, a distance
from the center antialiased at half of `size`: `circle`, `square`,
`diamond`, `none`, or an expression in `du` and `dv`. Setting only
`size` masks with a square.

**Expressions** use GLSL syntax, not §8: `^` is bitwise xor, `**` is
power, and the logic words are `and`, `or` and `not`; for xor, compare
two conditions, `a < .5 != b < .5`. GLSL's `pow` is undefined for a
negative base, so whole exponents from 2 to 4 multiply instead. There
are no units, `var()` or `?:`. Swizzles work on `vec2`, `vec3`, `vec4`
and `mat2`. A color name or `#rgb` is a `vec3`, `#rgba` a `vec4`:
`mix(red, #00f, du + .5)`. A number directly followed by a name, a call
or `(` multiplies (`2t`, `2sin(t)`, `2(t + 1)`); other values side by
side, including a number and a value with a space between, do not
multiply and are reported: `2 t`, `t r`, `r 9`, `r -2`, `(a)(b)`. Inside
call parentheses a space separates arguments like a comma
(`hsl(h .75 .65)`), except in `ramp()` stops.

**Variables** are the cell names of §8 except `z` and `Z`, plus:

| Name       | Value                                                |
| ---------- | ---------------------------------------------------- |
| `du`, `dv` | position inside the cell, −0.5 to 0.5, `dv` downward |
| `uv`       | position in the whole pattern, 0 to 1, `uv.y` upward |
| `pos`      | centered and aspect-correct, `pos.y` upward          |
| `t`        | time in seconds; reading it animates the pattern     |
| `size`     | the current `size`, `1` until set                    |

Without `grid` the pattern is one cell, so `du`, `dv`, `uv` and `pos`
address every pixel. An animated pattern in `@content` draws each
frame straight to a canvas; elsewhere it is re-encoded as an image
every frame, several times slower.

**`$name`** inserts the text of the cell's custom property `--name`
anywhere in the body but its comments, when the pattern is generated:
`--k: @i` gives each cell its own value, and `--n: 72` can be a
`repeat` count. `$a-b` reads `--a-b` if it is defined and subtracts
otherwise. An undefined name skips the pattern and is reported (§11).

**Functions.** GLSL, plus `ramp`, `rand`, `noise`, `fbm`, `voronoi`,
`hsl`, `hsv`, `rot`, `smin`, `ngon`, `box`, `segment`, `escape`,
`spiral` and `dither`. A point is one `vec2` or two floats: `fbm(p)`,
`ngon(p, 6)`.

- `escape` runs 96 steps with a bailout radius of 16.
- `box(p, b)` is the signed distance to a box of half size `b`, a
  `vec2` or one float; `segment(p, a, b)` is the distance to the
  segment from `a` to `b`.
- `shape(d, size)` is the mask that `shape: d; size: size` would
  apply, 1 inside and 0 outside, for layering:
  `fill: mix(bg, red, shape(d, .6))`. `shape(abs(d), w)` is a stroke
  of width `w` along `d = 0`.
- `rand()` without arguments is a number from 0 to 1 that holds for the
  cell and the `repeat` step and differs at each place it is written:
  `w: mix(.3, .5, rand())`.
- `ramp(t, stop, …)` maps `t` onto stops written as in a CSS gradient,
  a color or number, then an optional number position after a space
  (`#f80 .5`). The value holds below the first stop and above the
  last. The first position defaults to 0 and the last to 1, missing
  ones spread evenly, and a position never goes back; a repeated
  position is a hard edge, antialiased over a pixel:
  `fill: ramp(dr, #f99a53 .28, #006b50 .28, #00055f .83)`.

**Textures.** A top-level `texture…` block, named as in §9.4, holds a
doodle rendered at the pattern's size. It sees the cell's custom
properties, its own declarations winning, and a body of only `$name`
draws the doodle stored in `--name: @doodle(…)`. The last block of
a name wins. `texture(name, p)` samples it at `p` from 0 to 1 as a
`vec4`, wrapping past the edges; `texture(texture_0, uv)` draws it
unchanged.

```css
@pattern(
  texture_0 { background: linear-gradient(@r(360deg), @stripe(red, gold)); }
  r: length(pos);
  s: 3atan(pos.y, pos.x) + 8log(r) - 2t;
  fill: texture(texture_0, .5 + r * vec2(cos(s), sin(s)));
)
```

**`repeat(n [as i] [, stop …])`** runs its body `n` times, with `i`
counting from zero. `n` is a whole number, or a name declared as one
and never changed: `n: 72; repeat(n as i) { y: i / n; }`. The loop
ends early once every stop expression holds. Counts over 1024, nested
products over 65536 and invalid counts skip the block (§11). `fill`,
`shape`, `size` and `grid` are not allowed inside it.

### 9.4 Shaders

```css
@shaders(
  fragment {
    void main() {
      FragColor = vec4(1.0);
    }
  }
)
```

```
shaders-body = { section } | fragment-source
section      = ( 'fragment' | 'vertex' ) '{' glsl '}'
             | texture-name '{' ( doodle | '$' name ) '}'
texture-name = 'texture' { ASCII-letter | digit | '_' }
```

The body is plain GLSL fragment source or a list of named sections. A
`texture…` section holds a doodle rendered to an image and bound as
the sampler of that name; like `@doodle(…)`, it sees the cell's custom
properties. `//` comments are removed, and `#define` lines stay on
their own line. The fragment is compiled with `precision highp float`
unless it declares its own. `pos` is centered and aspect-correct: the
canvas's short axis is −0.5 to 0.5, and `pos.y` is upward.

`$name` works as in `@pattern`, an undefined name skipping the shader:
`--fragment: @raw(...)` can hold GLSL, `--speed: @r(1, 3)` can feed an
expression, and a section of only `$name` draws the doodle stored in
`--name: @doodle(...)`. Text stored in a variable is one line, so keep
`//` comments and `#` directives in the section itself.

## 10. Directive values

### @grid

```css
@grid: 8x8 / 200px +1.1 _10px ß1px solid #000;
```

```
grid-value = { flag } grid { flag | modifier }
grid       = number [ sep number [ sep number ] ]
sep        = 'x' | 'X' | ',' | '，'
flag       = 'row' | 'col' | 'p3d' | 'noclip'
modifier   = '/' size [ '/' fill ] | '+' value | '~' value
           | '*' [ 'h' ] value | '^' value | '∆' value | '_' value
           | '|' value | 'ß' value
```

The numbers are columns, rows and depth. The element's `grid`
attribute and the `grid:` of a `@pattern` read the same rule.

| Modifier            | Effect                                |
| ------------------- | ------------------------------------- |
| `/ size [ / fill ]` | `@size`, then a fill; at most two `/` |
| `+ value`           | scale                                 |
| `~ value`           | translate                             |
| `* value`           | rotate                                |
| `*h value`          | hue-rotate                            |
| `^ value`           | enlarge                               |
| `∆ value`           | perspective                           |
| `_ value`           | gap, as `@gap`                        |
| `\| value`          | backdrop-filter                       |
| `ß value`           | border                                |

A modifier's value runs to the next modifier symbol, spaces included.
Flags are whole words, case-insensitive, allowed anywhere; the
dimensions are the first item that is not a flag. A modifier written
before the dimensions swallows them.

### @size

```
size-value  = width [ height [ aspect-ratio ] ]
            | preset [ orientation ]
preset      = 'a0' | … | 'a6' | 'postcard' | 'poster'
orientation = 'portrait' | 'landscape'
```

Height defaults to width; the aspect ratio applies only when the width
or height is `auto`. Paper presets are landscape unless an orientation
is given.

### @gap, @place

`@gap` takes one or two lengths, then optionally a rule drawn inside
the gap, written like a border shorthand: a bare number gets `px`, a
missing style is `solid`, a rule with no width fills its gap, and with
no gap given the gap takes the rule's width. `@grid`'s `ß` modifier
completes a border shorthand the same way, and also gives a lone color
a `1px` width.

`@place` reads `left`, `right`, `top` and `bottom` as `0%` or `100%`
on their axis and `center` as `50%`; the remaining values fill x, then
y, both `50%` by default. Overflow is `unsafe` by default; a `safe`
keyword sets `place-self` to `center`.

### Others

```
an-plus-b = [ number ] 'n' [ ( '+' | '-' ) number ] | number | 'even' | 'odd'
direction = [ 'auto' | 'reverse' ] [ expression [ 'deg' | 'rad' | 'grad' | 'turn' ] ]
dimension = number [ unit ]
```

`@nth`, `@row` and `@col` take one or more `an-plus-b` expressions and
match a cell that satisfies any. `direction` is used by `@shape`,
gradients and `@arc`; its angle is an arithmetic expression, so
`30 + 15` reads as `45` degrees.

## 11. Error recovery

No syntax error is fatal: every input produces a doodle, and unknown
properties and at-rules pass through. Diagnostics are reported at most
once per component.

- **Parsing.** An unclosed `(` in a value runs to the next `}` or `<`.
  An unclosed argument list runs to the end of the source, keeping the
  arguments before the last top-level `,`; an unclosed raw body
  (`@doodle`, `@shaders`, `@pattern`) runs there too, unreported.
  `@keyframes` without a name produces nothing. A function that calls
  itself, directly or through another, is reported and the call
  expands to nothing.
- **Generating.** `@use` cycles skip the variable (§2), and an
  undefined `$name` skips its `@shaders` or `@pattern`. Unknown
  functions emit as `@name`. Invalid cell selector modifiers match
  nothing. Bad `@svg` `viewBox` counts drop the attribute, inline
  `defs` with other than one element becomes empty, a bad `draw:`
  drops the declaration, a missing animation duration drops `dur`, and
  invalid timing words are dropped.
- **Drawing patterns.** Invalid or over-limit `repeat` blocks are
  skipped. Undeclared or reserved names are reported, and so are
  statements without a colon and what an expression cannot place:
  values side by side, `?:`, a trailing operator. Arms without a test,
  declarations between arms and arms after `else` are skipped.
  `ramp()`, `shape()` and GLSL derivatives inside a `match` block or a
  `repeat` with stops are reported, since GLSL leaves them undefined
  where only some pixels run the code.
