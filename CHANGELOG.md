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
