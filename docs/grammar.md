# Language Reference

css-doodle is CSS for drawing on a grid. You write the style of one
cell; css-doodle evaluates it for every cell and emits plain CSS. On
top of CSS it adds functions, arithmetic, cell selectors, and small
languages for SVG, polygons, patterns and shaders. Anything it does
not understand passes through as CSS.

```css
@grid: 8 / 200px;
background: @pick(#f00, #00f);
@cell(2n) {
  rotate: @r(360deg);
}
```

This document describes the language as the parser accepts it and the
generator interprets it. It is a reference, not a tutorial.

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

**Notation.** Grammar blocks use `[ a ]` for optional, `{ a }` for
zero or more repetitions, `a | b` for alternatives and `'x'` for
literal text. Three terms recur throughout:

- **Top level**, of a character such as `;` or `{`, means outside
  parentheses and quotes.
- **Top-level statement** means a statement that is not inside a
  block.
- **Adjacent** means with no whitespace in between.

## 1. Tokens

The source is split into whitespace, numbers, symbols and words.

```
number  = ( '0x' | '0X' ) hex-digits
        | [ '-' ] ( digits [ '.' [ digits ] ] | '.' digits ) [ ( 'e' | 'E' ) [ '+' | '-' ] digits ]
symbol  = one of   : ; , ( ) [ ] { } + - * / % ^ = < > & | ! ? ~ _ @ " ' `
                   π ± ß ≤ ≥ ≠ ∆
word    = run of characters that are not whitespace, digits or symbols
```

The rules that decide where one token ends and the next begins:

| Source  | Tokens        | Rule                                                        |
| ------- | ------------- | ----------------------------------------------------------- |
| `a -1`  | `a` `-1`      | A `-` directly before a digit is a sign, unless a number, word, `)` or `]` directly precedes the `-`. |
| `a-1`   | `a` `-` `1`   | A word precedes the `-`, so it is a symbol.                 |
| `1..3`  | `1` `..` `3`  | A `.` followed by another `.` does not continue a number. `.` is not a symbol, so `..` is a word. |
| `h1`    | `h` `1`       | A digit ends a word.                                        |
| `10px`  | `10` `px`     | A number ends at a character that cannot continue it.       |
| `#fff`  | `#fff`        | `#` is not a symbol, so it starts a word.                   |
| `a\b`   | `a` `\b`      | `\` starts a new word.                                      |

**Quotes.** `"`, `'` and `` ` `` open and close quoted text. Inside
quotes, whitespace is kept as written, and a `\` starts a word that
runs to the next whitespace, digit or symbol. Quoted text is not a
single token: function calls are still recognized inside it.

**Whitespace.** Leading and trailing whitespace is dropped, and every
other run collapses to one space. A space next to `:` `;` `,` `{` `}`
`[` `]` is dropped, as is a space after `(` or before `)`. A space
before `(` or after `)` is kept, so `a (b)` and `a(b)` differ.

**Comments.** `/* … */` comments are treated as whitespace. `//`
comments are recognized only inside shader bodies (§9.4).

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
at-statement. Markup tags (`<…>`) between top-level statements are
skipped.

### Declarations

```css
background: @pick(red, blue);
--size: 10px;
@grid: 8 / 200px;
```

```
declaration = property ':' value [ ';' ]
```

The property is everything before the first top-level `:`. The value
runs to the next top-level `;`, or to a `}` or `<`. A `;` inside
parentheses is part of the value.

A property that starts with `@` is a directive, which css-doodle
handles itself: `@grid`, `@size`, `@place`, `@gap`, `@shape`,
`@content`, `@seed` and `@use`. `@place-cell`, `@offset` and
`@position` are aliases of `@place`. Every other property, custom
properties included, is emitted as CSS.

`@use` inserts statements stored in custom properties of the
component:

```css
@use: var(--rule), var(--other, var(--fallback));
```

Each `var()` may carry a fallback, which is either another `var()` or
a value. Inserted statements may themselves contain `@use`. A variable
that is already being inserted, directly or through another variable,
is skipped and reported (§11).

