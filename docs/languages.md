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
`content: text` adds a text node, and `style: { … }` and
`style fill: red` add to the `style` attribute. SVG 1.1 `xlink:` and
`xml:` attributes are supported. `viewBox` takes four numbers, one
(`0 0 n n`) or two (`0 0 w h`), and `padding n` grows it. A name XML
can't hold, such as `@seed`, is dropped.

**Copies.** `*count` repeats an element like `@M(count, …)`, by a
number, a grid (`2x3`) or a range (`1-3`). Inside, `@n` is the
sequence value, plus `@nx` and `@ny` for a grid, and `$(…)` reads
them bare: `circle*3 { r: $(n * 2) }`.

**Variables.** `--name: value` sets a variable where it stands, once
per copy inside a `*count`: a read after it sees the value, one before
it the doodle's own. Blocks don't scope it, and the latest value wins:
`circle*3 { --i: @n; r: $(i * 2) }` gives radii 2, 4 and 6.

**`@match(test) { … }`** keeps its body only where the test holds: its
elements go where the block stands, and its declarations set the
attributes of the element around it. The test reads like `$(…)`. A
body left out is skipped, so its functions and `--name` declarations
do not run. As a value, `fill: @match(t, a, b)` is still the function.

**Block values** get a generated id and read as `url(#id)`, or `#id`
for `href`. Gradients, `pattern`, `filter`, `clipPath`, `mask`,
`marker` and `symbol` go into `<defs>` with or without a `defs`
prefix.

**Stops.** `stops: #dfe5d3, #f0ebd2 .22, #7f8f4c` adds a `<stop>` for
each color, with the number after it as the offset, placed as
[`ramp()`](#3-patterns) places its stops: `fill: linearGradient { x2: 0;
y2: 1; stops: … }`. A `transparent` stop fades the colors beside it,
as in CSS, not through black.

**Groups.** A block named `union`, `subtract`, `intersect` or `exclude`
joins its shapes (`path`, `polygon`, `polyline`, `circle`, `ellipse`,
`rect`, and a `g` as their union) into one `path` with its attributes,
as the [groups](#2-shapes) of `@shape` do. `smooth: r` rounds the
corners where shapes meet, `round: r` then every corner, `grow: d`
moves the outline out by `d`, or in when negative, and `frame: w`
keeps a band `w` wide inside it. Each shape's own transform, paint and animations
are dropped.

**Animation.** `animate r: 1; 5 / 2s ease-in-out infinite` adds an
`<animate>`: values before `/`, where a single value animates `to` it,
and timing after, read like the CSS `animation` shorthand.
`animate transform: rotate 0; 90` makes an `<animateTransform>` whose
first word is the `type`. `draw: 2s` strokes a shape along its length.
Other timing words are dropped and reported:

| Timing word                    | Becomes                                 |
| ------------------------------ | --------------------------------------- |
| first time, second time        | `dur`, `begin`                          |
| a number beside a duration     | `repeatCount`; without one, it is `dur` |
| `infinite`                     | `repeatCount="indefinite"`              |
| easing keyword, `cubic-bezier` | `keySplines`; `linear` is the default   |
| `forwards`                     | `fill="freeze"`                         |

**`@svg-filter`** builds a filter from short commands. Inside `@svg`
it is a block value, `filter: @svg-filter(blur: 4)`, and works in
Safari, which ignores CSS `filter: blur(4px)` on SVG elements.

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
  any other attribute or a block starts a new group. `scale` displaces
  the nearest earlier primitive, or `SourceGraphic` if there is none.
  `scale`, `octave`
  or `seed` without `frequency` is dropped and reported.
- **`region`** is `x [y] / width [height]`. One percentage grows every
  side: `20%` is `-20% -20% / 140% 140%`, the default once any command
  is used. `x`, `y`, `width` and `height` attributes override their
  part.
- **`channels { … }`** becomes an `feColorMatrix`. Each output channel
  that changes, `r`, `g`, `b` or `a`, is an `an+b` sum of input
  channels and constants, such as `g - .5r` or `2b + .2`. All read the
  original input, so `r: b; b: r` swaps red and blue. Anything else is
  reported and leaves the channel unchanged.
- **Legacy forms**, `@svg-filter(.003, 80, 10)` and `blur=5px`, keep
  the old graph, where displacement always reads `SourceGraphic`.

**`@arc(r: 40; from: 0; to: 120; at: 50 50)`** is the path data of
an arc, `L x y A …`, for `d:`. `r` is one or two radii and `at` the
center. The short form lists the radii and center, then the angles:
`@arc(40 at 50 50, 0 to 120)`; `to 90` alone starts at `0`, and no
angles at all is a full circle. Angles are degrees clockwise from
three o'clock, as in SVG's `rotate()`, and accept `deg`, `rad`, `grad`
and `turn`; `from` defaults to `0`, `to` to `360`, and a full turn or
more draws the whole circle. The arc continues the current path; at
the start of `d:` or `path()`, or after a bare `M`, its first `L`
becomes an `M`. So `@arc(…) L 0 0 Z` is a pie slice, and
`@arc(…) M @arc(…)` two separate arcs.

## 2. Shapes

`@shape` draws 2D outlines for `clip-path` or `@svg`, and `@plot`,
`@tile` and `@svg-polygon` read the same body. `@scene` draws a 3D
model as an image.

|            | `@shape`                                                                 | `@scene`                                                                 |
|------------|--------------------------------------------------------------------------|--------------------------------------------------------------------------|
| Shapes     | the presets, `circle`, `square`, `star 6 .3`, `heart`, …; `shape` with `r`, `x`, `y`, `t` and `points`; `polygon { points: x y, … }`; a body in parentheses | `sphere { r }`, `ellipsoid { r: x y z }`, `box { size }`, `cylinder { r; height }`, `cone { r: r1 r2; height }`, `torus { r: R r }`, `capsule { from; to; r }`, `polygon { points; depth }` or `polygon { body; depth }`, `lathe { points }` or `lathe { body }`, `plane`, `sdf { d }` |
| Steps      | `move: x y`, `rotate`, `scale: x [y]`, `mirror`, `grow`, `frame`         | the same in 3D, `rotate: [axis] angle`, and `repeat`, `twist`            |
| Attributes | `round`, `smooth`, `fill-rule`, `unit`, `direction`, `seed`, `turn`      | `round` on `box`, `cylinder` and `polygon`, `smooth`, `fill`             |
| Groups     | `union`, `subtract`, `intersect`, `exclude`                              | `union`, `subtract`, `intersect`                                         |
| Space      | lengths in units where the box is 2 across, `0 0` at its center         | the camera fits the model, so only its proportions matter               |

**Rows** are commands, attributes of their shape, or, for any other
name, variables that the rows and shapes of their block read:
`k: .3; sphere { r: k }`. Unknown shapes and `#id`s are reported, and
so are names nothing in the doodle reads, such as a misspelled
attribute.

