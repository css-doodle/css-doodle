## 0.42.4

* Add `part` attributes to support external styling outside of the component.
* Fix `stripe()` argument reading from other generator functions.
* Should build grid when there is content.
* Remove default container-type.
* Upgrade packages.

## 0.42.3

* Workaround for Safari to genenerate doodle background.
* Fix paring: treat `_` as symbol.
* Add support for symbol usage limits in value group parser.
* Generate the grid only when styles are applied to the cells.


## 0.42.2

* Fix fractional number in `ß` grid command.
* Fix grid parsing on spaces.
* Apply perspective to host element instead of container.


## 0.42.1

* Support `points` property inside `@plot` function.


## 0.42.0

* New `ß` symbol for for `grid` property to replace `border` keyword.
* Fix time uniforms in background so that `@t` can be used in `@doodle()` function.
* Fix variables resetting.
* Revert "Fix seed generation in nested doodle element", random seed should be generated for each doodle element.


## 0.41.0

* Add `@cell` selector to replace `@nth`, `@at`, `@match`, `@x`, `@y`, `@even`, and `@odd` in future.
* Ignore unrecognized values in `@grid`.


## 0.40.8

* Fix grid parsing.

## 0.40.7

* Fix token reading order.

## 0.40.6

* Add `create()` function to `css-doodle/component`.
* Add `render`, `update`, `beforeUpdate`, and `afterUpdate` custom events.

## 0.40.5

* No change.

## 0.40.4

* No change.

## 0.40.3

* Add `@Ii`, `@Xx`, `@Yy` and `@Nn`.
* Quick addition to support container hover selector.
* Use `background` instead of `background-color` for grid bg value.
* Return empty list for invalid iteration value.
* Remove cached value for plot function.
* Fix empty selector name.
* Fix returned plot points value.
* Fix undefined unit.
* Fix calc with `var()`.


## 0.40.2

* Fix css selector parsing.
* Fix animation name in root element.


## 0.40.1

* Fix export path.
* Improve unit handleing in calc chain.
* Improve noise implementation code.
* Set default degree unit form `*` command.

## 0.40.0

* Prevent hash and possible build error.
* Fix error in SSR.
* Fix bad variables.
* Switch to `exbuild`.
* Improve selector parsing to support media query.
* Add View Transition via `view-transition` attribute or `viewTransition` option in `update()`.
* Use native NodeJS test runner.
* Extend `*` command to support `hue-rotate()`.
* Add `@nd` in the context of `@m/@M`, similar to `@dx/@dy`.


## 0.39.2

* Fix seed generation in nested doodle element.
* Fix calc type in function arguments.
* Fix multiple `±` symbol detection.
* Set default rand end to 1.
* Experimenting with a gap shorthand to grid.


## 0.39.1

* Add new time uniform `@T`, which increases in `ms` and starts from beginning of the day.
* Add alias `R` for `@rn`.
* Add `@ts` and `@TS`.
* Simplify generated calc expressions.
* Simplify counter-reset.
* Restrict animation frame to 60fps.


## 0.39.0

* Use native `mod` function for variables.

      /* mod(@t, 360deg) */
      transform: rotate(@t(%360deg));

* Support calc chain.

      @content: @i(*2, +10, *100);

* Add `@PN` and `@PD` for outside bouding to `@doodle`.

      background: @m2.doodle(
        @grid: @PN(2x1, 3x1);
      );

* Enable uniform value debugging through `content`.

      :after {
        content: @ux;
      }

* Add grid `border[:color]` for debugging purposes.

      @grid: 1 / 100% border:red;

* Add support viewbox `padding` inside `@svg-polygon`.

      @content: @svg-polygon(
        paddng: .2;
      );

* Add `@xX` and `@yY` similar to `@iI`.
* Remove the feature of adding vendor prefixes to properties.


## 0.38.4

* Cleanup inline styles on update.
* Use `contain:strict` for css-doodle element.
* New export `css-doodle/component` for importng CSSDoodle class itself.
* Add `p3d` (preserve-3d) keyword for grid.

## 0.38.3

* Fix bad variable name.

## 0.38.2

* Fix reading pseudo selectors.
* Fix reading variables inside `@doodle`.
* Fix flex column variable name.
* Extend ∆ command to support `perspective-origin`.
* Add `@iI` and `@nN`.


## 0.38.1

