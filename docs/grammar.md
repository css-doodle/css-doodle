# Language Reference

css-doodle is CSS for drawing on a grid: you style one cell, and
css-doodle evaluates that style for every cell and emits plain CSS.
This page is the grammar: what the parser accepts and how it reads each
form. What the embedded languages draw is in [languages.md](languages.md).

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

- A `-` before a digit is a sign unless a number, word, `)` or `]`
  precedes it: `a -1` is two tokens, `a-1` three.
- A digit ends a word (`h1` → `h` `1`), as does a `.` before a digit
  (`a.5` → `a` `.5`); a number ends where it cannot continue (`10px` →
  `10` `px`). `#fff` is one word.
- Quotes, `"`, `'` and `` ` ``, keep whitespace as written; calls inside
  them still run.
- Whitespace collapses to one space. It is dropped around `;` `,` `{`
  `}`, after `:` `(` `[` and before `)` `]`, but kept before `:` `(`
  `[` and after `)` `]`, so `a (b)` and `a(b)` differ.
- `/* … */` is whitespace. `//` comments exist only in `@pattern`,
  `@scene`, `@shape`, `@plot`, `@tile` and `@svg…` bodies.

## 2. Statements

```
doodle           = { top-statement }
top-statement    = declaration | at-statement | keyframes | definition
                 | selector-block | conditional-block | ';'
nested-statement = declaration | keyframes | selector-block | conditional-block | ';'
```

A statement is a block when its first top-level `{` comes before any
top-level `;` or `}`, and otherwise a declaration or at-statement.
Markup tags (`<…>`) between statements outside blocks are skipped.

### Declarations

```
declaration = property { ',' property } ':' value [ ';' ]
```

The property is everything before the first top-level `:`; the value
runs to the next top-level `;`, `}` or `<` opening a tag. Several
properties take a part of the value each when it has as many
comma-separated parts, and the whole value each otherwise, as separate
declarations would: `--x, --y: 1, 2` is `--x: 1; --y: 2`. A property
starting with `@` is a directive: `@grid`, `@size`, `@place`, `@gap`,
`@shape`, `@content`, `@seed` or `@use`. All others, custom properties
included, are emitted as CSS.

`@use: var(--rule), var(--other, var(--fallback))` inserts the
statements stored in custom properties, fallbacks and nested `@use`
included; a variable already being inserted is skipped and reported. A
name starting with a letter, `@use: gradient-2d`, loads that addon from
`@css-doodle/addons` first, and one that does not load is reported.
Inside a nested `@doodle`, `@use` of a name does nothing. Inserted
text calls the sheet's functions, and the ones it defines stay inside
it.

### Function definitions

```css
--twice(x): $(x * 2);
--dot(r, c = red): circle { r: $r; fill: $c }
--dots(): { $dot(1) $dot(2, blue) }

width: $twice(3)px;
background: @svg(viewBox: 0 0 10 10; $dots());
```

```
definition = '--' name '(' [ param { ',' param } ] ')' ':' body
param      = name [ '=' text ]
body       = '{' text '}' | statement
```

A top-level `--name(params):` defines a function and emits nothing. The
body is the text in braces, or else one statement, up to its `;` or
through the block it opens. The name is letters, digits, `_`, and `-`
between words, read whole: `$rand-int()` does not call `rand`.
Parameters are expression names (§8). Inside `@svg()` a definition may
start any statement and is seen in that `@svg()` only, where it hides
a sheet function of the same name.

`$name(args)`, anywhere but inside quotes, is replaced by its body
before parsing, so the body works wherever its text would: as a value,
as `@svg` elements, with `*N` copies. In the body `$p` is the argument
for `p`. Missing arguments take their defaults, and a default may use
the parameters before it: `--box(w, h = $w)`. Arguments are pasted as
written, except:

- Parentheses around a whole argument with a comma inside make it one
  list and are dropped, as for built-in functions (§7):
  `--g(s): linear-gradient($s)` makes `$g((red, blue))`
  `linear-gradient(red, blue)`. Passed on to another call, the list
  keeps them. Without a comma they stay: `$f((1px + 2px))`.