### At-statements

```css
@import url(fonts.css);
```

A statement that starts with `@` and contains no top-level `:` is an
at-statement. It ends at the first top-level `;` and is emitted as
written, with whitespace collapsed and comments removed. At-statements
are recognized only at the top level; inside a block they are dropped.

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

The name runs to the next whitespace or `{`. A step selector is parsed
as a value, so it may contain function calls.

## 3. Selectors

```css
:hover  { background: red; }
::after { content: ''; }
span    { color: blue; }
.dark & { opacity: .5; }
```

A block whose head does not start with `@` is a selector block. The
head is a comma-separated list of CSS selectors, each of which may
contain `&`.

The subject of a selector block is the current cell, written `&`.
Each selector is resolved against every selector of the enclosing
block:

| Written   | Resolves to | Rule                                                    |
| --------- | ----------- | ------------------------------------------------------- |
| `:hover`  | `&:hover`   | A selector that starts with `:` is appended to the subject. |
| `::after` | `&::after`  |                                                         |
| `span`    | `& span`    | Any other selector becomes a descendant.                |
| `.dark &` | `.dark &`   | A selector that contains `&` has each `&` replaced by the outer selector. |

Two selectors target elements outside the cell and are not nested
under it:

| Selector                 | Target                                     |
| ------------------------ | ------------------------------------------ |
| `:doodle`                | the component                              |
| `:doodle(<compound>)`    | the component when it matches `<compound>` |
| `:container`             | the grid container                         |
| `:container(<compound>)` | the grid container when it matches         |

`:doodle.dark:hover` is shorthand for `:doodle(.dark:hover)`. A rule
whose selectors are only `:doodle` or `:container` is generated once,
not once per cell.

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

A block whose head starts with `@` is a conditional block: a name
followed by any number of keywords and argument lists. The name
determines how the block is treated.

- **Cell selectors** apply their statements to the cells they match:
  `@at(x, y)`, `@nth(an+b)`, `@x(an+b)`, `@y(an+b)`, `@even`, `@odd`,
  `@random(ratio)`, `@match(expression)` and `@cell(…)`. `@col` and
  `@row` are aliases of `@x` and `@y`.
- **CSS group rules** wrap their statements as CSS does: `@media`,
  `@supports`, `@container`, `@layer`, `@scope`, `@starting-style`
  and `@document`, including vendor-prefixed forms such as
  `@-moz-document`.
- **Any other name** is not a doodle construct. The whole block is
  copied from the source unchanged and hoisted to the top level of the
  generated stylesheet. `@font-face { … }` is the usual case.

Whitespace before a segment is preserved, so `@media (hover)` is
emitted as `@media (hover)`.

## 5. Values

```
value = group { ',' group }
group = { text | function-call }
```

A value is a comma-separated list of groups, and a group is CSS text
interspersed with function calls. Whitespace inside a group collapses
to one space. Text is emitted as written, with one exception: a `π`
not preceded by a digit becomes the numeric value of pi. `2π` is
emitted as written; only expressions (§8) evaluate it.

## 6. Functions

```css
background: @pick(red, blue);
rotate: @r(360deg);
width: $px(@i * 10);
```

```
function-call  = ( '@' | '$' ) ( name [ '(' arguments ')' ] | '(' arguments ')' )
name           = name-start { name-character }
name-start     = letter | digit | '_' | '%' | '-'
name-character = letter | digit | '_' | '.' | '%' | '-'
```

`@` or `$` starts a call only when the next character is a letter, a
digit, `_`, `(`, `%` or `-`; otherwise it is plain text. The sigil,
the name and the opening `(` must be adjacent. `@(` or `$(` is a call
with an empty name.

**Digits in a name** are split off and become the first argument. A
`.`, `x` or `-` between digits is kept with the digits.

