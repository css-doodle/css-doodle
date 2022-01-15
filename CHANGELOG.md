## 0.24.0

### Changes

* Removed `@min-size`, `@max-size`, `@path()`, `nrand()`, and `@reflect()` since I never used them.
* Removed the feature of registering typed custom properties automatically, which was used for animation.
* Renamed `place-cell` to `offset` in favor of shorter name.

### Features

* Added Perlin noise function `@rn()` and `@noise()`.
  ```css
  /* similar to @r() function */
  scale: @rn(0, 1);
  rotate: @rn(360deg);
  ```

* Added support for `direction` inside `@plot()` function.
  Each element will rotate towards the curve direction or with custom angles.
  ```csss
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
