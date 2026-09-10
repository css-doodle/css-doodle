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

| Source | Tokens      | Rule                                                              |
| ------ | ----------- | ----------------------------------------------------------------- |
| `a -1` | `a` `-1`    | A `-` before a digit is a sign, unless a number, word, `)` or `]` directly precedes it. |
| `a-1`  | `a` `-` `1` | A word precedes the `-`, so it is a symbol.                       |
| `h1`   | `h` `1`     | A digit ends a word.                                              |
| `10px` | `10` `px`   | A number ends at a character that cannot continue it.             |
| `#fff` | `#fff`      | `#` is not a symbol, so it starts a word.                         |

**Quotes.** `"`, `'` and `` ` `` open and close quoted text. Inside
quotes whitespace is kept as written, and function calls are still
recognized.

**Whitespace.** Leading and trailing whitespace is dropped, and every
other run collapses to one space. A space next to `:` `;` `,` `{` `}`
`[` `]` is dropped, as is a space after `(` or before `)`. A space
before `(` or after `)` is kept, so `a (b)` and `a(b)` differ.

**Comments.** `/* … */` is whitespace. `//` comments exist only in
shader bodies (§9.4).

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

A property that starts with `@` is a directive handled by css-doodle:
`@grid`, `@size`, `@place`, `@gap`, `@shape`, `@content`, `@seed` and
`@use`. Every other property, custom properties included, is emitted
as CSS.

`@use` inserts statements stored in custom properties of the
component. Each `var()` may carry a fallback, and inserted statements
may contain `@use` themselves. A variable that is already being
inserted is skipped and reported (§11).

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
current cell, written `&`, and each selector is resolved against every
selector of the enclosing block:

| Written   | Resolves to | Rule                                                       |
| --------- | ----------- | ---------------------------------------------------------- |
| `:hover`  | `&:hover`   | A selector that starts with `:` is appended to the subject. |
| `span`    | `& span`    | Any other selector becomes a descendant.                   |
| `.dark &` | `.dark &`   | Each `&` is replaced by the outer selector.                |

Two selectors target elements outside the cell and are not nested
under it: `:doodle` is the component and `:container` is the grid
container. `:doodle(<compound>)` and `:container(<compound>)` match
only when the element matches the compound, and `:doodle.dark:hover`
is shorthand for `:doodle(.dark:hover)`. A rule whose selectors are
only `:doodle` or `:container` is generated once, not once per cell.

## 4. Conditional blocks