| Written             | Means                                                  |
| ------------------- | ------------------------------------------------------ |
| `@m3(a)`            | `@m(3, a)`                                             |
| `@n1.5(a)`          | `@n(1.5, a)`                                           |
| `@p1-2(a)`          | `@p(1-2, a)`                                           |
| `@log2(8)`          | `@log2(8)`; a `Math` name keeps its digits             |
| `@doodle100x50(…)`  | `@doodle(…)` rendered at 100 by 50. For `@shaders100x50(…)` the suffix caps the raster size. `@pattern` accepts a suffix, but its renderer ignores it. |

**A `.` followed by a letter** ends the name and composes calls. The
rightmost call is applied first:

| Written      | Means                                               |
| ------------ | --------------------------------------------------- |
| `@a.b(x)`    | `@a(@b(x))`                                         |
| `@a.@b(x)`   | the same, with the inner sigil written out          |
| `@a.b.c(x)`  | `@a(@b(@c(x)))`                                     |
| `@a.5(x)`    | `@a(.5, x)`; a `.` before a digit stays in the name |

**`$` is the calc function.** `$(expr)` evaluates `expr` as an
expression (§8). `$unit(expr)` appends `unit` verbatim to the result:
`$px(1+1)` is `2px`, and `$4(1+1)` is `24`. `$name` without an
argument list reads the variable `name` (§8).

## 7. Arguments

```
arguments = [ argument { ',' argument } ]
argument  = { text | function-call | variable }
```

Arguments are separated by top-level commas. Whitespace inside an
argument is part of it, so `@p(a b, c)` has two arguments.
Parentheses nest, and a comma inside quotes does not separate.

- A pair of `(…)`, `"…"` or `'…'` that encloses the whole argument is
  removed, and its content is passed as one unit. A pair that
  encloses only part of the argument is kept: `"a" "b"` stays two
  quoted strings.
- An argument that starts with a custom property name, written `--x`,
  `(--x)` or `"--x"`, refers to that variable. Inside an `@svg` body,
  `--x: …` declares one.
- An argument that starts with `±` expands into two arguments, `-x`
  and `x`: `±1`, `±(a + 1)`, `±@r(10)`. Elsewhere, as in `a±1`, `±`
  is plain text.
- Backticks are read as double quotes, so a doodle can be written
  inside a double-quoted HTML attribute.
- Function calls are recognized anywhere in an argument, including
  inside quotes. Within arguments, a bare `@` or `$` is a call with
  an empty name; the next-character test of §6 does not apply.

Three functions, `@doodle`, `@shaders` and `@pattern`, take their body
as raw text up to the matching `)`, respecting quotes. Nothing inside
is interpreted at this level.

`@svg` takes its body in the SVG language (§9.1) and evaluates it in
place. `--name: value` declarations inside it define variables for the
call, and `element*count` is expanded before the body is read as
arguments.

## 8. Expressions

One expression language is shared by `$(…)`, `@match(…)` (both the
function and the cell selector), `@cell(…)` conditions,
`@random(ratio)` and the commands of `@shape`. `@pattern` uses a
separate, GLSL-oriented expression language (§9.3).

```
expression = operand { operator operand }
operand    = [ '+' | '-' | '!' ] ( number | name | call | '(' expression ')' )
call       = name { '.' name } '(' [ expression { ',' expression } ] ')'
name       = letter or '_', then letters, digits or '_'
```

Operators, from highest precedence to lowest:

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

- **Everything is a number.** Operands are converted with `Number()`,
  and comparisons yield `1` or `0`. `&&` and `||` return the operand
  that decided the result, converted to a number, so `0 || 5` is `5`.
  `%` takes the sign of the left operand. `∧`, `∨` and `÷` are word
  characters and need whitespace around them.
- **Adjacent values multiply.** `2x`, `2 x`, `x y`, `2(3)`, `(1+2)(3)`
  and `2π` are all products. Two exceptions: a name followed by digits
  is one name, even across whitespace, so `x 2` is the variable `x2`;
  and a name adjacent to `(` is a call.
- **A sign binds to the value after it.** `-x` is `-1 * x`, and
  `-2^2` is `4`; write `-(2^2)` for `-4`. Between two values `-`
  subtracts, even when adjacent to the right one: `3-4`, `3 -4` and
  `k -1` are all subtractions.