**Steps**, `move`, `rotate`, `scale`, `mirror`, `grow` and `frame`, run
in the order written, and one written twice runs twice:
`scale: .5; move: .5 0` halves the shape, then moves it a quarter of
the box right, and a `rotate` after `move` turns it around the
center. A preset's own steps come first. Other rows are
attributes; the last one wins. `y` points up, and `rotate` turns
counterclockwise in degrees (`.25turn` is 90), but a call such as
`sin(90deg)` takes radians. `mirror: x y` keeps the shape and its
reflections across those axes as one shape. A `-` before a name
negates each part of its value, and only the angle of a `rotate`:
`-move: .5 0`, `-rotate: y 30`; not on `fill` or `fill-rule`.

**Groups.** `union`, `subtract` and `intersect` join whole shapes;
`subtract` takes the rest from the first, so
`subtract { circle; circle { scale: .9; move: .45 .135 } }` is a
crescent. `exclude` keeps what an odd number of the shapes cover
(not in `@scene`, where it would look like `union`). `smooth: r` rounds every place two shapes meet with a
curve of radius `r`. A group's own rows apply to the joined shapes.

**Names.** `name#id` keeps a shape or group for later instead of
drawing it; `#id` draws it with the rows given there added, an
attribute replacing its own and a command running after its own:
`circle#hole { scale: .2 } subtract { circle; #hole { move: .5 0 } }`.
A name may be used before it is given, and the last one given wins.

**Copies.** `name*N` or `name*XxY` repeats a shape or group. Each copy
sees `n` from 1, `N`, and `nx`, `ny` across the grid, and runs its `@`
functions anew: `circle*6 { scale: .2; move: 0 -.6; rotate: n * 60 }`
rings the center.

