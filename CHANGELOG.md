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


## 0.3.2

### Fixes

* Fix parse error

### Features
* Add experimental `@svg()` function to use svg as background


## 0.3.1

### Fixes

* Fix bug in @size()
* Fix type error in @calc()
* Support more CSS units
* Fix bug on reset

### Features
* Support `left/right`, `top/bottom` keywords for `@place-cell`


## 0.3.0

### Fixes

* Fix duplicate rule for `nth-of-type(1)`
* Remove `eval()` for Math functions

### Features

* Add `@use` property and `use` attribute