- **Dashed names.** `a-b` is one variable when the context defines it,
  and `a - b` otherwise. The longest defined name wins: with `--a-b`
  declared, `a-b-c` is `a-b` minus `c`.
- **Lookup order.** A name is looked up in the context first, then
  among `π`, `gcd(a, b)` and `match(c, a, b)`, then among the members
  of `Math` under their JavaScript names: `PI`, `E`, `sin`, `atan2`,
  `log2` and so on. Any other name is `0`. A name bound to a function
  of no arguments calls it: `random`.
- **Variables are expressions** evaluated in the same context, so
  `--a: b + 1` works. A value that leads back to itself, or that nests
  more than 50 levels deep, reads as `0`. A number with a unit reads
  as the bare number unless the unit is a name in scope: with
  `--w: 10px`, `$(w * 2)` is `20`; with `--d: 2s` and `--s: 5`, `d` is
  `2 * s`.
- **Chains** apply right to left: `a.b(x)` is `a(b(x))`. A `-` before
  a call negates its result: `-sin(t)`. `match(c, a, b)` evaluates
  only the branch it takes.
- **There are no errors.** An unknown name or function, a cycle, a
  missing operand and a non-numeric result all read as `0`. An
  operator without an operand is ignored: `5 *` is `5`. Division by
  zero gives `Infinity`.

Each caller provides its own context:

**`$(…)`** sees the custom properties declared in the doodle at host,
container and cell level, without their `--` prefix, plus the `--name`
declarations of an enclosing `@svg`. Function calls inside the
expression are evaluated first (§6). The result is rounded to 12
significant digits, magnitudes below `1e-9` become `0`, and the unit
suffix, if any, is appended. A lone name such as `$w` acts as a
generation-time `var()`: a value that reads as arithmetic is
evaluated, and any other value passes through as written, so with
`--c: tomato`, `$c` is `tomato`. A value that consists only of another
name is followed.

**`@match`, `@cell` and `@random`** see the cell:

| Name             | Value                                                       |
| ---------------- | ----------------------------------------------------------- |
| `x`, `y`         | column and row, from 1                                      |
| `X`, `Y`         | number of columns and rows                                  |
| `i`, `I`         | cell index from 1, cell count                               |
| `dx`, `dy`       | offset from the grid center                                 |
| `dr`, `dc`, `dm` | Euclidean, Chebyshev and Manhattan distance from the center |
| `da`             | angle from the center                                       |
| `db`             | distance to the edge                                        |

The three selectors also see `random`. The `@match` function
additionally sees `z` and `Z`, and, inside `@m` or `@M`, `n`, `nx`,
`ny` and `N`. The result is read as true or false.

**`@random(ratio)`** defaults to `.5`. A ratio between `0` and `1` is
an independent per-cell probability. A value of `1` or more selects
that many distinct cells for this occurrence of the selector, up to
the cell count. A value of `0` or less matches no cell, and a value
equal to or above the cell count matches every cell.

**`@even` and `@odd`** use checkerboard parity: `@even` matches cells
where `x + y` is odd, and `@odd` matches cells where it is even. This
differs from the `even` and `odd` arguments of `@nth`, `@x` and `@y`.

**`@shape`** sees the commands of the shape (§9.2). Results are used
as they are, without the rounding applied by `$(…)`.

## 9. Embedded languages

All embedded languages use the tokens of §1 and share one structure:

```
body        = { declaration | block | ';' }
declaration = head ':' value [ ';' ]
block       = head '{' ( body | raw ) '}'
```