**Text and paths.** A `text:` row is its text, traced in the browser,
as the outline, in the `font:` style, weight and family:
`@plot.hex(text: A; font: 900 serif)`. A `path:` row is SVG path data
as the outline: `@shape(path: M12 2 L22 22 H2 Z)`. Both are fitted to
the box by their ink, except in a `lathe`, where a path keeps its own
`x = 0` as the axis and text starts at it.

### @shape

The `@shape:` directive takes a preset name and emits
`clip-path: polygon(…)`. The `@shape(…)` function takes a preset or a
body, where a bare name at the top is the preset:
`@shape(heart; scale: .5)`.

**Outlines.** `r`, `x` and `y` are expressions in the angle `t` (in
`@scene` and `@pattern`, `t` is the time), evaluated at `points` points around the circle: by default 180 if they
read `t`, else 3. They also see the point index `i` from 1,
`seq(a, b, …)`, which cycles through its arguments point by point, and
`range(a, b)`, which runs from `a` to `b` across the shape. `points`
may instead list the corners as `x y` pairs:
`points: 0 1, 1 -1, -1 -1` is a triangle, as is `polygon { points: … }`.

**Values.** `points`, `rotate`, `round`, `frame`, `turn` and each part
of `move` and `scale` read like variables: a unit drops (`20px` is 20)
and `points: 4n` is worked out, the fraction cut off.

**Contour lists.** A `,` in `points`, `r`, `t`, `x`, `y`, `rotate` or
`grow` draws one contour per item, the way `background` takes layers:
shorter lists repeat, `t` and `i` restart in each contour, and
`points: 0` leaves one out. Under `fill-rule: evenodd` inner contours
cut holes, so `points: 120, 60; r: 1, .5` is a ring. `frame` and `grow`
treat each contour as a shape of its own.

**Stored bodies.** A body in parentheses reads as commands, so one
kept in a custom property is reused with `$name`: given
`--gear: (points: 4n; r: 1, .5)`, `@shape($gear; n: 6)` adds to or
overrides it, in `@plot`, `@tile` and `@svg-polygon` too.

**Group outlines** are cut where they cross, so a cut that reaches
past the shape leaves nothing there, where `fill-rule: evenodd` would
fill. A body with a group draws only the group, not its own `r`, `x`,
`y`, `t` or preset. `points` at the top then spreads that many points
over the outlines by length, a list giving each outline its own count,
so groups with the same counts morph in `@keyframes`; without it the
count follows the cuts.

**`round`, `grow`, `frame`.** `round: r` turns every corner into a
curve of radius `r` as far as the sides allow, before the steps run.
`grow: d` pushes the outline out by `d` and `frame: w` keeps a band
`w` wide inside it, both exactly, on the shape as it is at that step:
corners the outline turns away from come out round, and a group's
holes shrink as it grows. A frame's inner outlines take as many points
as the outline, so frames of different widths morph in `@keyframes`.
`grow` may also be an expression in `t`, which then runs from 0 to 2π
by length along the outline; the ends are made to meet, each point
moves along the normal, and sharp corners come out beveled.

**`@plot` and `@tile`.** `@plot` spreads its cells along the outline,
over the contours by length, and reads only the points, ignoring
`fill-rule`, `frame`, `round` and `grow`. `@tile`, `@plot.scatter`,
`@plot.hex`, `@plot.grid` and `@plot.penrose` fill the region, holes
included.

**Inside `@svg`** `@shape` and `@tile` give plain numbers in the
shape's own units, the box 2 across with `0 0` at its center, but `y`
down as in SVG, so the outline looks as it does in `clip-path`; `unit`
and the doodle's aspect are ignored. `@shape` gives path data, one
subpath per outline (`fill-rule: evenodd` cuts the holes), which
`points:` also takes. A copy of an element gets the next piece of
`@tile` as path data, with `@tile.xy` its center. `@plot` keeps its
percent; `@Plot` gives the next point as plain `x y` in the same box,
as in `circle*3 { cx, cy: @Plot(r: .5) }`, but with `points:` every
copy gets the whole list. Place them with `viewBox: -1 -1 2 2` or a
`transform`.

**Noise.** `@R.t(from, to)` writes a closed noise curve in `t` for one
cell, as in `r: @R.t(.8, 1)`, following the doodle's seed or the
`seed` command.

### Tiles

`@tile(…)` and the filling `@plot` variants read the body as the
region to fill (`square` by default for `@tile`), along with these
commands. Here `points` counts what comes out, not the corners.

