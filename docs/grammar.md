# Language Reference

css-doodle is CSS for drawing on a grid: you style one cell, and
css-doodle evaluates that style for every cell and emits plain CSS.
This page is the grammar: what the parser accepts and how it reads each
form. What the embedded languages draw, their shapes, commands and
functions, is in [languages.md](languages.md).

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
- A digit ends a word (`h1` → `h` `1`), and a number ends where it
  cannot continue (`10px` → `10` `px`). `#` is not a symbol, so `#fff`
  is one word.
- Quotes, `"`, `'` and `` ` ``, keep whitespace as written; calls inside
  them are still recognized.
- Whitespace collapses to one space. It is dropped around `;` `,` `{`
  `}`, after `:` `(` `[` and before `)` `]`, but kept before `:` `(`
  `[` and after `)` `]`: `a (b)` and `a(b)` differ, as do `a :hover`
  and `a:hover`.
- `/* … */` is whitespace. `//` comments exist only in `@pattern`,
  `@scene` and `@shaders` bodies.

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

```css
background: @p(red, blue);
--size: 10px;
@grid: 8 / 200px;
```

```
declaration = property ':' value [ ';' ]
```

The property is everything before the first top-level `:`; the value
runs to the next top-level `;`, `}` or `<`. A property starting with
`@` is a directive: `@grid`, `@size`, `@place`, `@gap`, `@shape`,
`@content`, `@seed` or `@use`. All others, custom properties included,
are emitted as CSS.

`@use: var(--rule), var(--other, var(--fallback))` inserts the
statements stored in custom properties. Fallbacks and nested `@use`
work; a variable already being inserted is skipped and reported.

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
between words, and a call reads it whole: `$rand-int()` does not call
`rand`. A parameter is an expression name (§8): `x1` and `a_b` are one
name.

`$name(args)` calls it anywhere but inside quotes. Without parentheses
`$name` still reads `--name`, and `$name(` with no such function is
still a unit (§6). Text inserted by `@use` calls the sheet's functions,
and the ones it defines stay inside it.

A call is replaced by its body before parsing, so the body works
wherever its text would: as a value, as `@svg` elements, with `*N`
copies. In the body, `$p`, and a bare `p` inside `$()` or `$px()`, is
the argument for `p`, parenthesized inside `$()`. A call's arguments
are not `$()`: pass `$p` there. Missing arguments take their defaults.
Arguments and defaults are pasted as written, so `$dot(@r(5))` draws a
new radius at each `$r`; store a shared random value in a variable
first.

A body of `result` declarations alone gives the last one's value, as a
CSS `@function` does: with `--double(x): { result: $(x * 2); }`,
`$double(2)` is `4`. A body with any other statement is pasted as
written, so an `@svg-filter` element keeps its `result` attribute.

In `@pattern` and `@scene` bodies a call passes values, a parameter
reads bare, and a body that assigns `result` returns a value: see
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
  instead (`@plot.scatter(star)`); `.@b` and `@a(@b(x))` always
  compose.
- **`$` is the calc function.** `$(expr)` evaluates an expression
  (§8). `$unit(expr)` appends `unit` verbatim: `$px(1+1)` is `2px`,
  `$4(1+1)` is `24`, unless a function `--unit()` is defined (§2).
  `$name`, without parentheses, reads the variable `name` (§8) or a
  number. The name ends where a CSS name does, at anything but letters,
  digits, `_`, `-` and non-ASCII, so with `--s: 50`, `$s%` is `50%`
  and `$s.x` is `50.x`.

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
- An argument starting with `±` expands into two, `-x` and `x`: `±1`,
  `±(a + 1)`, `±@r(10)`. Elsewhere `±` is text.
- Backticks read as double quotes, so a doodle fits in a double-quoted
  HTML attribute.
- In `@pick` and `@p`, a top-level `:` in the first argument ends an
  index: `@pick(k: a, b, …)` gives item `k`, an expression (§8)
  counted from 1, rounded and wrapping around as `@pn` does. Only that
  item is composed, so `@pick(@i: red, blue)` alternates. A quoted
  colon is text.

