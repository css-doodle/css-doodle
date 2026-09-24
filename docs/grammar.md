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
  `@at(x, y)`, `@nth(an+b)`, `@row(an+b)`, `@col(an+b)`, `@even`,
  `@odd`, `@random(ratio)`, `@match(expression)` and `@cell(…)`.
  `@even` and `@odd` use checkerboard parity (`x + y` odd or even);
  this differs from the `even` and `odd` arguments of `@nth`, `@row`
  and `@col`.
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

- **Numbers only.** Comparisons give `1` or `0`; `&&` and `||` return
  the deciding operand. `%` takes the sign of the left operand. `∧`,
  `∨` and `÷` need whitespace.
- **Adjacent values multiply** (`2x`, `2(3)`, `2π`). A name plus digits
  is one name (`x 2` → `x2`); a name before `(` is a call. `-` binds
  to the value after it (`-2^2` is `4`; use `-(2^2)` for `-4`).
- **Dashed names.** `a-b` is one variable when defined; else `a - b`.
  Longest defined name wins.
- **Lookup:** context, then `π`/`gcd`/`match`, then `Math` (`PI`, `sin`,
  …). Other names are `0`; a function name with no args calls it.
- **Variables** evaluate in the same context; units drop unless the
  name is in scope (`--w: 10px` → `$(w * 2)` is `20`).
- **Chains** apply right to left; `match(c, a, b)` evaluates one branch.
- **No errors:** unknown names, cycles, and bad operands read as `0`;
  division by zero gives `Infinity`.

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

`*count` repeats like `@M(count, …)` — a count, grid (`2x3`), or range
(`1-3`). Inside the element `@n` is the sequence value. `x, y: 1, 2`
splits only when the value has as many parts as names.

A block value gets a generated id (`url(#id)`, or `#id` for `href`).
Gradients, `pattern`, `filter`, `clipPath`, `mask`, `marker` and
`symbol` go into `<defs>`; `fill: linearGradient { … }` and
`fill: defs linearGradient { … }` are the same.

`viewBox` is four numbers, one (`0 0 n n`), or two (`0 0 w h`); `padding
n` grows the box. Other counts drop the attribute. `style { … }` keeps
raw CSS; `style: { … }` and `style fill: red` add to the `style`
attribute. SVG 1.1 `xlink:` and `xml:` attributes are supported.

**Animation.** `animate attr: v1; v2 / 2s ease-in-out infinite forwards`
adds `<animate>`: values before `/`, timing after (CSS animation
shorthand). One value is `to` only. `animate transform: …` becomes
`<animateTransform>` (first word is `type`). `draw: 2s` strokes path
shapes along their length.

Timing: first time → `dur`, second → `begin`; a bare number beside a
duration is the repeat count, alone it is seconds. `infinite` →
`repeatCount="indefinite"`. Easing keywords and `cubic-bezier(…)` set
splines; `linear` is default. `forwards` → `fill="freeze"`. Unknown
words are dropped with a diagnostic.

**`@svg-filter`.** Root commands — `frequency`, `scale`, `octave`,
`seed`, `blur`, `erode`, `dilate` — are read in contiguous groups; a
block or other attribute starts a new group. Each group emits dilation,
erosion, blur, turbulence, then displacement.
`frequency` is one or two values; `octave` and `seed` configure
turbulence; `scale` adds displacement from the nearest preceding
primitive, skipping root attributes, or `SourceGraphic` when first.
Generated result names do not replace or collide with author names.
Without `region`, any command defaults the filter region to
`-20% -20% / 140% 140%`.

`region` is `x [y] / width [height]`; one non-negative `%` expands
equally on every side (`20%` → `-20% -20% / 140% 140%`). Explicit
`x`, `y`, `width`, or `height` override the matching part. `scale`,
`octave`, or `seed` without `frequency` are dropped with a diagnostic.
The positional shorthand `@svg-filter(.003, 80, 10)` and `name=value`
arguments such as `blur=5px` keep the legacy graph: displacement reads
`SourceGraphic`, even when morphology or blur is also present.

A direct `channels { … }` child expands to `feColorMatrix`. Declare
only the output channels that change (`r`, `g`, `b`, `a`) as sums of
input channels and constants, in the `an+b` form of `@nth`: `g - .5r`,
`.5 * r`, `2b + .2`. Omitted channels stay identity; every expression
reads the original input, so `r: b; b: r` swaps red and blue. Anything
else — parentheses, channel products, functions, unknown names — is
a diagnostic and keeps identity. Other attributes (`in`,
`result`, …) pass through; nested blocks are dropped.