| Command         | Kinds                                   | Value                                                          |
|-----------------|-----------------------------------------|----------------------------------------------------------------|
| `points`        | all                                     | at most this many pieces, or points for `delaunay`; a `@plot` variant returns its points as one list |
| `seed`          | all                                     | the seed, the doodle's by default                              |
| `aspect`        | all                                     | the element's width over its height, `2` or `16 / 9`           |
| `gap`           | all but scatter                         | space between pieces, in percent of the element                |
| `density`       | `slice`, `voronoi`, `delaunay`, scatter | where pieces are smaller, an expression in `x`, `y` and `d`    |
| `relax`         | `voronoi`, `delaunay`, scatter          | rounds that even out the points, 0 to 50, default 10           |
| `spread`        | `slice`                                 | how far a cut may tilt, in degrees                             |
| `bound`         | `voronoi` without `op` or `star`        | `box`, the default, lets the pieces fill the box; `shape` cuts them at the region's outline before `gap` and `round` |
| `round`         | all but `circle` and scatter            | corner radius, in the units where the box is 2 across          |
| `jitter`        | `grid`, `hex`, `triangle`, `cube`, `penrose` | moves each corner by up to that part of a piece           |
| `shift`         | `grid`                                  | `a [b]`, slides every other row by `a`, or column by `b`       |
| `edge`, `slide` | `grid`, `hex`, `triangle`               | bend each edge across and along itself, expressions in `t`, `e`, `x`, `y` and `random()`; `edge` is ignored with `op` or `star` |
| `pair`          | `grid` without `shift`, `hex`           | `turn` pairs edges by a turn about a corner, so every piece is one shape turned by its kind |
| `op`            | `grid`, `hex`, `triangle`, `cube`, `penrose`, `voronoi` | Conway's operators, one letter per step, right to left: `d a t k e b s`, and `g j m o` for `ds da kda de`; up to five steps |
| `star`          | the same as `op`                        | after `op`, turns every piece into a Hankin star: lines leave each side's middle at this angle, 0 to 90 degrees |
| `size`          | `circle`                                | the largest radius where a circle is centered, in average radii, an expression in `x`, `y` and `d`; by default 1.5 with a rare few larger |

In `density` and `size`, `d` is how far the point is from the region's
outline, holes included, where 1 is half the element's shorter side:
`size: .2 + d * 6` packs small circles against the outline. A variable
named `d` in the body takes its place.

The kinds, chosen as a variant like `@tile.hex(…)`, are `slice` (the
default), `voronoi`, `delaunay`, `grid`, `hex`, `triangle`, `cube`,
`penrose` and `circle`. A cell with a piece reads its center as
`@tile.x` and `@tile.y`, or `@tile.xy` for `x y`, its kind as
`@tile.k`, and as `@tile.r` the radius of the largest circle about the
center that fits in the piece, in percent of the element's shorter
side. At the top level a rule may read these before the rule that
makes the piece. `@place: @tile.circle(…)` makes the piece and places
the cell at its center, hiding a cell without one. A piece that `op` or `star` makes from a piece keeps
its kind; pieces made at the corners take the next kind up, and those
made along the sides by `e`, `b` and `s` the one after. `d` makes
every piece kind 1.

`@plot.hex(…)`, `@plot.grid(…)` and `@plot.penrose(…)` give points,
one per cell like `@plot.scatter(…)`: the centers of that lattice's
pieces inside the region, clear of its outline, so a `k×k` grid in a
`square` lands on the cell centers. A cell past them gets no point,
and `@place` hides it. `jitter`, `shift`, `op` and `star` move the
points, `@plot.hex(…; op: d)` a honeycomb; `gap`, `round` and `edge`
change nothing. Penrose points are unevenly spaced, so they read best
with a few hundred cells.

### @scene

The model is raymarched in WebGL into an image, like `@pattern`, and
its values use the same math: `p` is the point in the shape's own
space, `t` the time in seconds, and `random()` differs from copy to
copy.

**Fill** is a color, or an expression in `p` that gives one. Shapes in
a group take its fill unless they have their own, and shapes joined
with `smooth` blend their colors. `fill` also sees `normal`, the
surface normal as the camera sees it (x right, y up, z toward the
camera), so `1 - normal.z` is bright at the edges.

