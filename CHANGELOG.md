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