Each language defines what a head and a value mean, and whether a
block body is parsed as statements or kept as raw text (`style { … }`
in SVG, every shader section). One construct reads differently from
the doodle language. At the doodle level, `a: b { … }` is a selector
block, because a head may contain a colon, as in `a:hover { }`. Inside
`@svg` it is a declaration whose value is a block.

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
svg-body            = { svg-block | svg-declaration }
svg-block           = selector { ',' selector } '{' svg-body '}'
selector            = element { combinator element }
element             = name [ '#' id ] { '.' class } [ '*' sequence-count ]
combinator          = whitespace | '>'
svg-declaration     = attribute { ',' attribute } ':' ( value | svg-block ) [ ';' ]
attribute           = name | namespace-attribute
namespace-attribute = one of the supported `xlink:` and `xml:` names below
sequence-count      = number | number 'x' number | number '-' number
```

- An element block becomes an SVG element, and its declarations
  become attributes. `#id` and `.class` in the selector set the `id`
  and `class` attributes.
- `g circle { … }` and `g > circle { … }` both nest `circle` inside
  `g`; the two combinators are equivalent.
- `*sequence-count` repeats the element as `@M(sequence-count, …)`
  would. It accepts a count, a grid such as `2x3`, or an inclusive
  range such as `1-3`; numeric parts are rounded up. Inside the
  element, `@n` is the sequence value: `1`, `2`, `3` for `1-3`, and
  for `2x3` the column index, cycling through `1`, `2`.
- Several attribute names can share one declaration: `x, y: 1, 2`
  sets `x` to `1` and `y` to `2`. The value is split only when it has
  exactly as many parts as there are names; otherwise every name
  receives the whole value.
- A value may itself be an element block, whose selector is the text
  before its first top-level `{`. The element receives a generated
  id, and the attribute becomes `url(#id)`, or `#id` for `href`.
- A `style { … }` block, with or without a selector, keeps its content
  as CSS text.
- The `;` that ends a character reference such as `&amp;` is part of
  the value, not a terminator.
- Namespaced attributes are supported for `xlink:actuate`,
  `xlink:arcrole`, `xlink:href`, `xlink:role`, `xlink:show`,
  `xlink:title`, `xlink:type`, `xml:base`, `xml:lang` and
  `xml:space`.

### 9.2 Polygons

```css
@shape: star;

clip-path: @shape(
  split: 200;
  r: cos(5t);
  fill: evenodd;
);
```

```
shape-property = preset
shape-function = preset | { command ';' }
command        = [ '-' ] command-name ':' expression
command-name   = 'split' | 'vertices' | 'points'
               | 'turn' | 'scale' | 'rotate' | 'degree'
               | 'move' | 'origin' | 'frame' | 'unit'
               | 'direction' | 'dir' | 'fill' | 'fill-rule'
               | 'r' | 't' | 'x' | 'y'
               | variable-name
```

- The `@shape:` directive takes a preset name (`circle`, `star`,
  `heart`, …) and emits it as `clip-path: polygon(…)`. It does not
  accept commands. The `@shape(…)` function accepts either a preset or
  a command body, and is the form to use for custom polygons.
- `r`, `x` and `y` are expressions in the angle `t`, evaluated `split`
  times around the circle. The other named commands transform the
  resulting points. Any other name defines a variable available to the
  expressions that follow it.
- `vertices` and `points` are aliases of `split`, `degree` of
  `rotate`, and `origin` of `move`.
- A `-` before a command name negates its value, except on `fill` and
  `fill-rule`.
- Besides `t`, also written `θ`, the expressions see the point index
  `i`, counted from 1, and two helpers: `seq(a, b, …)` cycles through
  its arguments from point to point, and `range(a, b)` interpolates
  from `a` to `b` across the whole shape.

### 9.3 Patterns

```css
@pattern(
  grid: 20;
  fill: #000;
  match(dr < .5) { fill: #fff; }
)
```

```
pattern-body = { name ':' expression ';' | match-block }
match-block  = match { ',' match } '{' pattern-body '}'
match        = 'match' '(' expression ')'
```

A `@pattern` body declares the parameters of the pattern, `grid`,
`shape`, `size` and `fill`; any other name declares a variable. Each
`match` block holds the declarations that apply where its condition
holds, and `match` blocks may nest. A block opens a child variable
scope: its declarations other than `fill` are read in source order and
shadow outer variables, and a block-local `shape` or `size` changes
the mask for that block.

