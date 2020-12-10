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