```css
filter: @svg-filter(
  region: -20% / 140%;
  frequency: .003 .008; scale: 80; octave: 10; seed: @r(1000);
  channels { g: g - .5r; b: 2b + .2; }
);
```

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

### 9.3 Patterns

```css
@pattern(
  grid: 20;
  fill: #000;
  match(dr < .5) { fill: #fff; }
)
```

```
pattern-body  = { name ':' value ';' | match-block | repeat-block }
match-block   = match { ',' match } '{' pattern-body '}'
                { 'else' match { ',' match } '{' pattern-body '}' }
                [ 'else' '{' pattern-body '}' ]
match         = 'match' '(' expression ')'
repeat-block  = 'repeat' '(' integer [ 'as' name ]
                { ',' expression } ')' '{' repeat-body '}'
repeat-body   = { name ':' value ';' | match-block | repeat-block }
value         = expression | expression ',' expression ',' expression [ ',' expression ]
              | css-color
```

Built-ins are `grid`, `shape`, `size` and `fill`; any other name is a
variable (declare on first use, assign later). Undeclared, invalid, or
`cssd*` names are reported (§11).

`match` blocks run where the test holds; several selectors on one head
are one test. Follow with `else match(…)` or `else`. Blocks nest and
open a child scope. `match(t, v, …)` in a value picks the first match.

After the body, the cell is masked by `shape` distance from center
(antialiased at half `size`). `shape` is `circle`, `square`, `diamond`,
`none`, a variable, or a `du`/`dv` expression; `size` alone masks
with a square. `fill` is a CSS color, channels 0–1, or an expression;
last `fill` wins.

Expressions use GLSL syntax, not §8: `^` is xor; use `and`/`or`/`not`
instead of `&&`/`||`/`!`. No units or `var()`. Swizzles read
`vec2`/`vec3`/`vec4`/`mat2`; `#rgb` is `vec3`. Adjacent number and
name multiply (`2t`, `2sin(t)`); two names do not.

Cell names from §8, plus `du` and `dv` (position inside the cell,
−0.5 to 0.5, `dv` downward), `uv` (over the whole pattern, 0 to 1,
`uv.y` upward), `pos` (centered, aspect-correct, `pos.y` upward),
`t` (time in seconds; reading it animates), and `size` (current
`size`, 1 until set). Without `grid` the pattern is one cell, so
`du`, `dv`, `uv` and `pos` address every pixel.

Besides GLSL: `match`, `rand`, `noise`, `fbm`, `voronoi`, `hsl`/`hsv`,
`rot`, `smin`, `ngon`, `escape` (96 steps, bailout 16), `spiral`,
`dither`. Two floats or one `vec2` work as a point (`fbm(p)`,
`ngon(p, 6)`, …).

`repeat(n [as i] [, stop …])` runs its body; `i` is a zero-based index.
Extra arguments stop the loop once they all hold. Counts over 1024, nested
products over 65536, or invalid counts are skipped (§11). A variable's
type is fixed at first assignment (numbers become floats). `fill`,
`shape`, `size` and `grid` are not allowed inside `repeat`.

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
its own precision. `pos` is a centered, aspect-correct coordinate:
the short axis of the canvas is −0.5 to 0.5 and `pos.y` is upward.

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
Unknown properties and at-rules pass through. Diagnostics are reported
at most once per component:

**While parsing.** An unclosed `(` in a value runs to the next `}` or
`<`. An unclosed argument list runs to end of source; arguments before
the last top-level `,` are kept. `@keyframes` without a name produces
nothing.

**While generating.** `@use` cycles skip the variable (§2). Unknown
called functions emit as `@name`. Invalid cell selector modifiers match
nothing. Bad `@svg` `viewBox` counts drop the attribute. Inline
`defs` with other than one element becomes empty. Bad `draw:` or missing
animation duration drops the declaration or `dur`. Invalid timing words
are dropped.

**While drawing patterns.** Invalid or over-limit `repeat` blocks are
skipped. Undeclared or reserved pattern names are reported. `else`
without `match` is skipped.

An unclosed raw body (`@doodle`, `@shaders`, `@pattern`) runs to end
of source without a report.