**Shapes.** `round` keeps the outer size of a `box`, `cylinder` or
`polygon`, while `grow` makes any shape bigger. `repeat: x y z`
repeats it that far apart along each axis (0 for none), and
`twist: a` turns it `a` degrees per unit up `y`. `sdf { d: … }` takes
a distance written in `p`. `polygon` takes `points`, or a `@shape`
body as its outline, holes and all: `polygon { heart; depth: .2 }`.
Rows inside the body move the outline in 2D and the polygon's own rows
move it in 3D, except `points: n`, which resamples the outline.
`lathe` turns the right half of the same outline, where `x` is 0 or
more, around `y`: `lathe { vase }` is a vase. An outline reads the `n`
of its own polygon's or lathe's copies:
`lathe*3 { circle { r: .1n } }` gives three sizes.

**Camera.** At the top, `view: turn tilt` turns the camera around `y`
and tilts it, in degrees, and `perspective: d` sets its distance, 2 by
default or `none` for a parallel view. The camera fits the model, a
moving one over its first 2π seconds, so it holds still while the
model or view moves: `view: 30t` spins it in place. `zoom: k` then
scales the view about its center. `drag: turn tilt` lets the pointer
turn the view too, half a turn across the drawing's shorter side;
`drag: turn` only turns it. An animated or dragged scene draws best in
`@content`.

`eye: x y z` puts the camera at a point instead, facing `look: x y z`,
the origin by default, so it can stand inside the model. It does not
fit then: `perspective: d` is the lens, long at 2 and wide at .5, and
`view` turns the model in front of the camera. `eye` and `look` are in
the fitted camera's axes, as `light` and `normal` are.

**Light.** `light: x y z` points toward the light the way `normal`
does, so the light turns with the camera; it is `.6 .8 .5` by default.
A color after the direction tints it, and a number sets the strength
of a white one: `light: -1 1 .5 #ffe2b8`. A list adds lights, and
`light: none` leaves `fill` as the final color. `shadow: s`, from 0 to
1, darkens the light that shapes block, with soft edges, and the
places where shapes crowd each other. A second value is how wide the
light is, in degrees, 5.7 by default: `shadow: 1 .5` is the sun, and
`0` leaves hard edges.

`ambient: sky ground` is the light from all around: a surface facing
up gets `sky`, one facing down `ground`, so unlike `light` it stays
put when the camera tilts, and one value fades to a fifth of itself
facing down. It is `.3` by default; `ambient: 0` leaves only the
lights, and colors tint the shade: `ambient: #6b7a99 #3a2a1a`.

A fill that reads `light` lights itself: `light` is how much light
reaches the point, shadows included, from about .25 in full shade to 1
facing a white light, and the scene leaves that fill as it is.
`fill: #c3a066 * light` looks the same as `fill: #c3a066`, and
`fill: mix(#5e6472, #e9d8a6, floor(light * 4) / 4)` paints in four
steps. With `light: none` it reads 1.

## 3. Patterns

**Blocks.** A `match` block runs where its test holds. `match { … }`
holds arms, each a test and a body, and runs the first whose test
holds, or a last `else { … }` arm when none does. Blocks nest, each
with its own scope. In a value, `match(t1, v1, t2, v2, …, else)` gives
the value after the first test that holds.

**`repeat(n [as k] [, stop …])`** runs its body `n` times, with `k`
counting from zero, unlike `i` and `n` elsewhere. `n` is a whole
number, or a name declared as one and never changed:
`n: 72; repeat(n as k) { y: k / n; }`. The loop ends early once every
stop expression holds. Counts over 1024, nested products over 65536
and invalid counts skip the block. `shape`, `size` and `grid` are not
allowed inside it, and a `fill` inside it paints over the one from the
step before.

**Output.** `fill` is a CSS color, an expression, or a list whose
channels add up to three or four (`x / X, y / Y, .5`, `red, .5`). A
later `fill` paints over the earlier one, so `fill: red, .5` tints it.
After the body the cell is masked by `shape`, a distance from the
center antialiased at half of `size`: `circle`, `square`, `diamond`,
`none`, or an expression in `du` and `dv`. Setting only `size` masks
with a square.

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
| `deg`, `turn` | one degree and one turn in radians, as in `@scene`: `rot(p, 45deg)` |

Without `grid` the pattern is one cell, so `du`, `dv`, `uv` and `pos`
address every pixel. An animated pattern in `@content` draws each
frame straight to a canvas; elsewhere it is re-encoded as an image
every frame, several times slower.