- Inside `$()` or the test of a `@match(test) { }` block, a bare `p`
  is the argument too, each argument is parenthesized, and a call reads
  as one value: with `--inc(x): x + 1`, `$(2 * $inc(3))` is `8`. There
  a bare `inc(3)` calls it too, unless a built-in has the name, and
  chains as a built-in does (§8): `inc.abs(x)` is `inc(abs(x))`.
- In the arguments of a `$name()` call, and in a default, a bare `p` is
  the argument as `$p` is, unless a `:` follows it or a dash joins it
  to a word, as in `var(--p)`: with `--seg(k): $(k * 10)px`,
  `--row(k): $seg(k + 1)` makes `$row(3)` `40px`.
- An argument or default with a random or picking call (`@r`, `@p`,
  `@pn`, …) is worked out once, where the call is, in order, as is an
  `@n` of the caller: `$dot(@r(5))` gives one radius to each `$r`. A
  body holding a `@doodle`, `@pattern` or `@scene` takes
  every argument as written.

As with built-ins (§6), a number right after the name is the first
argument, unless the whole name is a function: `$m10(x)` is
`$m(10, x)`, `$m.5()` is `$m(.5)`. A `.` before a letter composes
calls, rightmost first: `$a.b3(x)` is `$a($b(3, x))`, `$a.@r(5)` is
`$a(@r(5))`. Either way the parentheses are needed and `--m()` or
`--a()` must be defined: `$m10` alone reads a variable.

A body of `result` declarations alone gives the last one's value, as a
CSS `@function` does: with `--double(x): { result: $(x * 2); }`,
`$double(2)` is `4`. Any other body is pasted as written. A body may
give a point: with `--at(a): $(cos(a)) $(sin(a))`,
`points: @m(6, $at($(n * π / 3)))` is a hexagon.