Expressions are written in a GLSL-oriented language, not the language
of §8. They see the pattern coordinates `x`, `y`, `i`, `X`, `Y`, `I`
and `t`, and the distances `dx`, `dy`, `dr`, `dc`, `dm` and `da`. The
differences from §8: `^` is bitwise xor, the Unicode operators `÷`,
`∧` and `∨` are not available, and `and`, `or` and `not` are aliases
of `&&`, `||` and `!`. Values are bare expressions, without units or
`var()`.

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
section      = ( 'fragment' | 'vertex' | texture-name ) '{' glsl '}'
texture-name = 'texture' { ASCII-letter | digit | '_' }
```

A `@shaders` body is either plain GLSL fragment source or a list of
named sections. A `texture…` section holds a doodle that is rendered
to an image and bound as the sampler of that name. `//` comments are
removed, and `#define` lines are kept on their own line.

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
flag       = 'row' | 'col' | 'p3d' | 'noclip' | 'no-clip'
           | 'border' [ ':' value ]
modifier   = '/' size [ '/' fill ] | '+' value | '~' value
           | '*' [ 'h' ] value | '^' value | '∆' value | '_' value
           | '|' value | 'ß' value
```

The numbers are columns, rows and depth. The same `grid` rule reads
the `grid` attribute of the element and the `grid:` parameter of a
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
spaces. Flags are matched as whole words, case-insensitively, and may
appear anywhere. The dimensions are the first item that is not a flag.
A modifier written before the dimensions is not rejected, but it
swallows them as part of its value.

### @size

```
size-value  = width [ height [ aspect-ratio ] ]
            | preset [ orientation ]
preset      = 'a0' | … | 'a6' | 'postcard' | 'poster'
orientation = 'portrait' | 'pt' | 'p' | 'landscape' | 'ls' | 'l'
```

Height defaults to width. The aspect ratio is used only when the width
or height is `auto`. A paper preset is landscape unless an orientation
is given.

### @gap, @place

`@gap` takes one or two lengths, `gap [ gap ]`. Anything after them
describes a rule drawn inside the gap, written like a border
shorthand: a bare number gets `px`, a missing style is `solid`, and a
rule with no width fills its gap. When no gap is given, the gap takes
the width of the rule. The `ß` modifier of `@grid` completes a border
shorthand in the same way, and also gives a lone color a `1px` width.

`@place` reads `left`, `right`, `top` and `bottom` as `0%` or `100%`
on their axis, and `center` as `50%`. Any remaining values fill x,
then y. Both default to `50%`.

### Others

```
an-plus-b = [ number ] 'n' [ ( '+' | '-' ) number ] | number | 'even' | 'odd'
direction = 'auto' | 'reverse' | number [ 'deg' | 'rad' | 'grad' | 'turn' ]
dimension = number [ unit ]
```

`@nth`, `@x` and `@y` take one or more `an-plus-b` expressions and
match a cell that satisfies any of them. `direction` is used by
`@shape` and by gradients. A value list consists of items separated by
top-level commas or whitespace.

## 11. Error recovery

There are no fatal syntax errors: every input produces a doodle.
Unknown properties and at-rules are emitted as written. Six
situations are reported as diagnostics, each at most once per
component:

| Situation                                               | Recovery                                                    |
| ------------------------------------------------------- | ----------------------------------------------------------- |
| an unclosed `(` in a value                              | the value runs on to the next `}` or `<`, absorbing the declarations in between |
| an argument list that is never closed                   | it runs to the end of the source; the arguments before its last top-level `,` are kept and the rest dropped |
| `@keyframes` without a name                             | produces nothing; parsing continues with the next statement |
| a `@use` variable that refers to itself                 | the variable is skipped (§2)                                |
| an unknown function called with an argument list        | the call is emitted as its name, `@name`                    |
| a cell selector with a modifier it does not have, such as `@cell.random(2)` | matches nothing                         |

The first four are detected while parsing, which continues. The last
two are detected while the CSS is generated. A raw body (`@doodle`,
`@shaders`, `@pattern`) that is never closed runs to the end of the
source without a report.
