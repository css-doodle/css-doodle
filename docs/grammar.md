# Language Reference

css-doodle is CSS for drawing on a grid. You write the style of one
cell; css-doodle evaluates it for every cell and emits plain CSS. On
top of CSS it adds functions, arithmetic, cell selectors, and small
languages for SVG, polygons, patterns and shaders. Anything it does
not understand passes through as CSS.

```css
@grid: 8 / 200px;
background: @p(#f00, #00f);
@cell(2n) {
  rotate: @r(360deg);
}
```

This is a reference, not a tutorial. It describes what the parser
accepts and how the generator reads it.

**Contents**

1. [Tokens](#1-tokens)
2. [Statements](#2-statements)
3. [Selectors](#3-selectors)
4. [Conditional blocks](#4-conditional-blocks)
5. [Values](#5-values)
6. [Functions](#6-functions)
7. [Arguments](#7-arguments)
8. [Expressions](#8-expressions)
9. [Embedded languages](#9-embedded-languages)
10. [Directive values](#10-directive-values)
11. [Error recovery](#11-error-recovery)

**Notation.** `[ a ]` is optional, `{ a }` repeats zero or more times,
`a | b` is a choice and `'x'` is literal text. *Top level* means
outside parentheses and quotes. *Adjacent* means with no whitespace in
between.

## 1. Tokens

The source is split into whitespace, numbers, symbols and words.

```
number  = ( '0x' | '0X' ) hex-digits
        | [ '-' ] ( digits [ '.' [ digits ] ] | '.' digits ) [ ( 'e' | 'E' ) [ '+' | '-' ] digits ]
symbol  = one of   : ; , ( ) [ ] { } + - * / % ^ = < > & | ! ? ~ _ @ " ' `
                   π ± ß ≤ ≥ ≠ ∆
word    = run of characters that are not whitespace, digits or symbols
```

A `-` before a digit is a sign unless a number, word, `)` or `]`
precedes it, so `a -1` is two tokens and `a-1` is three. A digit ends
a word (`h1` → `h` `1`); a number ends at a character that cannot
continue it (`10px` → `10` `px`). `#` is not a symbol, so `#fff` is
one word.

**Quotes.** `"`, `'` and `` ` `` open and close quoted text. Inside
quotes whitespace is kept as written, and function calls are still
recognized.

**Whitespace.** Leading and trailing whitespace is dropped, and every
other run collapses to one space. A space next to `:` `;` `,` `{` `}`
`[` `]` is dropped, as is a space after `(` or before `)`. A space
before `(` or after `)` is kept, so `a (b)` and `a(b)` differ.

**Comments.** `/* … */` is whitespace. `//` comments exist only in
pattern and shader bodies (§9.3, §9.4).

## 2. Statements

```
doodle            = { top-statement }
top-statement     = declaration | at-statement | keyframes
                  | selector-block | conditional-block | ';'
nested-statement  = declaration | keyframes | selector-block
                  | conditional-block | ';'
```

A statement is a block when its first top-level `{` comes before any
top-level `;` or `}`. Otherwise it is a declaration or an
at-statement. Outside blocks, markup tags (`<…>`) between statements
are skipped.

### Declarations

```css
background: @p(red, blue);
--size: 10px;
@grid: 8 / 200px;
```

```
declaration = property ':' value [ ';' ]
```

The property is everything before the first top-level `:`. The value
runs to the next top-level `;`, or to a `}` or `<`.

A property that starts with `@` is a directive: `@grid`, `@size`,
`@place`, `@gap`, `@shape`, `@content`, `@seed` and `@use`. Every
other property, custom properties included, is emitted as CSS.

`@use` inserts statements stored in custom properties. Each `var()`
may carry a fallback, and inserted statements may contain `@use`
themselves. A variable that is already being inserted is skipped and
reported (§11).

```css
@use: var(--rule), var(--other, var(--fallback));
```

### At-statements

A statement that starts with `@` and has no top-level `:`, such as
`@import url(fonts.css);`, is an at-statement. It ends at the first
top-level `;` and is emitted as written, with whitespace collapsed and
comments removed. Inside a block it is dropped.

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

The name runs to the next whitespace or `{`. A step selector is a
value, so it may contain function calls.

## 3. Selectors

```css
:hover  { background: red; }
::after { content: ''; }
span    { color: blue; }
.dark & { opacity: .5; }
```

A block whose head does not start with `@` is a selector block. The
head is a comma-separated list of CSS selectors. The subject is the
current cell, written `&`. Each selector is resolved against every
selector of the enclosing block: a selector that starts with `:` is
appended (`:hover` → `&:hover`); any other becomes a descendant
(`span` → `& span`); each `&` is replaced by the outer selector.

`:doodle` is the component and `:container` is the grid container.
They are not nested under the cell. `:doodle(<compound>)` and
`:container(<compound>)` match only when the element matches the
compound; `:doodle.dark:hover` is shorthand for `:doodle(.dark:hover)`.
A rule whose selectors are only `:doodle` or `:container` is generated
once, not once per cell.

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

A block whose head starts with `@` is a conditional block. The name
decides how it is treated:

- **Cell selectors** apply their statements to the cells they match:
  `@at(x, y)`, `@nth(an+b)`, `@row(an+b)`, `@col(an+b)`,
  `@depth(an+b)`, `@even`, `@odd`, `@random(ratio)`,
  `@match(expression)` and `@cell(…)`. A `not` before the arguments
  inverts the test: `@cell not (x = y)`. `@even` and `@odd` use
  checkerboard parity (`x + y` odd or even); this differs from the
  `even` and `odd` arguments of `@nth`, `@row` and `@col`.
- **CSS group rules** wrap their statements as CSS does: `@media`,
  `@supports`, `@container`, `@layer`, `@scope`, `@starting-style`
  and `@document`, including vendor-prefixed forms.
- **Any other name**, `@font-face` for instance, is copied from the
  source unchanged and hoisted to the top level of the generated
  stylesheet.

Whitespace before a segment is preserved, so `@media (hover)` keeps
its space.

## 5. Values

```
value = group { ',' group }
group = { text | function-call }
```

A value is a comma-separated list of groups, and a group is CSS text
interspersed with function calls. Text is emitted as written, with one
exception: a `π` not preceded by a digit becomes the value of pi. `2π`
stays as written; only expressions (§8) evaluate it.

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

`@` or `$` starts a call only when a name or `(` is adjacent to it;
otherwise it is plain text. The name and the `(` must be adjacent too.
`@(` or `$(` is a call with an empty name.

**Digits in a name** split off as the first argument: `@m3(a)` is
`@m(3, a)`, `@n1.5(a)` is `@n(1.5, a)`, `@p1-2(a)` is `@p(1-2, a)`.
A `Math` name keeps its digits: `@log2(8)`. `@doodle`, `@shaders` and
`@pattern` take a size suffix instead: `@doodle100x50(…)` renders at
100 by 50; a single number is square.

**A `.` followed by a letter** ends the name and composes calls,
rightmost first: `@a.b(x)` and `@a.@b(x)` are `@a(@b(x))`;
`@a.b.c(x)` is `@a(@b(@c(x)))`. A `.` before a digit stays in the
name: `@a.5(x)` is `@a(.5, x)`.

**A variant comes first.** When `a` has a variant named `b`, `@a.b(x)`
calls that variant instead: `@plot.scatter(star)` spreads the points
inside the star. `.@b` and an explicit `@a(@b(x))` always compose.

**`$` is the calc function.** `$(expr)` evaluates an expression (§8).
`$unit(expr)` appends `unit` verbatim: `$px(1+1)` is `2px`, and
`$4(1+1)` is `24`. `$name` without an argument list reads the variable
`name` (§8).

## 7. Arguments

```
arguments = [ argument { ',' argument } ]
argument  = { text | function-call | variable }
```

Arguments are separated by top-level commas; parentheses nest, and a
comma inside quotes does not separate. Whitespace inside an argument
is part of it, so `@p(a b, c)` has two arguments.

- A pair of `(…)`, `"…"` or `'…'` around the whole argument is removed
  and its content passed as one unit. A pair around part of it is
  kept: `"a" "b"` stays two strings.
- An argument that starts with a custom property name, `--x`, `(--x)`
  or `"--x"`, refers to that variable.
- An argument that starts with `±` expands into two arguments, `-x`
  and `x`: `±1`, `±(a + 1)`, `±@r(10)`. Elsewhere `±` is plain text.
- Backticks are read as double quotes, so a doodle can sit inside a
  double-quoted HTML attribute.
- Function calls are recognized anywhere in an argument, including
  inside quotes, and a bare `@` or `$` is a call with an empty name.

`@doodle`, `@shaders` and `@pattern` take their body as raw text up to
the matching `)`, respecting quotes. `@svg` takes its body in the SVG
language (§9.1): `--name: value` declarations anywhere in it define
variables for the call, the last one winning, and `element*count` is
expanded before the body is read as arguments.

## 8. Expressions

One expression language is shared by `$(…)`, `@match(…)` (function and
cell selector), `@cell(…)`, `@random(ratio)` and the commands of
`@shape`. `@pattern` has its own GLSL-oriented language (§9.3).

```
expression = operand { operator operand }
operand    = [ '+' | '-' | '!' ] ( number | name | call | '(' expression ')' )
call       = name { '.' name } '(' [ expression { ',' expression } ] ')'
name       = letter or '_', then letters, digits or '_'
```

Operators, highest precedence first:

| Operators                                       | Meaning                     | Associativity |
| ----------------------------------------------- | --------------------------- | ------------- |
| `!`                                             | not (prefix)                | right         |
| `^` `**`                                        | power                       | right         |
| `*` `/` `÷` `%`                                 | multiply, divide, remainder | left          |
| `+` `-`                                         | add, subtract               | left          |
| `<<` `>>`                                       | shift                       | left          |
| `&`                                             | bitwise and                 | left          |
| `\|`                                            | bitwise or                  | left          |
| `<` `>` `<=` `>=` `≤` `≥` `=` `==` `!=` `≠`     | compare, gives `1` or `0`   | left          |
| `&&` `∧`                                        | and, short-circuit          | left          |
| `\|\|` `∨`                                      | or, short-circuit           | left          |

- **Everything is a number.** Units are dropped: with `--w: 10px`,
  `$(w * 2)` is `20`. Comparisons give `1` or `0`, and `&&` and `||`
  return the deciding operand. `%` takes the sign of the left operand.
- **Adjacent values multiply**: `2x`, `2(3)` and `2π` are products.
  A space ends the product, so `2 x` reads as `2`. A name directly before
  `(` is a call. A sign binds to the value after it, so `-2^2` is `4`;
  write `-(2^2)` for `-4`.
- **Dashed names.** `a-b` is one variable when the context defines it,
  otherwise `a - b`. The longest defined name wins.
- **Names** are looked up in the context, then among `π`, `gcd` and
  `match`, then in JavaScript's `Math` (`PI`, `sin`, `hypot`, …). Any
  other name is `0`.
- **Calls chain** right to left: `tan.cos.sin(x)` is
  `tan(cos(sin(x)))`. `match(c, a, b)` evaluates only the branch it
  returns.
- **There are no errors.** Unknown names, cycles and missing operands
  read as `0`. Division by zero gives `Infinity`.

Each caller provides its own context.

**`$(…)`** sees the custom properties declared in the doodle at host,
container and cell level, without their `--` prefix, plus the `--name`
declarations of an enclosing `@svg`. Function calls inside the
expression are evaluated first. The result is rounded to 12
significant digits, magnitudes below `1e-9` become `0`, and the unit
suffix is appended. A lone name such as `$w` acts as a generation-time
`var()`: arithmetic is evaluated, and any other value passes through
as written, so with `--c: tomato`, `$c` is `tomato`.

**`@match`, `@cell` and `@random`** see the cell:

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

The three selectors also see `random`. Inside `@m` or `@M`, the
`@match` function also sees `n`, `nx`, `ny` and `N`. The result is read
as true or false.

**`@random(ratio)`** defaults to `.5`. Below `1` it is a per-cell
probability; `1` or more selects that many distinct cells, up to the
cell count. **`@shape`** sees the shape commands (§9.2), without the
rounding of `$(…)`.

## 9. Embedded languages

All embedded languages use the tokens of §1 and share one structure:

```
body        = { declaration | block | ';' }
declaration = head ':' value [ ';' ]
block       = head '{' ( body | raw ) '}'
```

Each language defines what a head and a value mean, and whether a
block body is parsed or kept as raw text (`style { … }` in SVG, every
shader section). One construct reads differently from the doodle
language: at the doodle level `a: b { … }` is a selector block,
because a head may contain a colon as in `a:hover { }`; inside `@svg`
it is a declaration whose value is a block.

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
svg-body        = { svg-block | svg-declaration }
svg-block       = selector { ',' selector } '{' svg-body '}'
selector        = element { [ '>' ] element }
element         = name [ '#' id ] { '.' class } [ '*' count ]
count           = number | number 'x' number | number '-' number
svg-declaration = attribute { ',' attribute } ':' ( value | svg-block ) [ ';' ]
                | 'style' [ property ] ':' ( value | '{' css '}' ) [ ';' ]
                | 'animate' attribute ':' value { ';' value } [ '/' timing ] [ ';' ]
                | 'draw' ':' timing [ ';' ]
timing          = duration { delay | repeat-count | easing | fill }
```

An element block becomes an SVG element; its declarations become
attributes. `#id` and `.class` set `id` and `class`; `id:` wins over
`#id`, and `class:` adds to the selector's classes. Names are
case-insensitive and emitted in SVG spelling (`lineargradient` →
`linearGradient`); custom property names keep their case. `g circle` and
`g > circle` both nest; declarations beside an `svg { … }` block belong
to it, and several `svg` blocks merge.

`*count` repeats the element like `@M(count, …)`. The count is a
number, a grid (`2x3`) or a range (`1-3`). Inside the element `@n` is
the sequence value, and a grid also gives `@nx` and `@ny`. `x, y: 1, 2`
splits only when the value has as many parts as names. `content: text`
adds a text node.

A block value gets a generated id (`url(#id)`, or `#id` for `href`).
Gradients, `pattern`, `filter`, `clipPath`, `mask`, `marker` and
`symbol` go into `<defs>`; `fill: linearGradient { … }` and
`fill: defs linearGradient { … }` are the same.

`viewBox` is four numbers, one (`0 0 n n`), or two (`0 0 w h`); `padding
n` grows the box. Other counts drop the attribute. `style { … }` keeps
raw CSS; `style: { … }` and `style fill: red` add to the `style`
attribute. SVG 1.1 `xlink:` and `xml:` attributes are supported.

**Animation.** `animate r: 1; 5 / 2s ease-in-out infinite` adds an
`<animate>` element. The values come before `/`, and a single value
animates `to` it. The timing after `/` reads like the CSS `animation`
shorthand. `animate transform: rotate 0; 90` becomes an
`<animateTransform>` whose first word is the `type`. `draw: 2s`
strokes a shape along its length.

| Timing word                    | Becomes                                   |
| ------------------------------ | ----------------------------------------- |
| first time, second time        | `dur`, `begin`                            |
| a number beside a duration     | `repeatCount`; without one, it is `dur`   |
| `infinite`                     | `repeatCount="indefinite"`                |
| easing keyword, `cubic-bezier` | `keySplines`; `linear` is the default     |
| `forwards`                     | `fill="freeze"`                           |

Any other word is dropped and reported.

**`@svg-filter`** builds a filter from short commands.

```css
filter: @svg-filter(
  region: 20%;
  frequency: .003 .008; scale: 80; octave: 10; seed: @r(1000);
  channels { g: g - .5r; b: 2b + .2; }
);
```

- **Commands.** `frequency` (one or two values), `octave` and `seed`
  make turbulence, and `scale` displaces by it. `blur`, `erode` and
  `dilate` add their primitive. Adjacent commands form a group, which
  emits dilation, erosion, blur, turbulence, then displacement. Any
  other attribute or a block starts a new group.
- **Inputs.** `scale` displaces the nearest earlier primitive, or
  `SourceGraphic` when there is none. `scale`, `octave` or `seed`
  without `frequency` is dropped and reported. Generated result names
  never collide with the author's.
- **`region`** is `x [y] / width [height]`. A single percentage grows
  every side equally: `20%` is `-20% -20% / 140% 140%`, the default
  once any command is used. `x`, `y`, `width` and `height` attributes
  override their part.
- **`channels { … }`** becomes an `feColorMatrix`. Declare only the
  output channels that change, `r`, `g`, `b` or `a`, as sums of input
  channels and constants in the `an+b` form: `g - .5r`, `.5 * r`,
  `2b + .2`. Every expression reads the original input, so
  `r: b; b: r` swaps red and blue. Anything else is reported and
  leaves the channel unchanged. `in` and `result` pass through, and
  nested blocks are dropped.
- **The legacy forms** `@svg-filter(.003, 80, 10)` and `blur=5px`
  keep the old graph, where displacement always reads
  `SourceGraphic`.

**`@arc(r: 40; from: 0; to: 120; move: 50 50)`** is the path data of
an arc, `L x y A …`, for `d:`. `r` takes one or two radii and `move`
the center. Angles are degrees clockwise from three o'clock, as in
SVG's `rotate()`, and accept `deg`, `rad`, `grad` and `turn`. `from`
defaults to `0` and `to` to `360`; a full turn or more draws the whole
circle. The arc continues the current path, and at the start of `d:`
or `path()` its first `L` becomes an `M`. So `@arc(…) L 0 0 Z` is a
pie slice, and
`@arc(r: 50; to: 120) L -15 26 @arc(r: 30; from: 120; to: 0) Z` is a
ring segment.

### 9.2 Polygons

```css
@shape: star;

clip-path: @shape(
  points: 200;
  r: cos(5t);
  fill: evenodd;
);
```

```
shape-property = preset
shape-function = preset | { command ';' }
command        = [ '-' ] command-name ':' expression
command-name   = 'points' | 'turn' | 'scale' | 'rotate' | 'move'
               | 'frame' | 'unit' | 'direction' | 'fill'
               | 'round' | 'edge' | 'seed'
               | 'r' | 't' | 'x' | 'y'
               | variable-name
```

The `@shape:` directive takes a preset name (`circle`, `star`,
`heart`, …) and emits `clip-path: polygon(…)`. The `@shape(…)`
function takes a preset or a command body, and is the form for
custom polygons.

`r`, `x` and `y` are expressions in the angle `t`, evaluated `points`
times around the circle. The other named commands transform the
resulting points. Any other name defines a variable for the
expressions that follow it. A `-` before a command name negates its
value, except on `fill`. The expressions also see the point index `i`,
from 1, and two helpers: `seq(a, b, …)` cycles through its arguments
from point to point, and `range(a, b)` interpolates from `a` to `b`
across the shape.

A `,` in `points`, `r`, `t`, `x`, `y` or `rotate` draws one contour per item,
the way `background` takes layers: the shorter lists repeat, `t` and
`i` start over in each contour, and `points: 0` leaves one out. Under
`fill: evenodd` the inner contours cut holes, so `points: 120, 60;
r: 1, .5` is a ring, and `@tile` and `@plot.scatter` read the region
with its holes. `frame` applies to a single contour only.

`round`, from 0 to 1, turns every corner into a curve that starts
`round / 2` of the way along each side. `edge` is an expression that
pushes the outline along its normal, outward when positive. In it `t`
runs from 0 to 2π by length along the outline, not by angle, and any
difference between its values at 0 and 2π is spread along the outline
so the ends still meet. Sharp corners come out beveled. `round` runs
first, so `edge` follows the rounded outline.
`@R.t(from, to)` writes a closed noise curve in `t` for one cell, as in
`r: @R.t(.8, 1)` or `edge: @R.t(-.05, .05)`. It follows the doodle's
seed, or the `seed` command. `@plot` reads only the points, so it
ignores `fill`, `frame`, `round` and `edge`.

**Tiles.** `@tile.kind(…)` and `@plot.scatter(…)` read the same body
as the region to fill, `square` by default for `@tile`, along with
these commands. Here `points` counts what comes out, not the
outline's corners, so a body copied from `@shape` leaves it out:

| Command          | Kinds                                   | Value                                                          |
|------------------|-----------------------------------------|----------------------------------------------------------------|
| `points`         | all                                     | at most this many pieces, or points for `delaunay`; scatter returns that many as one list |
| `seed`           | all                                     | the seed; defaults to the doodle's                             |
| `aspect`         | all                                     | the element's width over its height, `2` or `16 / 9`           |
| `gap`            | all but scatter                         | the space between pieces, in percent of the element            |
| `density`        | `slice`, `voronoi`, `delaunay`, scatter | where pieces are smaller, an expression in `x` and `y`         |
| `relax`          | `voronoi`, `delaunay`, scatter          | rounds that even out the points, 0 to 50, default 10           |
| `spread`         | `slice`                                 | how far a cut may tilt, in degrees                             |
| `crack`          | `voronoi`                               | groups the regions, about this many each; a second `gap` value is the space inside a group |
| `stretch`        | `voronoi`                               | `ratio [angle]`, regions that many times longer, up to 1000    |
| `round`          | all but `circle` and scatter            | curves the corners, 0 to 1                                     |
| `jitter`         | `grid`, `hex`, `triangle`, `cube`, `penrose` | moves each corner by up to that part of a piece           |
| `shift`          | `grid`                                  | `a [b]`, slides every other row by `a`, or column by `b`       |
| `edge`, `slide`  | `grid`, `hex`, `triangle`               | bends each edge across and along itself, expressions in `t`, `e`, `x`, `y` and `random()` |
| `pair`           | `grid` without `shift`, `hex`           | `turn` pairs edges by a turn about a corner, so every piece is one shape turned by its kind |
| `size`           | `circle`                                | the largest radius where a circle is centered, in average radii, an expression in `x` and `y` |

The kinds are `slice` (the default), `voronoi`, `delaunay`, `grid`,
`hex`, `triangle`, `cube`, `penrose` and `circle`. Once a cell has its
piece, `@tile.x` and `@tile.y` read its center, `@tile.kind` its kind,
and `@tile.r` the radius of a `circle` piece, in percent of the
element's shorter side.

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
name is a variable: its first assignment declares it and fixes its
type, and numbers become floats. A color is a `vec3`, or a `vec4` when
it has an alpha. Undeclared, invalid and `cssd…` names are reported
(§11).

**Blocks.** A `match` block runs where its test holds. `match { … }`
holds arms, each a test and a body, and runs the first arm whose test
holds; a last `else { … }` arm runs when none does. Blocks nest, and
each opens its own scope.
In a value, `match(t1, v1, t2, v2, …, else)` gives the value after the
first test that holds.

**Output.** `fill` is a CSS color, an expression, or a list whose
channels add up to three or four: `x / X, y / Y, .5`, `red, .5`; the
last one wins. After the body the cell is masked
by `shape`, a distance from the center, antialiased at half of `size`.
`shape` is `circle`, `square`, `diamond`, `none`, or an expression in
`du` and `dv`. Setting only `size` masks with a square.

**Expressions** use GLSL syntax, not §8: `^` is bitwise xor, `**` is
power, and the logic words are `and`, `or` and `not`. For xor,
compare two conditions: `a < .5 != b < .5`. GLSL's `pow` is undefined
for a negative base, so a whole exponent from 2 to 4 multiplies
instead. There are no units, no `var()` and no `?:`.
Swizzles work on `vec2`, `vec3`, `vec4` and `mat2`. A color name or
`#rgb` is a `vec3` and `#rgba` a `vec4`: `mix(red, #00f, du + .5)`.
A number directly followed by a name, a call or `(`
multiplies: `2t`, `2sin(t)`, `2(t + 1)`. Other values side by side,
including a number and a value with a space between, do not multiply
and are reported: `2 t`, `t r`, `r 9`, `r -2`, `(a)(b)`. Inside call
parentheses a space separates arguments like a comma: `hsl(h .75 .65)`,
except in `ramp()` stops.

**Variables.** The cell names of §8 except `z` and `Z`, plus:

| Name       | Value                                                      |
| ---------- | ---------------------------------------------------------- |
| `du`, `dv` | position inside the cell, −0.5 to 0.5, `dv` downward       |
| `uv`       | position in the whole pattern, 0 to 1, `uv.y` upward       |
| `pos`      | centered and aspect-correct, `pos.y` upward                |
| `t`        | time in seconds; reading it animates the pattern           |
| `size`     | the current `size`, `1` until set                          |

Without `grid` the pattern is one cell, so `du`, `dv`, `uv` and `pos`
address every pixel. An animated pattern in `@content` draws each
frame straight to a canvas; anywhere else it is re-encoded as an image
every frame, which is several times slower.

`$name` inserts the text of the cell's custom property `--name`
anywhere in the body but its comments when the pattern is generated,
so `--k: @i` gives each cell its own value and `--n: 72` can be a
`repeat` count. `$a-b` reads `--a-b` when it is defined and subtracts
otherwise. A name that is not defined skips the pattern and is
reported (§11).

**Functions.** GLSL, plus `ramp`, `rand`, `noise`, `fbm`, `voronoi`,
`hsl`, `hsv`, `rot`, `smin`, `ngon`, `box`, `segment`, `escape`,
`spiral` and `dither`. A point is one `vec2` or two floats:
`fbm(p)`, `ngon(p, 6)`. `escape` runs 96 steps with a bailout radius
of 16. `box(p, b)` is the signed distance to a box of half size `b`, a
`vec2` or one float, and `segment(p, a, b)` the distance to the segment
from `a` to `b`. `shape(d, size)` is the mask that `shape: d; size: size`
would apply, 1 inside and 0 outside, for layering: `fill: mix(bg, red,
shape(d, .6))`; `shape(abs(d), w)` is a stroke of width `w` along
`d = 0`.

`rand()` without arguments is a number from 0 to 1 that holds for the
cell and the `repeat` step and differs at each place it is written:
`w: mix(.3, .5, rand())`.

`ramp(t, stop, …)` maps `t` onto stops written as in a CSS gradient:
a value, then an optional number position after a space (`#f80 .5`).
Below the first stop and above the last the value holds. The first
position defaults to 0 and the last to 1, missing ones spread evenly,
and a position never goes back. A repeated position is a hard edge,
antialiased over a pixel. Stops are colors or numbers:
`fill: ramp(dr, #f99a53 .28, #006b50 .28, #00055f .83)`.

**Textures.** A top-level `texture…` block, named as in §9.4, holds a
doodle rendered at the pattern's size. The doodle sees the cell's
custom properties, and its own declarations win; a block whose whole
body is `$name` draws the doodle stored in `--name: @doodle(…)`.
`texture(name, p)` samples it at `p` from 0 to 1 and gives a `vec4`;
it wraps past the edges, and `texture(texture_0, uv)` draws it
unchanged. The last block of a name wins.

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

A `@shaders` body is either plain GLSL fragment source or a list of
named sections. A `texture…` section holds a doodle that is rendered
to an image and bound as the sampler of that name; like `@doodle(…)`,
it sees the cell's custom properties. `//` comments are
removed, and `#define` lines are kept on their own line. The
fragment is compiled with `precision highp float` unless it declares
its own precision. `pos` is a centered, aspect-correct coordinate:
the short axis of the canvas is −0.5 to 0.5 and `pos.y` is upward.

`$name` inserts the text of the custom property `--name` anywhere in
the body but its comments when the shader is generated, so
`--fragment: @raw(...)` can hold GLSL and `--speed: @r(1, 3)` can feed
an expression. A `texture…` section whose whole body is `$name` draws
the doodle stored in `--name: @doodle(...)`. A name that is not
defined skips the shader and is reported (§11). Text stored in a
variable is one line: keep `//` comments and `#` directives in the
section itself.

## 10. Directive values

Some directives read their value with a grammar of their own.

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

The numbers are columns, rows and depth. The same rule reads the
`grid` attribute of the element and the `grid:` parameter of a
`@pattern`.

| Modifier              | Effect                                     |
| --------------------- | ------------------------------------------ |
| `/ size [ / fill ]`   | `@size`, then a fill; at most two `/`      |
| `+ value`             | scale                                      |
| `~ value`             | translate                                  |
| `* value`             | rotate                                     |
| `*h value`            | hue-rotate                                 |
| `^ value`             | enlarge                                    |
| `∆ value`             | perspective                                |
| `_ value`             | gap, as `@gap`                             |
| `\| value`            | backdrop-filter                            |
| `ß value`             | border                                     |

A modifier's value runs to the next modifier symbol, so it may contain
spaces. Flags are whole words, matched case-insensitively, and may
appear anywhere; the dimensions are the first item that is not a flag.
A modifier written before the dimensions swallows them.

### @size

```
size-value  = width [ height [ aspect-ratio ] ]
            | preset [ orientation ]
preset      = 'a0' | … | 'a6' | 'postcard' | 'poster'
orientation = 'portrait' | 'landscape'
```

Height defaults to width. The aspect ratio is used only when the width
or height is `auto`. A paper preset is landscape unless an orientation
is given.

### @gap, @place

`@gap` takes one or two lengths, `gap [ gap ]`. Anything after them is
a rule drawn inside the gap, written like a border shorthand: a bare
number gets `px`, a missing style is `solid`, and a rule with no width
fills its gap. With no gap given, the gap takes the width of the rule.
The `ß` modifier of `@grid` completes a border shorthand the same way,
and also gives a lone color a `1px` width.

`@place` reads `left`, `right`, `top` and `bottom` as `0%` or `100%`
on their axis, and `center` as `50%`. Overflow is `unsafe` by default;
a `safe` keyword sets `place-self` to `center`. Any remaining values
fill x, then y. Both default to `50%`.

### Others

```
an-plus-b = [ number ] 'n' [ ( '+' | '-' ) number ] | number | 'even' | 'odd'
direction = [ 'auto' | 'reverse' ] [ expression [ 'deg' | 'rad' | 'grad' | 'turn' ] ]
dimension = number [ unit ]
```

`@nth`, `@row` and `@col` take one or more `an-plus-b` expressions and
match a cell that satisfies any of them. `direction` is used by
`@shape`, by gradients and by `@arc`; its angle is an arithmetic
expression, so `30 + 15` reads as `45` degrees.

## 11. Error recovery

There are no fatal syntax errors: every input produces a doodle.
Unknown properties and at-rules pass through. Diagnostics are reported
at most once per component:

**While parsing.** An unclosed `(` in a value runs to the next `}` or
`<`. An unclosed argument list runs to end of source; arguments before
the last top-level `,` are kept. `@keyframes` without a name produces
nothing.

**While generating.** `@use` cycles skip the variable (§2). An
undefined `$name` skips its `@shaders` or `@pattern`. Unknown
called functions emit as `@name`. Invalid cell selector modifiers match
nothing. Bad `@svg` `viewBox` counts drop the attribute. Inline
`defs` with other than one element becomes empty. Bad `draw:` or missing
animation duration drops the declaration or `dur`. Invalid timing words
are dropped.

**While drawing patterns.** Invalid or over-limit `repeat` blocks are
skipped. Undeclared or reserved pattern names are reported, and so
are statements without a colon and what an expression cannot place:
values side by side, `?:`, a trailing operator. Arms without a test,
declarations between arms and arms after `else` are skipped.
`ramp()`, `shape()` and GLSL derivatives inside a `match` block or a
`repeat` with stops are reported, since GLSL leaves them undefined
where only some pixels run the code.

An unclosed raw body (`@doodle`, `@shaders`, `@pattern`) runs to end
of source without a report.