In `@pattern` and `@scene` a call passes values instead: see
[Patterns](languages.md#3-patterns).

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
compound, and `:doodle.dark:hover` is short for `:doodle(.dark:hover)`.
A rule whose selectors are all `:doodle` or `:container` is
generated once, not per cell.

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
  before the arguments inverts the test, `@cell not (x = y)`; selectors
  written one after another all have to match, `@row(1) @col(2)`; a
  pseudo right after applies to the cell, `@nth(1)::after`; and a comma
  lists several, of which a cell takes the first that matches. `@odd`
  and `@even` are a checkerboard: `@odd` matches where `x + y` is even,
  unlike the `odd` of `@nth`, `@row` and `@col`.
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
calls. Text is emitted as written, except that a `π` no digit touches
becomes pi; `2π` stays, and only expressions (§8) multiply it.

## 6. Functions

```css
background: @p(red, blue);
rotate: @r(360deg);
width: $(@i * 10)px;
```

```
function-call  = ( '@' | '$' ) ( name [ '(' arguments ')' ] | '(' arguments ')' )
name           = name-start { name-character }
name-start     = letter | digit | '_' | '%' | '-'
name-character = letter | digit | '_' | '.' | '%' | '-'
```

`@` or `$` starts a call only when a name or `(` is adjacent to it,
and is text otherwise; the name and its `(` must be adjacent too.

- **Digits in a name** split off as the first argument: `@m3(a)` is
  `@m(3, a)`, `@p1-2(a)` is `@p(1-2, a)`. `Math` names keep them
  (`@log2(8)`), and `@doodle`, `@pattern` and `@scene` read
  them as a size: `@doodle100x50(…)`, or `@doodle100(…)` for a square.
- **A `.` before a letter** composes calls, rightmost first: `@a.b(x)`
  and `@a.@b(x)` are `@a(@b(x))`. Before a digit it stays in the name:
  `@a.5(x)` is `@a(.5, x)`. When `a` has a variant `b`, `@a.b(x)` calls
  the variant instead (`@plot.scatter(star)`).
- **`$` is the calc function.** `$(expr)` evaluates an expression
  (§8), and a unit right after it is appended: `$(1+1)px` is `2px`.
  `$name()` calls the function `--name()` (§2). `$name` without
  parentheses reads the variable `name` (§8); the name ends where a CSS
  name does, so with `--s: 50`, `$s%` is `50%`.

## 7. Arguments

```
arguments = [ argument { ',' argument } ]
argument  = { text | function-call | variable }
```

Arguments split at top-level commas. Whitespace belongs to the
argument, so `@p(a b, c)` has two.

- `(…)`, `"…"` or `'…'` around a whole argument is removed and the
  content passed as one unit; around part of it, it stays.
- An argument starting with `--x`, `(--x)` or `"--x"` refers to that
  custom property.
- An argument starting with `±` expands into two, `-x` and `x`: `±1`,
  `±(a + 1)`, `±@r(10)`. Elsewhere `±` is text.
- In a pick (`@p`, `@P`, `@pn`, …), an argument ending in ` xN` stands
  for N copies: `@p(red x3, blue)` picks red three times in four.
- Backticks read as double quotes, so a doodle fits in a double-quoted
  HTML attribute.
- In `@pick` and `@p`, a top-level `:` in the first argument ends an
  index: `@pick(k: a, b, …)` gives item `k`, an expression (§8) counted
  from 1 and wrapping around. Only that item is composed, so
  `@pick(@i: red, blue)` alternates; a lone item, as in
  `@pick(@i: @palette(5))`, is composed and picked from.
- In `@r` and `@ri`, a top-level `:` in the first argument ends a key:
  `@r(k: a, b)` draws over the range of `@r(a, b)` by key `k`, an
  expression. The same key gives the same draw and takes nothing from
  the seed's stream, so `@r(@i: 10, 50)` is one number per cell that
  every property reads alike.

`@doodle`, `@pattern` and `@scene` take a raw body up to
the matching `)`, respecting quotes, as do `@doodle` variants such as
`@doodle.wrap(…)`, a tile that repeats without seams. `@svg` reads an
SVG body (§9.1), where `element*count` expands before the body is split
into arguments. `@raw` keeps its text as written, with its functions
run.

## 8. Expressions

One language serves `$(…)`, `@match(…)`, `@cell(…)`, `@random(ratio)`,
the index of `@pick(k: …)`, the key of `@r(k: …)` and the `@shape`
commands. `@pattern` and `@scene` use a GLSL-oriented one (§9.3).

```
expression = operand { operator operand }
operand    = [ '+' | '-' | '!' | 'not' ] ( number | name | call | '(' expression ')' )
call       = name { '.' name } '(' [ expression { ',' expression } ] ')'
name       = letter or '_', then letters, digits or '_'
```

| Operators, highest precedence first         | Meaning                     | Associativity |
| ------------------------------------------- | --------------------------- | ------------- |
| `!`                                         | not (prefix)                | right         |
| `^` `**`                                    | power                       | right         |
| adjacent values, `2x`                       | multiply                    | left          |
| `-` `+`                                     | sign (prefix)               | right         |
| `*` `/` `%`                                 | multiply, divide, remainder | left          |
| `+` `-`                                     | add, subtract               | left          |
| `<<` `>>`                                   | shift                       | left          |
| `&`                                         | bitwise and                 | left          |
| `\|`                                        | bitwise or                  | left          |
| `<` `>` `<=` `>=` `≤` `≥`                   | order, gives `1` or `0`     | left          |
| `=` `==` `!=` `≠`                           | equal, gives `1` or `0`     | left          |
| `not`                                       | not (prefix)                | right         |
| `&&` `and`                                  | and, short-circuit          | right         |
| `\|\|` `or`                                 | or, short-circuit           | right         |

- **Everything is a number.** Units drop: with `--w: 10px`, `$(w * 2)`
  is `20`. `&&` and `||` return the deciding operand, `%` takes the
  sign of the left operand, and `0 < x < 1` is `0 < x && x < 1` until
  parentheses end the chain. An order binds before an equality, so
  `x < .5 != y < .5` is true when just one of the two holds. Right
  after a number `%` is a unit (below) unless an unsigned number, a
  name or `(` follows: `$(100% - 10%)` is `calc(100% - 10%)`, `7%3` is
  `1`. Where only a number fits it reads its number: `25% > 10` is `1`.
  A function's result reads its number too: `$(@tile.x / 100)` is
  `0.5` where `@tile.x` is `50%`.
- **Rounding noise is none.** Comparisons, `sign` and `step` take a
  difference below `1e-9` as `0`: `.1 + .2 == .3` is `1`.
- **Adjacent values multiply**: `2x`, `2(3)`, `2π`. A space ends the
  product and makes a list, which reads as its first value: `2 x` is
  `2`. A name before `(` is a call, `x (2)` too. The power binds first,
  then the product, then a sign: `-2^2` is `-4`, `2x^2` is `2(x^2)`,
  `1/2π` is `1/(2π)`. A value keeps its own sign: with `--k: -2`,
  `$k^2` is `4`.
- **Dashed names.** `a-b` is one variable if the context defines it,
  else `a - b`; the longest defined name wins.
- **Names** are looked up in the context, then among `π`, `random`,
  `gcd`, `match` and the GLSL functions `mod`, `fract`, `clamp`, `mix`,
  `step`, `smoothstep`, `radians`, `degrees` and `atan`, then in
  JavaScript's `Math`. Any other name is `0`. A unit on a number is
  written out as CSS math, as a live value is: `$((@i - 4.5) * 12deg)`
  is `calc(-3.5 * 12deg)` in cell 1, and `0` where only a number fits.
  Inside a call `deg`, `turn` and `rad` are radians instead:
  `cos(60deg)` is `cos(radians(60))`. The GLSL ones read as in `@pattern`:
  `mod(-1, 4)` is `3`.
- **`pick(k: a, b, …)`** is the indexed `@pick` (§7), evaluating only
  item `k`: `pick(4: a, b, c)` is `a`.
- **`random()`** is a number in `[0, 1)` from the doodle's seed, drawn
  each time the formula runs, as at every point of a shape. Elsewhere
  write `@r`, which runs first: `$(@r() * 2)`. In a selector it is the
  draw `@random` makes: `@match(random() < .3)` picks the cells
  `@random(.3)` does.
- **Calls chain** right to left: `tan.cos.sin(x)` is
  `tan(cos(sin(x)))`. `match(t1, v1, t2, v2, …, else)` gives the value
  after the first test that holds, else the last odd argument or `0`,
  and evaluates only that branch.
- **No errors.** Unknown names, cycles and missing operands read as
  `0`; division by zero gives `Infinity`.
- **Live values.** A `var()` such as `@t` has no number at generation
  time, so the math around it is written out as CSS math:
  `$(@t / 10)deg` is `calc((var(--cssd-utime) / 10) * 1deg)`.
  Comparisons and logic become arithmetic through `sign()`; functions
  CSS has keep their names, `atan(y, x)` becoming `atan2()` and
  `floor`, `ceil` and `trunc` `round()`; `fract`, `clamp`, `mix`,
  `step`, `smoothstep`, `radians`, `degrees` and `pick(k: …)` are
  written out; shifts, bitwise operators and other functions read as
  `0`. A live value where a number is required is dropped: `@r(@t)` is
  `@r()`. A variable declared once on the cell, `:doodle` or
  `:container`, whose value is one live call (with no `var()` but
  uniforms on `:doodle` and `:container`), is read in a cell's
  property other than `content` as `var()`:
  `--a: $(@t / 1000); rotate: $(a * 2)rad` is
  `rotate: calc((var(--a) * 2) * 1rad)`.

Each caller provides its own context:

- **`$(…)`** sees the doodle's custom properties without `--`, the
  `--name` declarations above it in an enclosing `@svg`, then the cell
  variables below, and inside a `*count` copy or `@m`/`@M` its `n`,
  `nx`, `ny` and `N`. Calls inside it run first. The result is rounded
  to 12 significant digits, magnitudes below `1e-9` become `0`. A lone
  name, `$w` or `$(w)`, evaluates arithmetic and passes anything else
  through: with `--c: tomato`, `$c` is `tomato`. The value is read as
  CSS, where a sign stuck to a number after a space starts the next
  value: with `--p: 3 -2`, `$p` is the point `3 -2`, though `$(3 -2)`
  is `1`. An angle passes through unless `sin`, `cos`, `tan` or
  `degrees` take it.
- **`@match`, `@cell` and `@random`** see the cell variables below and
  the custom properties without `--`, a cell variable winning a shared
  name; the `@match` function inside `@m` or `@M` also sees `n`, `nx`,
  `ny` and `N`. `@random(ratio)` defaults to `.5`; below `1` it is a
  per-cell probability, from `1` up a count of distinct cells.
- **`@shape`** sees the shape commands, unrounded.

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

`@svg`, `@shape`, `@scene` and `@pattern` share the tokens and
comments of §1 and one body:

```
body  = { row | block | match | ';' }
row   = name { ',' name } ':' value [ ';' ]
block = head '{' ( body | raw ) '}'
match = 'match' '(' expression ')' '{' body '}'
      | 'match' '{' { expression '{' body '}' } [ 'else' '{' body '}' ] '}'
```

Each language defines its heads, values and expressions, and which
block bodies stay raw text (`style { … }` in SVG). At the doodle level
`a: b { … }` is a selector block (`a:hover { }`); inside `@svg` it is a
row with a block value.

- **Several names** take a part of the value each when it has as many
  parts as names, and the whole value each otherwise: `x, y: 1, 2`.
  Each language splits a value its own way.
- **`match`** runs its body where the test holds, or of several arms
  the first whose test holds, else `else`. An arm without a test, a
  row between arms, an `else` before the last arm and a test with a
  top-level comma, `match(a, b)`, are reported and skipped. `@svg`
  writes `@match(test)`, without arms.
- **A row nothing reads** is reported in `@shape`, `@scene` and
  `@pattern`: `unused fil`.

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
svg-body        = { svg-block | svg-match | svg-element | svg-row }
svg-block       = selector { ',' selector } '{' svg-body '}'
svg-match       = '@match' '(' expression ')' '{' svg-body '}'
svg-element     = name [ ';' ]
selector        = element { [ '>' ] element }
element         = name [ '#' id ] { '.' class } [ '*' count ]
count           = number | number 'x' number | number '-' number
svg-row         = attribute { ',' attribute } ':' ( value | svg-block ) [ ';' ]
                | 'style' [ property ] ':' ( value | '{' css '}' ) [ ';' ]
                | 'animate' attribute ':' value { ';' value } [ '/' timing ] [ ';' ]
                | 'draw' ':' timing [ ';' ]
                | 'stops' ':' stop { ',' stop } [ ';' ]
timing          = duration { delay | repeat-count | easing | fill }
stop            = color [ number ]
```

A block is an element and its rows are its attributes;
`g circle` and `g > circle` both nest. Names are case-insensitive and
emitted in SVG spelling (`lineargradient` → `linearGradient`), except
custom property names. A bare name, `feMergeNode;`, is an empty
element, except right after a row, where it is the next
`;`-separated value: `values: 1; 2; 3`. Several names split a value
at spaces or commas after its functions run: `x, y: 1 2`.
`style { … }` is raw CSS.

### 9.2 Shapes

```css
clip-path: @shape(
  subtract {
    union {
      circle { r: .72 }
      polygon*12 {
        points: -.11 0, .11 0, .07 .22, -.07 .22;
        move: 0 .66;
        rotate: n * 30;
      }
    }
    circle { r: .26 }
  }
  round: .03;
);
```

```
shape-property = preset
body           = { row | shape | match }
row            = [ '-' ] name { ',' [ '-' ] name } ':' value [ ';' ]
shape          = head [ '{' body '}' ] [ ';' ]
head           = kind [ '#' id ] [ copies ] | kind copies '#' id | '#' id [ copies ]
kind           = group | shape-name [ arguments ] | '(' body ')'
group          = 'union' | 'subtract' | 'intersect' | 'exclude'
copies         = '*' count [ 'x' count ]
```

`@shape`, `@plot`, `@tile` and `@svg-polygon` read this body as 2D
outlines, and `@scene` as a 3D model. A row is a command, an attribute
of its shape, or else a variable. `kind#id` keeps a shape under a name
and `#id` alone draws it. The id goes right after the name, before or
after a count; a space before `#` starts a new shape. A call pastes
its function's body (§2), so a function used as one shape puts it in
parentheses, `--cross(s): (circle { … } scale: $s)`: in braces its
rows would apply to the enclosing shape. The parts of
`move` and `scale` split at spaces or commas, and an operator keeps its
operands: `move: k * .5 0` and `move: .5 -.25` have two parts each,
`move: k (0) 0` three. Several names split the value the same way:
`x, y: cos(t) sin(t)`. A `match` body holds rows only, each for a name
set earlier in the same body, which keeps that value where the test
fails. A quoted `text:` value keeps its commas, `;` and parentheses.

### 9.3 Patterns

```css
@pattern(
  grid: 20;
  fill: #000;
  match(dr < .5) { fill: #fff; }
)
```

```
pattern-body  = { targets ':' value ';' | match | repeat-block | texture-block }
targets       = target { ',' target }
target        = name [ '.' swizzle ]
texture-block = texture-name '{' doodle '}'
repeat-block  = 'repeat' '(' integer [ 'as' name ]
                { ',' expression } ')' '{' repeat-body '}'
repeat-body   = { targets ':' value ';' | match | repeat-block }
value         = css-color | expression { ',' expression }
```

**Names.** `grid`, `shape`, `size` and `fill` are built in, and so is
`place` with `grid: dots …`; only `size` is also a value. Any other
name is a variable, declared and typed by its first assignment:
numbers become floats, and a color is a `vec3`, or a `vec4` with
alpha. Undeclared, invalid and `g_…` names are reported (§11).
`v.xz: …` writes those channels of a vector. The
cell variables, `pos` and `du` among them, are written in place, inside
a block too: `pos.x: abs(pos.x)` mirrors the pattern, and
`match(random() < .5) { du: -du; }` flips half the cells. Several targets split the
value at commas: `a, b: 1, vec2(2, 3)`.

**Expressions** use GLSL syntax. Operators bind as in the table of §8,
`^` and `**` are power, and `%`, `a < b < c` and the logic words read
the same. There are no units, `var()` or `?:`; `2px` is 2 times the
variable `px`, and `45deg` 45 times `deg`. `deg` is π/180 and `turn`
2π, unless a variable takes the name. Swizzles work on
`vec2`, `vec3`, `vec4` and `mat2`. A color name or `#rgb` is a `vec3`, `#rgba` a `vec4`:
`mix(red, #00f, du + .5)`.

A number directly followed by a name, a call or `(` multiplies (`2t`,
`2sin(t)`, `2(t + 1)`). Other values side by side, `2 t`, `r -2` or
`(a)(b)`, do not multiply and are reported. The power binds before the product
and a sign, as in §8. Inside call parentheses a space separates
arguments like a comma (`hsl(h .75 .65)`), except in `ramp()` stops.
A name directly before `(` is a call; `k (0)` is two values.

**`$name`** inserts the text of the cell's custom property `--name`
anywhere in the body but its comments, when the pattern is generated:
`--k: @i` gives each cell its own value. `$a-b` reads `--a-b` if it is
defined and subtracts otherwise. An undefined name skips the pattern
and is reported.

## 10. Directive values

### @grid

```css
@grid: 8x8 / 200px +1.1 _10px ß1px solid #000;
```

```
grid-value = { flag } grid { flag | modifier }
grid       = number [ sep number [ sep number ] ]   columns, rows, depth
sep        = 'x' | 'X' | ',' | '，'
flag       = 'row' | 'col' | 'p3d' | 'noclip' | 'border' [ ':' color ]
modifier   = '/' size [ '/' fill ]                  @size, then a fill
           | '+' value                              scale
           | '~' value                              translate
           | '*' value                              rotate
           | '*h' value                             hue-rotate
           | '^' value                              enlarge
           | '∆' value                              perspective
           | '_' value                              gap, as @gap
           | '|' value                              backdrop-filter
           | 'ß' value                              border
```

The element's `grid` attribute reads the dimensions alone, and so does
the `grid:` of a `@pattern`, where a space also separates them and the
one flag is `dots`. A modifier's value runs to the next modifier symbol,
spaces included. Flags are whole words, case-insensitive, allowed
anywhere; `border` is shorthand for `ß 1px solid`, and `border:red`
sets the color. The dimensions are the first item that is not a flag,
so a modifier written before them swallows them.

### @size

```
size-value  = width [ height [ aspect-ratio ] ]
            | preset [ orientation ]
preset      = 'a0' | … | 'a6' | 'postcard' | 'poster'
orientation = 'portrait' | 'landscape'
```

Height defaults to width; the aspect ratio applies only when the width
or height is `auto`. Paper presets are landscape by default.

### @gap, @place

`@gap` takes one or two lengths, then optionally a rule drawn inside
the gap, written like a border shorthand: a bare number gets `px` and
a missing style is `solid`. A rule with no width fills its gap, and
with no gap given the gap takes the rule's width. `@grid`'s `ß`
completes a border the same way, and gives a lone color a `1px` width.

`@place` reads `left`, `right`, `top` and `bottom` as `0%` or `100%`
on their axis and `center` as `50%`; the remaining values fill x, then
y, both `50%` by default. A `@tile` piece is read as its center. A
`safe` keyword sets `place-self` to `center`; overflow is `unsafe`
otherwise.

### Others

```
an-plus-b = [ number ] 'n' [ ( '+' | '-' ) number ] | number | 'even' | 'odd'
direction = [ 'auto' | 'reverse' ] [ expression [ 'deg' | 'rad' | 'grad' | 'turn' ] ]
dimension = number [ unit ]
```

`@nth`, `@row` and `@col` take one or more `an-plus-b` and match a cell
that satisfies any. `direction` is used by `@shape`, gradients and
`@arc`; its angle is an arithmetic expression, so `30 + 15` is `45`
degrees.

## 11. Error recovery

No syntax error is fatal: every input produces a doodle, and unknown
properties and at-rules pass through. Diagnostics are reported at most
once per component.

- **Parsing.** An unclosed `(` in a value runs to the next `}` or `<`.
  An unclosed argument list runs to the end of the source, keeping the
  arguments before the last top-level `,`; an unclosed raw body
  (`@doodle`, `@pattern`, `@scene`) runs there too, unreported.
  `@keyframes` without a name produces nothing. A function that calls
  itself, even through another, is reported and expands to nothing, and a braceless body
  followed by a statement that reads its parameters warns
  `--f() needs {}`. A `$name()` with no `--name()` is reported and
  emits as `$name`.
- **Generating.** `@use` cycles skip the variable, and an undefined
  `$name` skips its `@pattern`. Unknown functions emit as
  `@name`. Invalid cell selector modifiers match nothing. In `@svg`, a
  bad `viewBox` count drops the attribute, inline `defs` with other than
  one element becomes empty, a bad `draw:` drops the declaration, a
  missing animation duration drops `dur`, and invalid timing words are
  dropped.
- **Drawing patterns.** Invalid or over-limit `repeat` blocks are
  skipped. Undeclared or reserved names are reported, and so are
  statements without a colon and what an expression cannot place:
  values side by side, `?:`, a trailing operator. An undeclared name
  reads 0, in `@scene` too. `ramp()`, `shape()` and GLSL
  derivatives inside a `match` block or a `repeat` with stops are
  reported.