**Functions.** GLSL, plus `pick(k: …)`, `ramp(t, stop, …)`,
`random(p [, k])`, `noise(p)`, `fbm(p)`, `voronoi(p)`, `hsl(h, s, l)`,
`hsv(h, s, v)`, `rot(p, a)`, `smin(a, b, k)`, `ngon(p, n)`,
`box(p, b)`, `segment(p, a, b)`, `arc(p, r, a, b)`, `escape([z,] c)`,
`spiral(p)` and `dither(p)`. A point is one `vec2` or two floats:
`fbm(p)`, `ngon(p, 6)`.

- `hsl(h, s, l)` and `hsv(h, s, v)` take every channel from 0 to 1, the
  hue in turns: `hsl(.5, 1, .5)` is cyan. With `%`, as in
  `hsl(180 100% 50%)`, it is the CSS color, the hue in degrees.
- `rot(p, a)` is the point `p` turned `a` radians counterclockwise, a
  point, not a matrix.
- GLSL's `pow` is undefined for a negative base, so whole exponents
  from 2 to 4 multiply instead.
- `escape` runs 96 steps with a bailout radius of 16.
- `box(p, b)` is the signed distance to a box of half size `b`, a
  `vec2` or one float; `segment(p, a, b)` is the distance to the
  segment from `a` to `b`.
- `arc(p, r, a, b)` is the distance to the arc of radius `r` about the
  origin between the angles `a` and `b`, in radians counterclockwise;
  a span of 2π or more is the whole circle.
- `shape(d)` is the inside of a distance field, where `d < 0`,
  antialiased over a pixel: `fill: red, shape(length(pos) - .3)`.
  `shape(d, size)` is the mask that `shape: d; size: size` would
  apply, and `shape(abs(d), w)` is a stroke of width `w` along `d = 0`.
- `random()` is a number from 0 to 1 that holds for the cell and the
  `repeat` step and differs at each place it is written. `random(p, k)`
  is another number for the point `p` at each `k`, and `random(id + 1)`
  is the `random(id)` of the cell one step along both axes.
- `random`, `noise`, `fbm` and `voronoi` follow the doodle's seed.
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
past the edges. The doodle may have a `@pattern` of its own as a
background, drawn once as a still image with 8 bits a channel: a field
worked out once and read many times.

```css
@pattern(
  texture_0 { background: linear-gradient(@r(360deg), @stripe(red, gold)); }
  r: length(pos);
  s: 3atan(pos.y, pos.x) + 8log(r) - 2t;
  fill: texture(texture_0, .5 + r * vec2(cos(s), sin(s)));
)
```

**User functions**, `--name(params): body`, work on values in
`@pattern` and `@scene`. Each argument is one value, parenthesized
unless it is a name, a number or a color: with `--f(a): a * 2`,
`$f(x + 1)` reads `(x + 1) * 2`. A body of one expression is one value
too. A parameter reads bare, `p` as `$p`, and `p.xy` takes its
swizzle; it hides a built-in of its name. It stays as written where it
is called, `p(…)`, assigned, or named by a `repeat` loop, and in a
`texture` block's CSS. A body that assigns `result` gives a value:

```css
--noise2(p): {
  i: floor(p);
  f: fract(p);
  result: mix(random(i), random(i + vec2(1, 0)), f.x);
};
@content: @pattern(fill: $noise2(uv * 8) * $noise2(uv * 3););
```

Its statements run before the statement that calls it, and the call
reads as the last `result` assigned, inside a `match` too once it has
a value before the block. In `@scene`, which has no blocks, a `match`
block in such a body runs as values. Its parameters, assigned names
and `repeat` loop names are its own for each call, so its `i` leaves
the pattern's `i` alone; a name reads the caller's until it is first
assigned. An argument other than a name, a number or a color is worked
out once, first. `p: p * 2` changes the copy; the caller's names stay
as they were. `result: a, b` gives two values: `c, s: $cloud(p)` sets
`c` to the first and `s` to the second, and anywhere else the call
reads as the first.
Such a call cannot stand in a `repeat()` head or a `match` arm test. A
body without `result` runs where it is called and writes the caller's
names.

## 4. Shaders

A `texture…` section holds a doodle rendered to an image and bound as
the sampler of that name; like `@doodle(…)`, it sees the cell's custom
properties. The fragment is compiled with `precision highp float`
unless it declares its own. `pos` is centered and aspect-correct: the
canvas's short axis is −0.5 to 0.5, and `pos.y` is upward.

As in `@pattern`, `$name` inserts a custom property's text:
`--fragment: @raw(...)` can hold GLSL, and a section of only `$name`
draws the doodle stored in `--name: @doodle(...)`.