```css
@nth(2n + 1)   { background: #000; }
@random(.3)    { opacity: .5; }
@cond(x > y)   { border-radius: 50%; }
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
  `@at(x, y)`, `@nth(an+b)`, `@row(an+b)`, `@col(an+b)`, `@even`,
  `@odd`, `@random(ratio)`, `@cond(expression)` and `@cell(…)`.
  `@match(expression)` is an alias of `@cond(expression)`.
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

**Digits in a name** are split off and become the first argument. A
`.`, `x` or `-` between digits stays with them.

| Written            | Means                                                    |
| ------------------ | -------------------------------------------------------- |
| `@m3(a)`           | `@m(3, a)`                                               |
| `@n1.5(a)`         | `@n(1.5, a)`                                             |
| `@p1-2(a)`         | `@p(1-2, a)`                                             |
| `@log2(8)`         | `@log2(8)`; a `Math` name keeps its digits               |
| `@doodle100x50(…)` | `@doodle(…)` rendered at 100 by 50; for `@shaders` the suffix caps the raster size |

**A `.` followed by a letter** ends the name and composes calls,
rightmost first:

| Written     | Means                                               |
| ----------- | --------------------------------------------------- |
| `@a.b(x)`   | `@a(@b(x))`                                         |
| `@a.@b(x)`  | the same, with the inner sigil written out          |
| `@a.b.c(x)` | `@a(@b(@c(x)))`                                     |
| `@a.5(x)`   | `@a(.5, x)`; a `.` before a digit stays in the name |

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

One expression language is shared by `$(…)`, `@cond(…)` (function and
cell selector), `@cell(…)`, `@random(ratio)` and the commands of
`@shape`. `@pattern` has its own GLSL-oriented language (§9.3).
`@match(…)` remains available as an alias of `@cond(…)`.

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

- **Everything is a number.** Comparisons give `1` or `0`. `&&` and
  `||` return the operand that decided the result, so `0 || 5` is `5`.
  `%` takes the sign of the left operand. `∧`, `∨` and `÷` are word
  characters and need whitespace around them.
- **Adjacent values multiply.** `2x`, `x y`, `2(3)`, `(1+2)(3)` and
  `2π` are products. A name followed by digits is one name, even
  across whitespace, so `x 2` is the variable `x2`. A name adjacent to
  `(` is a call.
- **A sign binds to the value after it.** `-2^2` is `4`; write
  `-(2^2)` for `-4`. Between two values `-` subtracts: `3-4`, `3 -4`
  and `k -1` all subtract.
- **Dashed names.** `a-b` is one variable when the context defines it,
  and `a - b` otherwise. The longest defined name wins.
- **Lookup order.** The context first; then `π`, `gcd(a, b)` and
  `match(c, a, b)`; then `Math` under its JavaScript names, `PI`,
  `sin`, `atan2`, `log2` and so on. Any other name is `0`. A name
  bound to a function of no arguments calls it: `random`.
- **Variables are expressions** evaluated in the same context, so
  `--a: b + 1` works. A unit is dropped unless it is a name in scope:
  with `--w: 10px`, `$(w * 2)` is `20`; with `--d: 2s` and `--s: 5`,
  `d` is `2 * s`.
- **Chains** apply right to left: `a.b(x)` is `a(b(x))`.
  `match(c, a, b)` evaluates only the branch it takes.
- **There are no errors.** An unknown name, a cycle, a missing operand
  and a non-numeric result all read as `0`. An operator without an
  operand is ignored, so `5 *` is `5`. Division by zero gives
  `Infinity`.

Each caller provides its own context.

**`$(…)`** sees the custom properties declared in the doodle at host,
container and cell level, without their `--` prefix, plus the `--name`
declarations of an enclosing `@svg`. Function calls inside the
expression are evaluated first. The result is rounded to 12
significant digits, magnitudes below `1e-9` become `0`, and the unit
suffix is appended. A lone name such as `$w` acts as a generation-time
`var()`: arithmetic is evaluated, and any other value passes through
as written, so with `--c: tomato`, `$c` is `tomato`.

**`@cond`, `@cell` and `@random`** see the cell:

| Name             | Value                                                       |
| ---------------- | ----------------------------------------------------------- |
| `x`, `y`         | column and row, from 1                                      |
| `X`, `Y`         | number of columns and rows                                  |
| `i`, `I`         | cell index from 1, cell count                               |
| `dx`, `dy`       | offset from the grid center                                 |
| `dr`, `dc`, `dm` | Euclidean, Chebyshev and Manhattan distance from the center |
| `da`             | angle from the center                                       |
| `db`             | distance to the edge                                        |

The three selectors also see `random`. The `@cond` function also sees
`z` and `Z`, and, inside `@m` or `@M`, `n`, `nx`, `ny` and `N`. The
result is read as true or false.

**`@random(ratio)`** defaults to `.5`. A ratio below `1` is an
independent per-cell probability. `1` or more selects that many
distinct cells for this occurrence of the selector, up to the cell
count.

**`@even` and `@odd`** use checkerboard parity: `@even` matches cells
where `x + y` is odd, and `@odd` cells where it is even. This differs
from the `even` and `odd` arguments of `@nth`, `@row` and `@col`.

**`@shape`** sees the commands of the shape (§9.2), without the
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

- An element block becomes an SVG element, and its declarations
  become attributes. `#id` and `.class` in the selector set `id` and
  `class`; a `class:` declaration adds to the selector's classes, and
  an `id:` declaration wins over `#id`.
- Names are read without regard to case and emitted in SVG's own:
  `lineargradient` becomes `linearGradient`, `Circle` becomes
  `circle`. Custom property names keep their case.
- `g circle { … }` and `g > circle { … }` both nest `circle` inside
  `g`.
- Declarations and elements written beside an `svg { … }` block belong
  to it, in source order, and several `svg` blocks merge into one.
- `*count` repeats the element as `@M(count, …)` would: a count, a
  grid such as `2x3`, or an inclusive range such as `1-3`. Inside the
  element `@n` is the sequence value: `1`, `2`, `3` for `1-3`, and for
  `2x3` the column index, cycling through `1`, `2`.
- `x, y: 1, 2` sets `x` to `1` and `y` to `2`. The value is split only
  when it has exactly as many parts as there are names; otherwise
  every name receives the whole value.
- A value may itself be an element block, whose selector is the text
  before its first top-level `{`. The element gets a generated id, and
  the attribute becomes `url(#id)`, or `#id` for `href`. Gradients,
  `pattern`, `filter`, `clipPath`, `mask`, `marker` and `symbol` are
  placed into `<defs>`, so `fill: linearGradient { … }` and
  `fill: defs linearGradient { … }` are the same.
- `viewBox` takes four numbers, or one number `n` for `0 0 n n`, or
  two for `0 0 w h`. `padding n` after them grows the box by `n` on
  every side. Any other count of numbers drops the attribute with a
  diagnostic.
- `style { … }`, with or without a selector, keeps its content as CSS
  text. `style: { … }` and `style fill: red` add to the element's
  `style` attribute.
- The `;` of a character reference such as `&amp;` is part of the
  value. The `xlink:` and `xml:` attributes of SVG 1.1 are supported.

**Animation.** `animate r: 1; 5; 1 / 2s ease-in-out infinite forwards`
adds an `<animate>` child for the attribute: the values before the
`/`, separated by `;`, then the timing in the words of the CSS
`animation` shorthand, in any order after the duration. A single value
is a `to` animation. `animate transform: rotate 0; 360 / 4s` emits
`<animateTransform>` with the first word as its `type`. `draw: 2s`
strokes a shape (`path`, `line`, `rect`, `circle`, `ellipse`,
`polygon`, `polyline`) along its length with the same timing words.

| Timing word                                                       | Emitted as                                                    |
| ----------------------------------------------------------------- | ------------------------------------------------------------- |
| `2s`, `500ms`                                                     | `dur`; a second time is the delay, `begin`                    |
| a bare number                                                     | the repeat count beside a duration; alone, seconds of `dur`   |
| `infinite`                                                        | `repeatCount="indefinite"`, also in a `repeatCount` attribute |
| `ease`, `ease-in`, `ease-out`, `ease-in-out`, `cubic-bezier(…)`   | `calcMode="spline"` with the same `keySplines` for every segment; `linear` is the default |
| `step-end`                                                        | `calcMode="discrete"`                                         |
| `discrete`, `paced`                                               | `calcMode` as written                                         |
| `forwards`                                                        | `fill="freeze"`                                               |

Any other word is dropped with a diagnostic.

**`@arc(r: 40; from: 0; to: 120; move: 50 50)`** is the path data of
an arc, `M x y A …`, for `d:`. Angles are degrees, clockwise from
three o'clock like SVG's `rotate()`, and take `deg`, `rad`, `grad` or
`turn`. `from` defaults to `0` and `to` to `360`; a sweep of a full
turn or more is the whole circle. `r` takes one or two radii and
`move` the center. The data ends at the arc's end, so `@arc(…) L 0 0 Z`
is a pie slice.

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
               | 'r' | 't' | 'x' | 'y'
               | variable-name
```

- The `@shape:` directive takes a preset name (`circle`, `star`,
  `heart`, …) and emits `clip-path: polygon(…)`. The `@shape(…)`
  function takes a preset or a command body, and is the form for
  custom polygons.
- `r`, `x` and `y` are expressions in the angle `t`, evaluated `points`
  times around the circle. The other named commands transform the
  resulting points. Any other name defines a variable for the
  expressions that follow it.
- A `-` before a command name negates its value, except on `fill`.
- The expressions also see the point index `i`, from 1, and two
  helpers: `seq(a, b, …)` cycles through its arguments from point to
  point, and `range(a, b)` interpolates from `a` to `b` across the
  shape.

### 9.3 Patterns

```css
@pattern(
  grid: 20;
  fill: #000;
  cond(dr < .5) { fill: #fff; }
)
```

```
pattern-body  = { name ':' expression ';' | cond-block | iterate-block }
cond-block    = cond { ',' cond } '{' pattern-body '}'
cond          = 'cond' '(' expression ')'
iterate-block = 'iterate' '(' integer [ ',' expression ] ')'
                '{' { name ':' expression ';' } '}'
```

A `@pattern` body declares the parameters `grid`, `shape`, `size` and
`fill`; any other name declares a variable. A `cond` block holds the
declarations that apply where its condition holds, and may nest. It
opens a child scope: its declarations shadow outer variables, and a
block-local `shape` or `size` changes the mask for that block.
`match(…)` remains available as an alias of the `cond(…)` block.

In a value, `cond` is a function: `cond(t1, v1, t2, v2, …)` gives
the value after the first test that holds, a last argument without a
test when none does, and `0` without one, so
`fill: cond(dr < 2, #fff, dr < 4, #888, #000)` picks a color per cell.

Expressions are written in a GLSL-oriented language, not the language
of §8. Compared with §8, `^` is bitwise xor, `÷`, `∧` and `∨` are not
available, and `and`, `or` and `not` may be used for `&&`, `||` and
`!`. Values are bare expressions, without units or `var()`. The GLSL
functions, such as `sin`, `mod`, `mix` and `step`, and the constant
`PI` are available, and so are its vectors: a variable may hold a
`vec2`, `vec3`, `vec4` or `mat2`, and is read with a swizzle, as in
`c.x` or `p.yx`. A color written as `#rgb` or `#rrggbb` is a `vec3`,
and a `fill` that is one `vec3` expression is a color. A number or
`π` followed by a name, a call, a group or `π` multiplies, so `2t`,
`2πt`, `2sin(t)` and `2(t + 1)` are products; two names side by side
are not.

The coordinates count cells from the top-left corner, like the grid:

| Name          | Value                                                    |
| ------------- | -------------------------------------------------------- |
| `x`, `y`, `i` | column, row and index of the cell, from 1                |
| `X`, `Y`, `I` | the number of columns, rows and cells                    |
| `dx`, `dy`    | `x` and `y` measured from the center of the grid         |
| `dr`, `da`    | distance and angle of the cell from the center           |
| `dc`, `dm`    | Chebyshev and Manhattan distance of the cell from the center |
| `db`          | distance to the nearest edge of the grid, in cells       |
| `du`, `dv`    | position inside the cell, −0.5 to 0.5, `dv` downward     |
| `uv`          | position over the whole pattern, 0 to 1, `uv.y` upward   |
| `t`           | time in seconds; reading it animates the pattern         |

Without a `grid` the pattern is a single cell, so `du`, `dv` and
`uv` address every pixel.

These functions are available besides the GLSL ones:

| Function                          | Returns                                                     |
| --------------------------------- | ----------------------------------------------------------- |
| `cond(t, v, …, else)`             | the value after the first test that holds, else the last argument, or 0 |
| `rand(a, b)`, `rand(n)`           | a seeded random number, 0 to 1                              |
| `noise(a, b)`, `noise(n)`         | value noise, 0 to 1                                         |
| `fbm(a, b)`                       | six octaves of noise, about 0 to 1                          |
| `voronoi(a, b)`                   | distance to the nearest of a seeded set of points           |
| `hsl(h, s, l)`, `hsv(h, s, v)`    | a color from components 0 to 1                              |
| `rot(x, y, a)`                    | the point `x`, `y` rotated by `a` radians, as a `vec2`      |
| `smin(a, b, k)`                   | the smaller of `a` and `b`, blended over `k`                 |
| `ngon(x, y, n)`                   | distance from the origin with a regular `n`-gon as the unit shape |
| `escape(zx, zy, cx, cy)`          | 0 where z → z² + c never leaves, else how soon it does, 0 to 1 (96 steps, bailout 16) |
| `spiral(dx, dy)`                  | the index of the cell along a square spiral from the center |
| `dither(x, y)`                    | the 4×4 Bayer threshold of the cell, 0 to 1                 |

A point that the table writes as two floats may also be one `vec2`,
so `fbm(p)`, `ngon(p, 6)`, `rot(p, a)` and `escape(z, c)` are the
same functions taking vectors.

```css
@pattern(
  cx: uv.x*3 - 2.2; cy: uv.y*2.6 - 1.3;
  zx: 0; zy: 0;
  iterate(96, zx*zx + zy*zy > 4) {
    zx: zx*zx - zy*zy + cx;
    zy: 2*zx*zy + cy;
  }
  fill: hsl(n/48, 0.8, 0.5);
  cond(n = 96) { fill: #000 }
)
```

An `iterate` block runs its declarations a fixed number of times. A
name that is also declared outside the block is loop state: it starts
from its outer value, and every step assigns all state at once from
the previous values, so the two lines above are the formula z² + c.
Other names are temporaries of one step, and the parameters are not
read. A state is a vector when its initial value mentions a vector
constructor or `uv`, otherwise a float, so `z: vec2(0)` and
`z: uv*3 - 1.5` are both `vec2`. A value that starts with a call
returning a float, such as `fbm(uv)` or `length(uv)`, is a float.
`n` counts the steps, inside the block and after it. The second
argument stops the loop once it holds, checked after each step, so
`n` equal to the count means it never did. After the block, the state
names and `n` hold the results. A block without a step count is
skipped and reported (§11).

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
to an image and bound as the sampler of that name. `//` comments are
removed, and `#define` lines are kept on their own line. The
fragment is compiled with `precision highp float` unless it declares
its own precision.

`$name` reads the custom property `--name` when the shader is
generated. In `fragment` and `vertex` it inserts the text of the
variable, so `--fragment: @raw(...)` can hold GLSL and `--speed:
@r(1, 3)` can feed an expression. A `texture…` section whose whole
body is `$name` binds the doodle stored in `--name: @doodle(...)`. A
name that is not defined skips the shader and is reported (§11). Text
stored in a variable is one line: keep `//` comments and `#`
directives in the section itself.

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
Unknown properties and at-rules are emitted as written. These
situations are reported as diagnostics, each at most once per
component:

| Situation                                                        | Recovery                                                    |
| ---------------------------------------------------------------- | ----------------------------------------------------------- |
| an unclosed `(` in a value                                       | the value runs on to the next `}` or `<`, absorbing the declarations in between |
| an argument list that is never closed                            | it runs to the end of the source; the arguments before its last top-level `,` are kept |
| `@keyframes` without a name                                      | produces nothing; parsing continues with the next statement |
| a `@use` variable that refers to itself                          | the variable is skipped (§2)                                |
| an unknown function called with an argument list                 | the call is emitted as its name, `@name`                    |
| a cell selector with a modifier it does not have, such as `@cell.random(2)` | matches nothing                                  |
| an `@svg` `viewBox` with three numbers, or none                  | the attribute is dropped                                    |
| an inline `defs { … }` value holding more or fewer than one element | the attribute is set to the empty string                 |
| `draw:` on an element that has no path length                    | the declaration is dropped                                  |
| `animate name:` without a duration after `/`, or `draw:` without one | the `<animate>` is emitted without `dur`                |
| a timing word that is not a time, a count, an easing or a fill   | the word is dropped                                         |
| an `iterate` block without a step count                          | the block is skipped                                        |

The first four are found while parsing, which continues. The others
are found while the CSS is generated, and the last one when its
pattern is drawn. A raw body (`@doodle`,
`@shaders`, `@pattern`) that is never closed runs to the end of the
source without a report.