* Fixed incorrect main/module/exports specified in package package.json (#120) By @zwtkito.
* Improved the initial and the generated styles.
* New experimantal commands for grid.
    `^`: similar to scale but it adjusts the canvas size instead of scale transform.
    `∆`: for container perspective.

## 0.38.0

* Update bundle format from `umd` to `iife`.
* Add `@x, @y` selectors.
* Add support for function inside `@keyframes` step names.
* Fix `@cycle()` grouping.
* Fix shader background resize.
* Improve calc speed inside `@nth`.
* Improve performance of `@once`.
* Optimize initial styles update when there's delay or animation.
* Remove `@canvas()` because I barely used it.
* Reduce preset-size list.
* Remove compatible fix for old Safari.


## 0.37.4

* Use self-closing tags for generated SVG elements.
* Flatten nested `defs` blocks and combine them into one.
* Fix curly braces in nested SVG elements.
* Fix id generation for inline SVG `defs` elements.

<br /> <br />


## 0.37.3

* Fix build.

<br /> <br />


## 0.37.2

* Fix viewBox padding calculation.
* Fix CSS parser to read % as an unit value for expressions like `$%(10)`.
* Change `@unicode` to `@code` internally.

<br /> <br />



## 0.37.1

* Fix variable orders inside `@svg()`.
* Fix variable context.

<br /> <br />


## 0.37.0

### Features

* New `$` function for reading and evaluating numeric variables.

  ```css
  --a: 2;
  --b: $(a * 2);

  --c: $b;

  /* 30px */
  --d: $px(10 + 20);
  ```

* Add repeatCount to `draw`

  ```css
  draw: 10s indefinite;
  draw: 10s infinite;
  ```

* Variables can be put directly inside `@svg()` now.

  ```css
  @content: @svg(
    --size: 10;

    viewBox: 0 0 $size $size;
  );
  ```
<br /> <br />



## 0.36.0

* Add `@hover` selector.

  ```css
  @hover {
    /* same as :hover */
  }

  @hover(-1, 1) {
    /* previous and next */
  }

  @hover(0 -1, 0 1) {
    /* left and right cells. Targeting by `dx dy`.
  }
  ```

* Round the values generated by '@shape' to a maximum of six decimal places."

<br /> <br />



## 0.35.1

* Support nested css-doodle element via `@content: @doodle()`.

  ```css
  @grid: 2 / 400px;
  @content: @doodle(
    @grid: 2 / 100%;
    background: @p(red, blue);
  );
  ```

* Add path animation with property `draw` in nomral SVG element.

  ```css
  @conent: @svg(
    path {
      d: '..';
      draw: 5s;
    }
  )
  ```

* Change property `animate` to `draw` inside `@svg-polygon`.
* Change default `@svg-polygon` stroke color to `currentColor`.
* Fix sequence generator index.
* Fix negative calculation in generator functions.


## 0.35.0

* Add `@svg-polygon()`.
* Add `@raw()` to choose format explicitly.
* Add `not` condition for selectors.
* Deprecate `@Svg()`, use `@svg()` instead.
* Decode uri format for `@content` property automatically.

<br /> <br />



## 0.34.11

* Fix rule breaks.

<br /> <br />



## 0.34.10

* Fix generated doodle image size.

<br /> <br />



## 0.34.9

* Fix `box-sizing` value for `:host`.
* Clone objects using `structuredClone`.
* Remove quotes around `content` values.
* Add shortcut `p` alias for `viewBox` padding.

<br /> <br />



## 0.34.8

* Cache tokens and fix cyclic references.
* Fix pseudo quotes.
* Fix SVG parser for special characters inside `content`.
* Ignore empty properties in pseudo.
* Clear innerHTML to avoid side effects.

<br /> <br />



## 0.34.7

* Add `svg.element()` to svg generator.
* Fix cycle detection in `calc()`.
* Fix backward compatibility for `@doodle()`.

<br /> <br />



## 0.34.6

* Fix `@n` value outside of `@m` function.
* Add unit calculation.
* Support negative value for dict in svg filter.
* Support custom angle in shapes builder.

<br /> <br />



## 0.34.5

* Support `viewBox` to `@doodle` function.
* Ignore space after `none` for content property.

<br /> <br />



## 0.34.4

* Fix perlin noise seed by using random offsets.
* Fix reading `#` symbol inside textures.
* Add support for translate command `~`.
* Improve noise function to support octave params.
* Improve `svg-filter` to add displacement only when the `scale` value is given.

<br /> <br />



## 0.34.3

* Fix CSS parsing on reading iterator
* Correctly set `animation-delay` on paused only.

<br /> <br />



## 0.34.2

* Change `cycle` shift direction to match the "reduced Latin square".
* Add experimental `once` function.
* Fix rading complex value in `cycle`.

<br /> <br />



## 0.34.1

* Fix gap property break and remove redundant styles.

<br /> <br />



## 0.34.0

### Breaking

* The css-doodle element now by default restricts the visible area to its dimension,
  which means it's overflow hidden. There are two ways to change this behavior:

  1. Append the <code>noclip</code> keyword to the `@grid` property:

     ```css
     @grid: 1 / 400px noclip;
     ```

  2. Overide the `contain` property:

     ```css
     :doodle {
       @grid: 1 / 400px;
       contain: none;
     }
     ```

### Features

  * Extended `@grid` to support doodle background color, after the second `/` symbol.

    ```css
    @grid: 1 / 400px / #000;
    ```

  * Extended `@grid` and `@size` to support <code>aspect-ratio</code> if one of the `width` and `width` is `auto`.

    ```css
    @grid: 1 / 400px auto 2;
    @grid: 1 / 400px auto (4/3);

    @size: 100px auto 1.5;
    ```

  * Extended `@grid` to support <code>rotate</code> and <code>scale</code> to <code>:container</code>.

    ```css
    @grid: 1 / 400px + 2;  /* + means scale */
    @grid: 1 / 400px * 45deg;  /* * means scale */

    @grid: 1 / 400px + 2 * 45deg;
    ```

 * Extended `@grid` to change the layout to `Flex` layout.

    ```css
    @grid: - 8x2 / 400px;  /* - means using flex */
    @grid: | 8x2 / 400px;  /* | means using flex and vertical direction */
    ```


 * Added support for 0 index value in `@m` function.

    ```css
    /* 0 1 2 3 4 */
    @content: @M0-4.n
    ```

 * Added `@gap` property.

   ```css
   @grid: 10 / 400px;
   @gap: 1px;
   ```

 * Added `@dx` and `@dy` functions.

   ```css
   /* -2,-2  -1,-2  0,-2  1,-2  2,-2
      -2,-1  -1,-1  0,-1  1,-1  2,-1
      -2,0   -1,0   0,0   1,0   2,0
      -2,1   -1,1   0,1   1,1   2,1
      -2,2   -1,2   0,2   1,2   2,2 */
   @grid: 5 / 400px;
   @content: @dx, @dy;
   ```
   Adjust offset.

   ```css
   /* -3,-3  -2,-3  -1,-3  0,-3  1,-3
      -3,-2  -2,-2  -1,-2  0,-2  1,-2
      -3,-1  -2,-1  -1,-1  0,-1  1,-1
      -3,0   -2,0   -1,0   0,0   1,0
      -3,1   -2,1   -1,1   0,1   1,1 */
   @grid: 5 / 400px;
   @content: @dx(1), @dy(1);
   ```


### Fixes

* Fixed CSS parsing on function composition.
* Fixed seed value at pre-compose phase.



<br /> <br />



## 0.33.1

* Fixed `@Svg` function detection for transforming the `multiplication` feature.
* Fixed `@pn` index value inside `@m` function.

<br /> <br />



## 0.33.0

* Added new `@svg-pattern` function to reduce boilerplate code.

  ```css
  background: @svg-pattern(
    width, height: 10%;
    viewBox: 0 0 10 10;
    circle { }
  );
  ```

* Added new `@Svg` function to return raw SVG code rather than encoded URI value.

  ```css
  @content: @Svg(
    viewBox: -1 -1 2 2;
    circle {
      r: 1;
    }
  );
  ```

* Added `padding` value for SVG `viewBox` property.

  ```css
  viewBox: -1 -1 2 2 padding 1;

  /* equals to */

  viewBox: -2 2 4 4;
  ```
<br /> <br />



## 0.32.2

* Do not use `??` operator at the moment.

<br /> <br />



## 0.32.1

* Build grid without DOM object.
* Fix CSS parser for reading tail function names.

<br /> <br />



## 0.32.0

### Features

* Add `@unicode` function to insert Unicode and it can be used both in HTML and CSS.

  ```css
  /* in HTML */
  @content: @unicode(0x2500);

  /* in CSS */
  :after {
    content: @unicode(0x2500);
  }
  ```

  A sequence of Unicode characters.

  ```css
  @content: @pn.unicode(0x2500, 0x257f, 0x2588);
  ```

* Add `@mirror/@Mirror` function to transform input items, simlar to `@cycle` and `@reverse`.

  ```css
  /* 1, 2, 3, 4, 5, 5, 4, 3, 2, 1 */
  @mirror(1, 2, 3, 4, 5);

  /* 1, 2, 3, 4, 5, 4, 3, 2, 1 */
  @Mirror(1, 2, 3, 4, 5);
  ```

* All index functions, `@i/I`, `@x/X`, `@y/Y`, and `@n/N/nx/ny` accept extra arguments to do calulations.

  ```css
  @i5 === @calc(@i + 5)

  @i(*10) === @calc(@i * 10)
  @i(-10) === @calc(@i - 10)
  @i(/10) === @calc(@i / 10)
  @i(%10) === @calc(@i % 10)

  @i(10/) === @calc(10 / @i)
  @i(10-) === @calc(10 - @i)
  ```

### Patches

* Reduce imports of the exported svg function.
* Improve `@cycle` to support comma-separated values.
* Fix grid build for `@content`.
* Fix parsing quotes in content.

  ```css
  /* There used to be bugs` */
  content: '");';
  ```

<br /> <br />




## 0.31.2

* Fix svg-extended style tag generation.

<br /> <br />



## 0.31.1

* Fix bad reverse function implementation.

<br /> <br />



## 0.31.0

* Add `@content` property for text content so that they can be selectable.
* The `@` symbol can be ommited if the functions are chained together.
* Patch reverse function to support both SVG path commands and general arguments.
* Skip variable properties for SVG generation.
* Fix style tag parsing inside SVG for complex CSS selectors.

<br /> <br />



## 0.30.10

* Add `@pnr` alias for `@pr`.

<br /> <br />



## 0.30.9

* Support variables in standalone SVG export function.
* Compute index instead of reversing the whole array.
* Use single rotate for inner `@place` transformation.
* Simplify image detection.
* Use `@pn` and `@position` as aliases.

<br /> <br />



## 0.30.8

Experimenting the new added `pr` function.

<br /> <br />



## 0.30.7

Experimenting the new added `cycle()` function.

<br /> <br />



## 0.30.6

I was wrong. Only set `background-size:100%` to `pattern`, `canvas`, and `shader`.

<br /> <br />



## 0.30.5

* Always add `background-size:100%` to background properties.

<br /> <br />



## 0.30.4

* Normalize quoted SVG attribute values.

<br /> <br />



## 0.30.3

* Do not break for decodeURI.
* Fix SVG generator on cutting values.

<br /> <br />



## 0.30.2

* Fix type error.

<br /> <br />



## 0.30.1

* Fix CSS and SVG parser on quotes and parens.
* Add range support for `@m` function.
  ```css
  ::after {
    /* 5 4 3 2 1 */
    content: @M5-1.@n;
  }
  ```

<br /> <br />



## 0.30.0

* Add exports.

  ```js
  import CSSDoodle from 'css-doodle';
  import { svg, shape } from 'css-doodle/generator';
  import { tokenizer } from 'css-doodle/parser';

  document.appendChild(CSSDoodle`
    @grid: 10 / 200px;
    background: @p(red, blue);
    margin: 1px;
  `);

  let code = svg(`
    viewBox: 0 0 10 10;
    circle {
      cx, cy, r: 5;
    }
  `);

  let polygon = shape(`
    points: 200;
    r: sin(t);
  `);

  let tokens = tokenizer.scan(`
    color: red
  `);
  ```

<br /> <br />



## 0.29.2

* Restore `Plot` function for unitless points.
* Allow spaces around `times` operator.
* Fix inline SVG element generator.

<br /> <br />



## 0.29.1

* Extend `use` attribute to support rules in pure string.
  ```html
  <css-doodle use="@grid: 5 / 200px"></css-doodle>
  ```

<br /> <br />



## 0.29.0

* Add Emmet-like syntax for generating SVG element.

  ```less
  line*10 {

  }
  ```

  Equals to

  ```less
  @M10(line {

  })
  ```

<br /> <br />



## 0.28.2

* Add `@place` alias for `@position`.
* Do not SVG group elements for empty id.
* Extend `@svg-filter` to add `blur`, `erode`, and `dilate` commands.

<br /> <br />



## 0.28.1

* Fix frequency variable name.
* Fix seed random inside `@doodle` function.
* Use seed for default svg filter seed.

<br /> <br />



## 0.28.0

* Reduce the default maximum grid size to `64x64`.
  It can be up to `256x256` if the `experimental` attribute is provided (#91)
* Support `title` and `desc` element (#92)
* Fix broken var inheritance (#94)
* Support named arguments for `@svg-filter` and `@rn` (#95)
* Support reading seed value from source code (#96)

<br /> <br />



## 0.27.4

* Put the `seed` argument at the end.

<br /> <br />



## 0.27.3

* Add shorthand for frequently used svg filter (#88)
* Skip empty group argument (#87)

<br /> <br />



## 0.27.2

* Add `t` variable to represent `u_time` in pattern (#85)
* Fix pattern function caused by missing CSS vars (#84)
* Simplify calc in random selector (#83)
* Group SVG elements with identical id (#82)
* Prevent duplicated calls by removing attribute reflection hook (#81)
* Add vec2 `u_seed` to shader (#80) by @akira-cn

<br /> <br />



## 0.27.1

* Add `pause/resume` to Shader and CSS animations. (#78)
* Use CSS variable for Shader background value. (#77)
* Clear Shader animations on `update` or `disconnected`. (#76)

<br /> <br />



## 0.27.0

### Features

* Add `u_time` uniform to `@shaders`. Now it supports animation in shaders. (#70)
* Add support for shader syntax compatible with shadertoy (#73)
* Increase grid size up to `256x256`. (#73)

### Fixes

* Fix Math expression in `r` property caused by wrong unit detection. (#72)

<br /> <br />



## 0.26.4

* Renamed `@offset` to `@position`.
* Fixed missing output extra value.

<br /> <br />



## 0.26.3

### Fixes

* Do not expose error for empty arguments.
* Return function name if it's not being registered.

<br /> <br />



## 0.26.2

### Fixes

* Fixed context value by adding signature for each sequence.
* Fixed SVG parsing on tail quotes of statement.
* Fixed SVG inline definition for `href` property.
* Added missing `textPath` as the text element.

<br /> <br />



## 0.26.1

### Fixes

* Fixed undefined `Expose`.
* Prevent error for incomplete code.

<br /> <br />



## 0.26.0

### Features

* Added `@P` (uppercase) function for picking a different value from last one.
* The `@p` function with no arguments will use the arguments from last `@p` function.

### Enhancement

* Set default width and height to `100%` for doodle background.
* Transform values with `Math.ceil` for sequence generators.

### Fixes

* Fixed tail semicolons for variables.
* Fixed context in nested sequence functions.
* Fixed arguments parsing to ignore last empty args.

<br /> <br />



## 0.25.2

### Enhancement

* Support reading CSS variables inside functions.

<br /> <br />



## 0.25.1

### Fixes

* Do not remove spaces around parens.
* Fix svg arguments transform.

<br /> <br />



## 0.25.0

### Fixes

* Fixed keyframes parsing error. (#54)
* Fixed comments inside pseudo elements. (#56, #57)

### Enhancement

* Don't break in SSR apps.
* Speeded up component initialization.

### Features

* Added support for inline SVG filters or gradients.
  ```css
  background: @svg(
    viewBox: -5 -5 10 10;
    circle {
      r: 4;
      fill: linearGradient {

      }
    }
  )
  ```

<br /> <br />



## 0.24.4

* Added `ux`, `uy`, `uw`, and `uh` uniform variables.
* Improved svg parsing.
* Added support for `tspan` and multiple text nodes.

<br /> <br />



## 0.24.3

* Improved `@svg()` function for style tags and inline styles.
* Improved `@svg()` function for expanding `id` to empty blocks.
* Fixed tests on Windows.

<br /> <br />



## 0.24.2

* Expand grouped value for the grouped properties.
* Added `index` variable to the the default shape context.

<br /> <br />



## 0.24.1

* Decreased the automatically registered animation frame to 100/sec.
* Removed the `cross` option for `even/odd` selector because it's now handled by default.
* Make `r` small enough when it equels to 0.

<br /> <br />



## 0.24.0

### Changes

* Removed `@min-size`, `@max-size`, `@path()`, `nrand()`, and `@reflect()` since I never used them.
* Removed the feature of registering typed custom properties automatically, which was used for animation.
* Renamed `place-cell` to `offset` in favor of a shorter name.

### Features

* Added Perlin noise function `@rn()` and `@noise()`.
  ```css
  /* similar to @r() function */
  scale: @rn(0, 1);
  rotate: @rn(360deg);
  ```

* Added support for `direction` inside `@plot()` function.
  Each element will rotate towards the curve direction or with custom angles.
  ```css
  @offset: @plot(
    /* the syntax is similar to offset-rotate */
    direction: auto 90deg;
  );
  ```

* Added support for `unit` inside `@plot()` function.
  Now the `box-shadow` value can be plotted.
  ```css
  box-shadow: @m10(
    @plot(r: 10, unit: em) 0 0 #000
  );
  ```
  Or simply put the unit at the end of `r`.
  ```css
  box-shadow: @m10(
    @plot(r: 10em) 0 0 #000
  );
  ```

<br /> <br />



## 0.23.1

* Fixed `index` calculation in `@pattern`.
* Added `I` for `@pattern`.
* Removed useless dependencies.

<br /> <br />



## 0.23.0

* Added `@pattern` function for pixel patterns drawing.
  ```css
  background: @pattern(
    grid: 72;
    match((int(x+y)%2) == 0) {
      fill: #000;
    }
  )
  ```
<br /> <br />



## 0.22.0

* Now use WebGL2 and GLSL3.0 for shader programs.
* Added `@paint` function for quick CSS painting API experiment.
  ```css
  background: @paint(
    paint(ctx, {width, height}) {
      let x = width / 2;
      let y = height / 2;
      let r = Math.min(x, y);
      ctx.fillStyle = 'red';
      ctx.beginPath();
      ctx.arc(x, y, r, 0, 2 * Math.PI, false);
      ctx.fill();
    }
  );
  ```

  If the inner `paint` function is missing it will try to autocomplete the code.
  ```css
  background: @paint(
    let x = width / 2;
    let y = height / 2;
    let r = Math.min(x, y);
    ctx.fillStyle = 'red';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, 2 * Math.PI, false);
    ctx.fill();
  );
  ```
<br /> <br />



## 0.21.6

### Patches

* Fix css parsing on function composition.
* Fix entity issue for `update()`.
* Use seed random to replace `Math.random` inside `match()`.

<br /> <br />



## 0.21.5

### Patches

* Use name `plot()` for `point()`.

<br /> <br />



## 0.21.4

### Patches

* Add support for `scale` in two directions.
* Add support for negative `frame` value.
* Add `vertices` alias for `points`.
* Allow `scale` value to be 0.
* Fix `frame` calculation logic.

<br /> <br />



## 0.21.3

### Patches

  * Add support for left/right shift operator.
  * Increase the `frame` width based on `turn` value.

<br /> <br />



## 0.21.2

### Patches

  * Add the missing `&` operator computation.
  * Add context value `I` into `@match`.

<br /> <br />



## 0.21.1

### Enhancement

  * Add support for more Math notations:
    `&&`, `||`, `|`, `&`, `∧`, `∨`

### Fixes

  * Fix default context value.

<br /> <br />



## 0.21.0

### Features

  * Add the general `@match` selector.

    ```css
    /* match the first 5 elements */
    @match( i <= 5 ) {
      background: red;
    }

    /* other math calculations */
    @match( gcd(x, y) ≠ 1 ) {
      background: red;
    }
    ```

### Changes

  *  Use a shorter name `fill` for `fill-rule`.

<br /> <br />



## 0.20.2

### Patches

  * Fix `frame` calculation on graph transformations.

<br /> <br />



## 0.20.1

### Patches

  * Fix negative functions in `calc`.

<br /> <br />



## 0.20.0

### Features

  * Support left-handed negative commands or variables inside `shape` function.

    ```css
    clip-path: @shape(
      -x: cos(t) - .2
    );

    /* equals to */

    clip-path: @shape(
      x: -1 * (cos(t) - .2)
    );

    ```

  * Add `range` function within shape context so that it's easy to draw Math equations.

    ```css
    @grid: 11x1 / 200px;

    @place-cell: @point(
      x: range(-1, 1); /* -1, -.9, 0, ..., .9, 1 */
      y: x^2;
    );
    ```

### Breaking

  * Rename shape command `origin` to `move`.
  * Change shape function to respect Math coordinate system.

### Fixes

  * Fix calc function for heading negative variables.

<br /> <br />



## 0.19.2

### Enhancement to `svg` function

  * Add support for nested selectors shorthand.

    ```css
    g circle {

    }

    /* equals to */

    g {
      circle {

      }
    }
    ```
  * Resolve `id` property on selectors.

    ```css
    circle#my-circle {

    }

    /* equals to */

    circle {
      id: my-circle;
    }
    ```

  * Handle special properties in SVG.

    ```css
    use {
      xlink:href: #my-circle;
    }
    ```

  * Fix for semicolons as value separators.

    ```css
    animate {
      values: 50; 490; 350; 450;
      keyTimes: 0; 0.5; 0.8; 1;
    }
    ```
<br /> <br />



## 0.19.1

### Enhancement

  * Add another experimental `@reverse` function for svg paths.

### Fixes

  * Temporarily fix nagative number calculations.

<br /> <br />



## 0.19.0

### Features

  * Add `@canvas` for generating background with JS.

### Enhancement

  * Add flip/invert support for H and V commands.
  * Add lowercase `flipv` and `fliph` aliases.

### Changes

  * Change `offset` to `point` for a better name.

<br /> <br />



## 0.18.1

### Enhancement

  * Add `Offset` function for generating absolute values.

<br /> <br />



## 0.18.0

### Features

  * Add experimental `@flip` and `@revert` function for svg path

### Enhancement

  * Rewrite small parsers.

### Fixes

  * Fix args for composed functions

<br /> <br />



## 0.17.4

### Enhancement

  * Make `@n-` modifiable with extra argument.

<br /> <br />



## 0.17.3

### Enhancement

  * Add `turn` option for shape commands.

<br /> <br />



## 0.17.2

### Fixes

  * Fix bad variable for `@svg-filter`.
  * Fix extra arguments for sequence functions.

<br /> <br />



## 0.17.1

### Enhancement
  * Add support for group properties.
  * Add support for svg text node with `content` property.

### Fixes
  * Catch error on creating illegal SVG elements.

<br /> <br />



## 0.17.0

### Features
  * Add a new way to write SVG inside `@svg` function.

### Changes
  * Remove `contain: content`.

<br /> <br />



## 0.16.1

### Patch

* Fix SVG size in Safari.

<br /> <br />



## 0.16.0

### Features

* Add experimental `@reflect` and `@offset` functions.
* Set `aspect-ratio` for auto width/height grid.

### Changes

* Make `@rand` function starts from 0.
* Remove unused size presets.
* Remove/add new basic shapes.
* Add `points` alias for `split`.
* Set css-doodle element default to be `contain: content`.

### Fixes

* Fix build size to minimal.
* Fix blank canvas issue in shader.
* Catch error while WebGL is disabled.

<br /> <br />



## 0.15.3

### Enhancement

* Skip HTML tags inside rules.

<br /> <br />



## 0.15.2

### Fixes

* Don't use random seed for unique ids.

<br /> <br />



## 0.15.1

### Fixes

* Avoid error while charset is missing.
* Fix error in composition for empty functions.

<br /> <br />



## 0.15.0

### Features

* Add `@path` function for responsive path commands used by clip-path.
* Add `@rn` function for normalize distribution random. (Thanks @Plasmatium).

### Fixes

* Fix event binding and grid generation for empty block.

<br /> <br />



## 0.14.2

### Fixes

* Fix property register for `update()` method.
* Fix initial time uniform name.

<br /> <br />



## 0.14.1

### Fixes

* Fix uniform timing function.
* Prevent uniform animation from getting over-written inside.

<br /> <br />



## 0.14.0

### Features

* Add experimental time uniform via `@t`.

### Fixes

* Fix calc parsing.
* Keep fraction values for degree in `@shape()` function.
* Use empty string for empty `seq()` args for preventing side effects.

<br /> <br />



## 0.13.10

### Enhancement to `@shape` function

* Add seq() function for shape.
* Prevent empty shape commands.
* Recognize θ symbol.
* Do not evaluate `π` for compound expressions.

<br /> <br />



## 0.13.9

### Enhancement to `@shape` function

* Add support for function composition.

<br /> <br />



## 0.13.8

### Enhancement to `@shape` function

* Add support for comments inside `@shape` function.
* Increase max split to 3600.
* Replace rotate with degree to normalize all commands to nouns.
* Switch the action order of rotate and origin.
* Fix trailing semicolon.

<br /> <br />



## 0.13.7

### Enhancement to `@shape` function

* Add `frame` option for shape, like stroke.

<br /> <br />



## 0.13.6

### Enhancement to `@shape` function

* Fix the exponent operator precedence to highest.

<br /> <br />



## 0.13.5

### Enhancement to `@shape` function

* Fix cycle direction.
* Add origin commands for `@shape`.
* Support exponent operator in `@shape`.

<br /> <br />



## 0.13.4

### Enhancement to `@shape` function

* Fix reading undefined variables.
* Handle empty values for shape commands.
* Validate user input fill-rule value.

<br /> <br />



## 0.13.3

### Enhancement to `@shape` function

* Add polar equation support.
* Fix calc expand with variables.
* Make the polygon fill rule default to be `nonzero`.

<br /> <br />



## 0.13.2

### Fixes

* Fix default shader background-size.
* Fix promise not resolving correctly.
* Fix reading shaders from CSS variables.

### Enhancement

Add a `:host` display style that respects the `hidden` attribute.

<br /> <br />



## 0.13.1

### Features

* Remove conditional statements since terser will remove line breaks ( a quick fix).

<br /> <br />



## 0.13.0

### Features

* Add `@shaders` function for writing GLSL inside css-doodle.

<br /> <br />



## 0.12.2

### Fixes

* Fix issue when `@doodle` is part of function arguments.

<br /> <br />



## 0.12.1

### Fixes

* Prevent circular references inside `@shape` function.
* Normalize default values for `@shape` function.

<br /> <br />



## 0.12.0

### Features

* Add `@doodle` function to make css-doodle as backgrounds.
* Add custom shape via `@shape` function.

<br /> <br />



## 0.11.3

### Fixes

* Fix error when calling `@shape` function.

### Changes

* Respect to `devicePixelRatio` only when the given exporting scale value equals 1.

<br /> <br />



## 0.11.2

### Fixes

* Fix scale issue in Safari.
* Fix missing variables defined outside by applying all variables to the exported root element.

### Changes

* Remove custom warnings for overload resolution.

<br /> <br />



## 0.11.1

### Fixes

* Fix default scale for retina screen.
* Fix the size of the exported image for relative values.

### Changes

* Add `detail` option for export.
* No export `scale` for Safari.

<br /> <br />



## 0.11.0

### Features

* Add `export` API for saving css-doodle as an image.

<br /> <br />



## 0.10.0

### Features

* Add 2-dimensional traversal ability to `@m` function.
* Simplify function names by introducing capitalized names.
* Improve code generation speed.

### Fixes

* Fix '0' value in arguments not being included.

<br /> <br />



## 0.9.3

### Fixes

* Fix attribute update for seed number.

<br /> <br />



## 0.9.2

### Fixes

* Normalize the count of sequence generator so it's ok to use `@r` function in `@m` function.
* Replace all errors with warnings.

### Changes

* Add version to released files.

<br /> <br />



## 0.9.1

### Fixes

* Fix reading property names.

<br /> <br />



## 0.9.0

### Features

* Add seed number to css-doodle.
* Add cross options to even/odd functions.
* Automatically register properties by their names.

### Changes

* Make row/col respect to y/x.

<br /> <br />



## 0.8.5

### Fixes

* Fix blink on reinitialization.
* Fix the value of `@n` and `@M` with no context.

<br /> <br />



## 0.8.4

### Fixes

* Fix grid parsing.

### Changes

* Set default width/height to be `auto`.
* Export CSSDoodle as the module name for working with Observable.

<br /> <br />



## 0.8.2

### Features

* Support for function composition.
* Make arguments expandable.

### Fixes

* Fix Math function name like `ln10` and `SQRT2`.

<br /> <br />



## 0.8.1

### Features

* Add top-level grid definition.
* Add stripe() function for gradients.
* Make function arguments less error prone, e.g. trailing commas.

### Changes

* Increase the grid size up to 64x64.
* Use place-items instead of place-content for pseudo elements.

<br /> <br />



## 0.7.7

### Changes

* Modify the name shape `pear` to `drop` and add rotation.
* Limit size of the lp and lr to 20.

### Fixes

* Fix unexpectable bug in Chrome.

<br /> <br />



## 0.7.6

### Features

* Add max iteration count `@N`.
* Support last n value for `@lp()` and `@lr()`.

### Fixes

* Ignore null or undefined values.

<br /> <br />



## 0.7.5

### Features

* Add `π` symbol.
* Recongize function without parentheses.
* Add `rep` for `repeat` and several others for personal usage.

<br /> <br />



## 0.7.4

### Features

* Add shorthand for common standard paper sizes.

### Fixes

* Prevent duplicated definition when more than one css-doodle
  source being included in the page.

### Update

* Set all elements inside the component to be `border-box`.
* Use `place-content` insteaad of `flexbox` alignment.
* Add opencollective funding to package.


<br /> <br />


## 0.7.3

### Features

* Expand the '±' symbol to '-' and '+' in one place.

<br /> <br />


## 0.7.2

### Features

* Add `click-to-update` attribute for demo stuff.
* Add `@id()` function.

<br /> <br />


## 0.7.1

### Fixes
* Fix the nesting limit inside shadowDOM.

<br /> <br />


## 0.7.0

### Features
* Add `depth` dimension.
* Add alias for `row` and `col`.

### Fixes

* Fix typo for `multiple-with-space`.

### Changes

* The third dimension now based on `1x1`.
  That is to say, the `1x2x8` will not work, but `1x1x8` does.

* Deprecated the `@multi` alias.

<br /> <br />


## 0.6.2

### Features

* Add `@ms()` multiple values separated with space.
* Add support for dynamic functions with numeric parameters.


### Fixes

* Fix for `content: none`

<br /> <br />


## 0.6.1

### Features

* Add `@rand-int()`.

### Fixes

* Ignore empty composed values.
* Fix the missing varaible for dimension `z`.

<br /> <br />


## 0.6.0

### Features

* Experiment for new dimension z.

### Fixes

* Fix the clamped min value.

<br /> <br />



## 0.5.1

### Fixes

* Fix type error in `@rand()`.
* Fix the shuffle algorithm.
* Improve the behaviours of `@pd()` and `@pn()`.

<br /> <br />



## 0.5.0

### Features

* Support multiple arguments for `@nth()`, `@row()` and `@col()`.
* The range of `@rand()` is now unlimited.

### Changes

* Remove step value for `@rand()`.

### Fixes

* Fix native content values.

<br /> <br />



## 0.4.11

### Fixes

* Fix bug on attribute changing.

<br /> <br />


## 0.4.10

> DO NOT USE

<br /> <br />


## 0.4.9

### Fixes

* Fix coords reference.
* Fix pseudo content value with `var()`.
* Fix empty value for `@use()`.

<br /> <br />


## 0.4.8

### Fixes

* Support multitple pseudo selectors on one rule.
* Fix bug on multitple animation names.

<br /> <br />


## 0.4.7

### Fixes

* Fix parse error on keyframe names.
* Fix generated multiple animation names.
* Prevent error on empty or unknown shapes.

### Changes

* Don't throw JS errors.

<br /> <br />


## 0.4.6

### Fixes

* Fix the shuffle algorithm.

<br /> <br />


## 0.4.5

### Fixes

* Fix context bug for `@pick-d()`.
* Prevent scrollbars caused by `@place-cell()`.

### Features

* Automatically add vendor prefixes for properties.
* Automatically add quotes for pseudo-content.
* Support char range in `@pick` functions.
* Add experimental `@svg-filter()` function.

<br /> <br />


## 0.4.4

### Fixes

* Fix error in `@pick-d()`.
* Fix type error of units handling.

### Changes

* Rename `@max-row()` to `@size-row()` and `@max-col()` to `@size-col()`.
* Replace uglify-es with terser.

<br /> <br />


## 0.4.3

### Fixes

* Fix scientific notation in `@calc()`.

### Features

* `@nth()` now behaves like nth-child.
* Add `@pick-d()` function.
* Accept any unit.

<br /> <br />


## 0.4.2

### Fixes

* Fix errors in `@calc()`.
* Fix invalid `@n()`caused by the idx params.

### Changes

* Increase iterating limit for `@repeat()` and `@multiple()`.
* Make `:container` inherits all the grid properties from `:doodle` element.

<br /> <br />


## 0.4.1

### Fixes

* Fix parse error to read arguments.
* Fix context called by `@n()` and `@pick-by-turn()`.

### Changes
* Remove legacy functions and properties: `size()`, `min-size()`, `max-size()` and `@shape()`.

### Features

* Add aliases for frequently used functions.

<br /> <br />


## 0.4.0

### Fixes

* Fix parse error to support more dynamic value inside function parameters.
* Fix parse error related to @keyfames.

### Changes
* The second value of `@place-cell` is set to `50%` when it is missing.

### Features

* Add `@multiple()` function to easily compose values.
* Add `@pick-by-turn()` to pick a value one by one.
* Add `@last-pick()` and `last-rand()` to reference the last generated value.
* Add `@var()` to replace the use of `var()` inside the styles which passed to the `@use` property.

<br /> <br />


## 0.3.2

### Fixes

* Fix parse error

### Features
* Add experimental `@svg()` function to use svg as background

<br /> <br />


## 0.3.1

### Fixes

* Fix bug in @size()
* Fix type error in @calc()
* Support more CSS units
* Fix bug on reset

### Features
* Support `left/right`, `top/bottom` keywords for `@place-cell`

<br /> <br />


## 0.3.0

### Fixes

* Fix duplicate rule for `nth-of-type(1)`
* Remove `eval()` for Math functions

### Features

* Add `@use` property and `use` attribute