`@doodle`, `@shaders`, `@pattern` and `@scene` take a raw body up to
the matching `)`, respecting quotes; `@scene` runs its `@` functions
for each cell, and once per copy in a `*N` block. `@svg` reads an SVG
body (§9.1), where `element*count` expands before the body is split
into arguments.

## 8. Expressions

One language serves `$(…)`, `@match(…)` (function and cell selector),
the index of `@pick(k: …)`, `@cell(…)`, `@random(ratio)` and the
`@shape` commands. `@pattern` and `@scene` use a GLSL-oriented one
(§9.3).

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
| adjacent values, `2x`                       | multiply                    | left          |
| `-` `+`                                     | sign (prefix)               | right         |
| `*` `/` `÷` `%`                             | multiply, divide, remainder | left          |
| `+` `-`                                     | add, subtract               | left          |
| `<<` `>>`                                   | shift                       | left          |
| `&`                                         | bitwise and                 | left          |
| `\|`                                        | bitwise or                  | left          |
| `<` `>` `<=` `>=` `≤` `≥` `=` `==` `!=` `≠` | compare, gives `1` or `0`   | left          |
| `&&` `∧`                                    | and, short-circuit          | right         |
| `\|\|` `∨`                                  | or, short-circuit           | right         |

- **Everything is a number.** Units drop: with `--w: 10px`, `$(w * 2)`
  is `20`. `&&` and `||` return the deciding operand; `%` takes the
  sign of the left operand. Right after a number `%` is a percent
  sign, dropped unless an unsigned number, a name or `(` follows:
  `25% > 10` is `1`, so `@tile.y > 50` works; `25%-5` is `20`; `7%3`
  is `1`.
- **Adjacent values multiply**: `2x`, `2(3)`, `2π`. A space ends the
  product (`2 x` is `2`), and a name directly before `(` is a call.
  The power binds first, then the product, then a sign: `-2^2` is
  `-4`, `2x^2` is `2(x^2)`, `1/2π` is `1/(2π)`. A value keeps its own
  sign: with `--k: -2`, `$k^2` and `@r(-2, -2)^2` are `4`.
- **Dashed names.** `a-b` is one variable if the context defines it,
  else `a - b`; the longest defined name wins.
- **Names** are looked up in the context, then among `π`, `random`,
  `gcd`, `match` and the GLSL functions `mod`, `fract`, `clamp`, `mix`,
  `step` and `smoothstep`, then in JavaScript's `Math` (`PI`, `sin`,
  `hypot`, …). Any other name is `0`. The GLSL ones read as in
  `@pattern`: `mod(a, b)` takes the sign of `b`, so `mod(-1, 4)` is
  `3`, and `step(edge, x)` is `1` from the edge on.
- **`pick(k: a, b, …)`** is the indexed `@pick` (§7), evaluating only
  item `k`: `pick(4: a, b, c)` is `a`. Without the index it reads as
  `0`.
- **Calls chain** right to left: `tan.cos.sin(x)` is
  `tan(cos(sin(x)))`. `match(t1, v1, t2, v2, …, else)` gives the
  value after the first test that holds, else the last odd argument
  or `0`, and evaluates only the branch it returns.
- **No errors.** Unknown names, cycles and missing operands read as
  `0`; division by zero gives `Infinity`.
- **Live values.** A `var()`, such as `@t`, `@ux` and the other
  uniforms give, has no number at generation time, so the math around
  it is written out as CSS math: `$(@t / 10)deg` is
  `calc((var(--cssd-utime) / 10) * 1deg)`. Operators become `calc()`,
  `rem()` and `pow()`, and comparisons, `!`, `&&`, `||` and `match`
  become `0`/`1` arithmetic through `sign()`, both sides written out.
  `sin` `cos` `tan` `asin` `acos` `atan` `atan2` `sqrt` `exp` `log`
  `abs` `sign` `pow` `hypot` `min` `max` `mod` keep their names,
  `round`, `floor`, `ceil` and `trunc` become `round()`, and `fract`,
  `clamp`, `mix`, `step`, `smoothstep` and `pick(k: …)` are written out
  in those. A `calc()` reads as a group, so results compose. Shifts,
  bitwise operators, `gcd` and other functions read as `0`, as does a
  live value where a number is required (`@r(@t)`, `@nth`).

Each caller provides its own context:

- **`$(…)`** sees the doodle's custom properties at host, container
  and cell level, without `--`, and the `--name` declarations above it
  in an enclosing `@svg`. Calls inside it run first. The result is
  rounded to 12 significant digits, magnitudes below `1e-9` become
  `0`, and the unit suffix is appended. A lone name like `$w` is a
  generation-time `var()`: arithmetic is evaluated, anything else
  passes through, so with `--c: tomato`, `$c` is `tomato`.
- **`@match`, `@cell` and `@random`** see the cell variables below,
  and the `@match` function inside `@m` or `@M` also sees `n`, `nx`,
  `ny` and `N`. The result is read as true or false. `@random(ratio)`
  defaults to `.5`: below `1` it is a per-cell probability, from `1`
  up it selects that many distinct cells, at most all of them.
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
What each language's commands, shapes and functions do is in
[languages.md](languages.md).

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
svg-body        = { svg-block | svg-match | svg-element | svg-declaration }
svg-block       = selector { ',' selector } '{' svg-body '}'
svg-match       = '@match' '(' expression ')' '{' svg-body '}'
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

A block is an element and its declarations are its attributes;
`g circle` and `g > circle` both nest. Names are case-insensitive and
emitted in SVG spelling (`lineargradient` → `linearGradient`), except
custom property names. A bare name, `feMergeNode;`, is an empty
element, except right after a declaration, where it is the next
`;`-separated value: `values: 1; 2; 3`. `x, y: 1, 2` splits only when
the value has as many parts as names. `style { … }` is raw CSS.

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

`@shape`, `@plot`, `@tile` and `@svg-polygon` read this body as 2D
outlines, and `@scene` as a 3D model. A row is a command, an attribute
of its shape, or else a variable. `kind#id` keeps a shape under a
name, and `#id` alone draws it. The id goes right after the name,
before or after a count; a space before `#` starts a new shape, so
`#knob #knob { rotate: 90 }` draws two. The parts of `move` and
`scale` split at spaces or commas, and an operator keeps its operands:
`move: k * .5 0` and `move: .5 -.25` have two parts each.

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

**Expressions** use GLSL syntax, not §8: `^` is bitwise xor, `**` is
power, and the logic words are `and`, `or` and `not`; for xor, compare
two conditions, `a < .5 != b < .5`. There are no units, `var()` or
`?:`. Swizzles work on `vec2`, `vec3`, `vec4` and `mat2`. A color name
or `#rgb` is a `vec3`, `#rgba` a `vec4`: `mix(red, #00f, du + .5)`.

A number directly followed by a name, a call or `(` multiplies (`2t`,
`2sin(t)`, `2(t + 1)`). Other values side by side, including a number
and a value with a space between, do not multiply and are reported:
`2 t`, `t r`, `r 9`, `r -2`, `(a)(b)`. As in §8, `**` binds before the
product and a sign: `-x ** 2` is `-(x ** 2)`, `2x ** 2` is
`2 * x ** 2`. Inside call parentheses a space separates arguments like
a comma (`hsl(h .75 .65)`), except in `ramp()` stops.

**`$name`** inserts the text of the cell's custom property `--name`
anywhere in the body but its comments, when the pattern is generated:
`--k: @i` gives each cell its own value, and `--n: 72` can be a
`repeat` count. `$a-b` reads `--a-b` if it is defined and subtracts
otherwise. An undefined name skips the pattern and is reported (§11).

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

The body is plain GLSL fragment source or a list of named sections.
`//` comments are removed, and `#define` lines stay on their own line.
`$name` works as in `@pattern`, an undefined name skipping the shader.
Text stored in a variable is one line, so keep `//` comments and `#`
directives in the section itself.

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

The element's `grid` attribute and the `grid:` of a `@pattern` read
the same rule. A modifier's value runs to the next modifier symbol,
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
or height is `auto`. Paper presets are landscape unless an orientation
is given.

### @gap, @place

`@gap` takes one or two lengths, then optionally a rule drawn inside
the gap, written like a border shorthand: a bare number gets `px`, a
missing style is `solid`, a rule with no width fills its gap, and with
no gap given the gap takes the rule's width. `@grid`'s `ß` modifier
completes a border the same way, and also gives a lone color a `1px`
width.

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
