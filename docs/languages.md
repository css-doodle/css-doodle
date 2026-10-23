# Embedded Languages

What the commands, shapes and functions of css-doodle's embedded
languages do. How each body is written and read is in
[grammar.md](grammar.md#9-embedded-languages).

**Contents.** 1 [SVG](#1-svg) · 2 [Shapes](#2-shapes) ·
3 [Patterns](#3-patterns) · 4 [Shaders](#4-shaders)

## 1. SVG

**Elements.** `#id` and `.class` set `id` and `class`; `id:` overrides
`#id`, and `class:` adds to the selector's classes. Declarations beside
an `svg { … }` block belong to it, and `svg` blocks merge.
`content: text` adds a text node. `style: { … }` and `style fill: red`
add to the `style` attribute. SVG 1.1 `xlink:` and `xml:` attributes
are supported. `viewBox` takes four numbers, one (`0 0 n n`) or two
(`0 0 w h`), and `padding n` grows it; other counts drop it. A name
XML can't hold, such as `@seed`, is dropped.

**Copies.** `*count` repeats an element like `@M(count, …)`, by a
number, a grid (`2x3`) or a range (`1-3`). Inside, `@n` is the
sequence value, plus `@nx` and `@ny` for a grid.

**Variables.** `--name: value` sets a variable where it stands, once
per copy inside a `*count`: a read after it sees the value, one before
it the doodle's own. Blocks don't scope it, and the latest value wins:
`circle*3 { --i: @n; r: $(i * 2) }` gives radii 2, 4 and 6.

**`@match(test) { … }`** keeps its body only where the test holds: its
elements go where the block stands, and its declarations set the
attributes of the element around it. The test reads like `$(…)`, so it
sees the custom properties and the `@n` of an enclosing `*count`. A
body left out still evaluates its functions and `--name` declarations,
so the random values after it are the same either way. As a value,
`fill: @match(t, a, b)` is still the function.

**Block values** get a generated id and read as `url(#id)`, or `#id`
for `href`. Gradients, `pattern`, `filter`, `clipPath`, `mask`,
`marker` and `symbol` go into `<defs>` with or without a `defs`
prefix: `fill: linearGradient { … }` is `fill: defs linearGradient { … }`.

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

## 2. Shapes

`@shape` draws 2D outlines for `clip-path`, and `@plot`, `@tile` and
`@svg-polygon` read the same body. `@scene` draws a 3D model as an
image.

|            | `@shape`                                                                 | `@scene`                                                                 |
|------------|--------------------------------------------------------------------------|--------------------------------------------------------------------------|
| Shapes     | the presets, `circle`, `square`, `star 6 .3`, `heart`, …; `shape` with `r`, `x`, `y`, `t` and `points`; `polygon { points: x y, … }`; a body in parentheses | `sphere { r }`, `ellipsoid { r: x y z }`, `box { size }`, `cylinder { r; height }`, `cone { r: r1 r2; height }`, `torus { r: R r }`, `capsule { from; to; r }`, `polygon { points; depth }` or `polygon { body; depth }`, `lathe { points }` or `lathe { body }`, `plane`, `sdf { d }` |
| Steps      | `move: x y`, `rotate`, `scale: x [y]`, `mirror`, `grow`, `frame`         | the same in 3D, `rotate: [axis] angle`, and `repeat`, `twist`            |
| Attributes | `round`, `smooth`, `fill-rule`, `unit`, `direction`, `seed`, `turn`      | `round` on `box`, `cylinder` and `polygon`, `smooth`, `fill`             |
| Groups     | `union`, `subtract`, `intersect`, `exclude`                              | `union`, `subtract`, `intersect`                                         |
| Space      | lengths in units where the box is 2 across, `0 0` at its center         | the camera fits the model, so only its proportions matter               |

**Rows** are commands, attributes of their shape, or, for any other
name, variables that the rows and shapes of their block read:
`k: .3; sphere { r: k }`. Unknown shapes and `#id`s are reported;
`@scene` also reports names nothing reads, such as a misspelled
attribute.

**Steps**, `move`, `rotate`, `scale`, `mirror`, `grow` and `frame`, run
in the order written on the shape so far, and one written twice runs
twice: `scale: .5; move: .5 0` halves the shape, then moves it a
quarter of the box right, and a `rotate` after `move` turns it around
the center. A preset's own steps come first, so `square; scale: .5`
halves the square. Other rows are attributes; the last one wins. `y`
points up, and `rotate` turns counterclockwise in degrees (`.25turn` is
90, `2 * 30deg` is 60), but a call such as `sin(90deg)` takes radians.
`mirror: x y` keeps the shape and its reflections across those axes as
one shape, so a half drawn on the right makes both.

**Groups.** `union`, `subtract` and `intersect` join whole shapes;
`subtract` takes the rest from the first, so
`subtract { circle; circle { scale: .9; move: .45 .135 } }` is a
crescent. `exclude` keeps what an odd number of the shapes cover
(`@shape` only; in 3D it would look like `union`). `smooth: r` rounds
every place two shapes meet with a curve of radius `r`. A group's own
rows, like the rows at the top of a body, apply to the joined shapes.

**Names.** `name#id` keeps a shape or group for later instead of
drawing it; `#id` draws it with the rows given there added, an
attribute replacing its own and a command running after its own:
`circle#hole { scale: .2 } subtract { circle; #hole { move: .5 0 } }`.
A name may be used before it is given, the last one given wins, and
`#id` works at the top of a body too.

**Copies.** `name*N` or `name*XxY` repeats a shape or group. Each copy
sees `n` from 1, `N`, and `nx`, `ny` across the grid, and runs its `@`
functions anew: `circle*6 { scale: .2; move: 0 -.6; rotate: n * 60 }`
rings the center, and `circle*2 { move: @pn(-.6 0, .6 0) }` draws two
circles apart.

### @shape

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
treat each contour as a shape of its own. For holes and cutouts away
from the center, a `subtract` group is plainer.

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
`fill-rule`, `frame`, `round` and `grow`. `@tile`, `@plot.scatter`,
`@plot.hex`, `@plot.grid` and `@plot.penrose` fill the region, holes
included.

**Noise.** `@R.t(from, to)` writes a closed noise curve in `t` for one
cell, as in `r: @R.t(.8, 1)` or `grow: @R.t(-.05, .05)`, following the
doodle's seed or the `seed` command.

### Tiles

`@tile(…)` of every kind and the filling `@plot` variants read the body as the
region to fill (`square` by default for `@tile`), along with these
commands. Here `points` counts what comes out, not the corners, so a
body copied from `@shape` leaves it out.

| Command         | Kinds                                   | Value                                                          |
|-----------------|-----------------------------------------|----------------------------------------------------------------|
| `points`        | all                                     | at most this many pieces, or points for `delaunay`; a `@plot` variant returns its points as one list |
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

`@plot.hex(…)`, `@plot.grid(…)` and `@plot.penrose(…)` give points instead of pieces, one per cell like `@plot.scatter(…)`: the centers of
that lattice's pieces that sit inside the region, clear of its
outline, as many as the grid allows, so a `k×k` grid in a `square`
lands on the cell centers. A cell past them gets no point, and
`@place` hides it. `jitter`, `shift`, `op` and `star` move the points,
`@plot.hex(…; op: d)` a honeycomb; `gap`, `round` and `edge` change
nothing. Penrose points sit at the rhombs' centers, five-fold about the
middle and unevenly spaced, so they read best with a few hundred cells.

### @scene

The model is raymarched in WebGL into an image, like `@pattern`, and
its values use the same math: `p` is the point in the shape's own
space, `t` the time in seconds, and `rand()` differs from copy to
copy.

**Fill** is a color, or an expression in `p` that gives one. Shapes in
a group take its fill unless they have their own, and shapes joined
with `smooth` blend their colors. `fill` also sees `normal`, the
surface normal as the camera sees it (x right, y up, z toward the
camera), so `1 - normal.z` is bright at the edges; the scene's light
still shades the result, unless the fill reads `light` (see Light).

**Shapes.** `round` keeps the outer size of a `box`, `cylinder` or
`polygon`, while `grow` makes any shape bigger. `repeat: x y z`
repeats it that far apart along each axis (0 for none), and
`twist: a` turns it `a` degrees per unit up `y`. `sdf { d: … }` takes
a distance written in `p`. `polygon` takes `points`, or a `@shape`
body as its outline, holes and all, in `@shape`'s units:
`polygon { heart; depth: .2 }`. Rows inside the body move the outline
in 2D and the polygon's own rows move it in 3D, except `points: n`,
which resamples the outline as in `@shape`. Both also take `text`
with `font`, or `path`, as `@shape` does. `lathe` turns the right
half of the same outline, where `x` is 0 or more, around `y`:
`lathe { vase }` is a vase. A path keeps its own `x = 0` as the axis,
and text starts at it, so `lathe { text: 'abc' }` turns every letter.
An outline reads the `n` of its own polygon's or lathe's copies, 1
without them: `lathe*3 { circle { r: .1n } }` gives three sizes.

**Camera.** At the top, `view: turn tilt` turns the camera around `y`
and tilts it, in degrees, and `perspective: d` sets its distance, 2 by
default or `none` for a parallel view. The camera fits the model, a
moving one as it is now and over its first 2π seconds, so it holds
still while the model or view moves: `view: 30t` spins it in place.
`zoom: k` then scales the view about its center, cropping above 1.
`drag: turn tilt` lets the pointer turn the view too, half a turn
across the drawing's shorter side, with the tilt kept between straight
down and straight up; `drag: turn` only turns it. The camera then
circles the middle of the model at the distance it has without `drag`,
so the perspective stays, and widens its view only where the model
would not otherwise fit from every side. An animated or dragged scene
draws best in `@content`.

**Light.** `light: x y z` points toward the light the way `normal`
does, so the light turns with the camera; it is `.6 .8 .5` by default.
A color after the direction tints it, and a number sets the strength
of a white one: `light: -1 1 .5 #ffe2b8`. A list adds lights, as in
`light: -1 1 .5, 1 0 -1 #5a7cff * .5`, and `light: none` leaves `fill`
as the final color. `shadow: s`, from 0 to 1, darkens the light that
shapes block, with soft edges, and the places where shapes crowd each
other.

`ambient: sky ground` is the light from all around, which fills the
shade: a surface facing up in the scene gets `sky`, one facing down
gets `ground`, so unlike `light` it stays put when the camera tilts,
and one value fades to a fifth of itself facing down. It is `.3` by default, a grey; `ambient: 0` leaves only
the lights, for deep shadows, and colors tint the shade, as in
`ambient: #6b7a99 #3a2a1a`, cool from above and warm from below.

A fill that reads `light`, itself or through a variable, lights
itself: `light` is how much light reaches the point, shadows included,
from about .25 in full shade to 1 facing a white light (the average of
the colors, with several), and the scene leaves that fill as it is.
`fill: #c3a066 * light` looks the same as `fill: #c3a066`, and
`fill: mix(#5e6472, #e9d8a6, floor(light * 4) / 4)` paints in four
steps, shadows too. Other shapes are shaded as usual, and with
`light: none` it reads 1.

## 3. Patterns

**Blocks.** A `match` block runs where its test holds. `match { … }`
holds arms, each a test and a body, and runs the first whose test
holds, or a last `else { … }` arm when none does. Blocks nest, each
with its own scope. In a value, `match(t1, v1, t2, v2, …, else)` gives
the value after the first test that holds.

**`repeat(n [as i] [, stop …])`** runs its body `n` times, with `i`
counting from zero. `n` is a whole number, or a name declared as one
and never changed: `n: 72; repeat(n as i) { y: i / n; }`. The loop
ends early once every stop expression holds. Counts over 1024, nested
products over 65536 and invalid counts skip the block. `fill`,
`shape`, `size` and `grid` are not allowed inside it.

**Output.** `fill` is a CSS color, an expression, or a list whose
channels add up to three or four (`x / X, y / Y, .5`, `red, .5`). A
later `fill` paints over the earlier one, so an opaque one replaces it
and `fill: red, .5` tints it. After the body the cell is masked by
`shape`, a distance from the center antialiased at half of `size`:
`circle`, `square`, `diamond`, `none`, or an expression in `du` and
`dv`. Setting only `size` masks with a square.

**Variables** are the cell variables of `@match` except `z` and `Z`,
plus:

| Name       | Value                                                |
| ---------- | ---------------------------------------------------- |
| `du`, `dv` | position inside the cell, −0.5 to 0.5, `dv` downward |
| `uv`       | position in the whole pattern, 0 to 1, `uv.y` upward |
| `pos`      | centered and aspect-correct, `pos.y` upward          |
| `t`        | time in seconds; reading it animates the pattern     |
| `size`     | the current `size`, `1` until set                    |
| `px`       | one CSS pixel in `pos` units, so `2px` is two        |

Without `grid` the pattern is one cell, so `du`, `dv`, `uv` and `pos`
address every pixel. An animated pattern in `@content` draws each
frame straight to a canvas; elsewhere it is re-encoded as an image
every frame, several times slower.

**Functions.** GLSL, plus `pick(k: …)`, `ramp(t, stop, …)`, `rand(p)`,
`noise(p)`, `fbm(p)`, `voronoi(p)`, `hsl(h, s, l)`, `hsv(h, s, v)`,
`rot(p, a)`, `smin(a, b, k)`, `ngon(p, n)`, `box(p, b)`,
`segment(p, a, b)`, `arc(p, r, a, b)`, `escape([z,] c)`, `spiral(p)`
and `dither(p)`. A
point is one `vec2` or two floats: `fbm(p)`, `ngon(p, 6)`.

- `rot(p, a)` is the point `p` turned `a` radians counterclockwise. It
  gives a point, not a matrix, so `rot(a) * p` does not compile.
- GLSL's `pow` is undefined for a negative base, so whole exponents
  from 2 to 4 multiply instead.
- `escape` runs 96 steps with a bailout radius of 16.
- `box(p, b)` is the signed distance to a box of half size `b`, a
  `vec2` or one float; `segment(p, a, b)` is the distance to the
  segment from `a` to `b`.
- `arc(p, r, a, b)` is the distance to the arc of radius `r` about the
  origin between the angles `a` and `b`, in radians counterclockwise;
  a span of 2π or more is the whole circle. `shape(arc(p, r, a, b), w)`
  is a stroke of width `w` with round ends.
- `shape(d, size)` is the mask that `shape: d; size: size` would
  apply, 1 inside and 0 outside, for layering:
  `fill: mix(bg, red, shape(d, .6))`. `shape(abs(d), w)` is a stroke
  of width `w` along `d = 0`.
- `rand()` without arguments is a number from 0 to 1 that holds for the
  cell and the `repeat` step and differs at each place it is written:
  `w: mix(.3, .5, rand())`.
- `rand`, `noise`, `fbm` and `voronoi` follow the doodle's seed, so
  another seed gives another pattern.
- `ramp(t, stop, …)` maps `t` onto stops written as in a CSS gradient,
  a color or number, then an optional number position after a space
  (`#f80 .5`). The value holds below the first stop and above the
  last. The first position defaults to 0 and the last to 1, missing
  ones spread evenly, and a position never goes back; a repeated
  position is a hard edge, antialiased over a pixel:
  `fill: ramp(dr, #f99a53 .28, #006b50 .28, #00055f .83)`.
**Textures.** A top-level `texture…` block holds a doodle rendered at
the pattern's size. It sees the cell's custom properties, its own
declarations winning, and a body of only `$name` draws the doodle
stored in `--name: @doodle(…)`. The last block of a name wins.
`texture(name, p)` samples it at `p` from 0 to 1 as a `vec4`, wrapping
past the edges; `texture(texture_0, uv)` draws it unchanged. The doodle
may have a `@pattern` of its own as a background, drawn once as a still
image with 8 bits a channel: a field worked out once and read many
times, such as a color read at each stroke's center or a height read at
neighboring points for a slope.

```css
@pattern(
  texture_0 { background: linear-gradient(@r(360deg), @stripe(red, gold)); }
  r: length(pos);
  s: 3atan(pos.y, pos.x) + 8log(r) - 2t;
  fill: texture(texture_0, .5 + r * vec2(cos(s), sin(s)));
)
```

**User functions**, `--name(params): body`, work on values in
`@pattern` and `@scene`. Each argument is one value: one that is not a
name, a number or a color is parenthesized, so with `--f(a): a * 2`,
`$f(x + 1)` reads `(x + 1) * 2`. A body of one expression is one value
too: with `--g(a): a + 1`, `$g(x) * 2` reads `(x + 1) * 2`. A parameter reads bare, `p` as `$p`,
and `p.xy` takes its swizzle; it hides a built-in of its name. It stays
as written where it is called, `p(…)`, assigned, or named by a
`repeat` loop, and in a `texture` block's CSS. A body that assigns
`result` gives a value:

```css
--noise2(p): {
  i: floor(p);
  f: fract(p);
  result: mix(rand(i), rand(i + vec2(1, 0)), f.x);
};
@content: @pattern(fill: $noise2(uv * 8) * $noise2(uv * 3););
```

Its statements run before the statement that calls it, and the call
reads as the last `result` assigned, inside a `match` too. `@scene`
has no blocks, so there a `match` block in such a body runs as values:
a name its arm assigns keeps its old value where the arm does not run. Its
parameters, the names it assigns and its `repeat` loop names are its
own for each call, so its `i` leaves the pattern's `i` alone; a name
reads the caller's until it is first assigned. An argument other than
a name, a number or a color is worked out once, first. `p: p * 2`
changes the copy, and `$p: value` writes the variable passed for `p`,
the way to give back more than one value. Such a call cannot stand in
a `repeat()` head or a `match` arm test. A body without `result` runs
where it is called and writes the caller's names, as its text would.

## 4. Shaders

A `texture…` section holds a doodle rendered to an image and bound as
the sampler of that name; like `@doodle(…)`, it sees the cell's custom
properties. The fragment is compiled with `precision highp float`
unless it declares its own. `pos` is centered and aspect-correct: the
canvas's short axis is −0.5 to 0.5, and `pos.y` is upward.

As in `@pattern`, `$name` inserts a custom property's text:
`--fragment: @raw(...)` can hold GLSL, `--speed: @r(1, 3)` can feed an
expression, and a section of only `$name` draws the doodle stored in
`--name: @doodle(...)`.
