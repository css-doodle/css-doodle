<a href="https://css-doodle.com/new/?code=%40grid%3A%201%20%2F%20100%25%3B%0A%40seed%3A%201757726655292%3B%0Abackground-size%3A%20cover%3B%0Abackground-image%3A%20%40doodle2000(%0A%20%20%20%20%40grid%3A%2028%20%2F%20100%25%20%5E1.4%20_8px%20%7C%20%40svg-filter(.016%2C%20500)%3B%0A%20%20%20%20background%3A%20oklab(%0A%20%20%20%20%20%20%20%20%40r(80%25%2C%20100%25)%0A%20%20%20%20%20%20%20%20%40rn(-50%25%2C%20100%25%2C%203)%0A%20%20%20%20%20%20%20%20%40rn(-100%25%2C%20100%25%2C%205)%0A%20%20%20%20)%3B%0A%20%20%20%20translate%3A%200%20calc(%40sin(%40dx)%20*%20100px)%3B%0A%20%20%20%20clip-path%3A%20%40p(%0A%20%20%20%20%20%20%20%20circle(50%25)%2C%0A%20%20%20%20%20%20%20%20polygon(50%25%200%2C%20100%25%20100%25%2C%200%20100%25)%2C%0A%20%20%20%20%20%20%20%20none%0A%20%20%20%20)%3B%0A%20%20%20%20%40keyframes%20blink%20%7B%0A%20%20%20%20%20%20%20%2096%25%20%7B%0A%20%20%20%20%20%20%20%20%20%20%20%20clip-path%3A%20polygon(-1%25%2050%25%2C%20101%25%2050%25%2C%20101%25%2050%25%2C%20-1%25%2050%25)%3B%0A%20%20%20%20%20%20%20%20%7D%0A%20%20%20%20%20%20%20%2094%25%2C%20100%25%20%7B%0A%20%20%20%20%20%20%20%20%20%20%20%20clip-path%3A%20polygon(-1%25%20-1%25%2C%20101%25%20-1%25%2C%20101%25%20101%25%2C%20-1%25%20101%25)%3B%0A%20%20%20%20%20%20%20%20%7D%0A%20%20%20%20%7D%0A%20%20%20%20%40random(.4)%20%7B%0A%20%20%20%20%20%20%20%20--s%3A%20-%40r(5s)%3B%0A%20%20%20%20%20%20%20%20--t%3A%20%40r(3s%2C%205s)%3B%0A%20%20%20%20%20%20%20%20%3A%3Abefore%2C%20%3A%3Aafter%20%7B%0A%20%20%20%20%20%20%20%20%20%20%20%20content%3A%20''%3B%0A%20%20%20%20%20%20%20%20%20%20%20%20%40size%3A%208%25%3B%0A%20%20%20%20%20%20%20%20%20%20%20%20aspect-ratio%3A%201%3B%0A%20%20%20%20%20%20%20%20%20%20%20%20%40place%3A%20%40pn(40%25%2C%2060%25)%2040%25%3B%0A%20%20%20%20%20%20%20%20%20%20%20%20border-radius%3A%2050%25%3B%0A%20%20%20%20%20%20%20%20%20%20%20%20background%3A%20%23000%3B%0A%20%20%20%20%20%20%20%20%20%20%20%20animation%3A%20blink%20var(--t)%20var(--s)%20ease-out%20infinite%3B%0A%20%20%20%20%20%20%20%20%7D%0A%20%20%20%20%7D%0A)%3B"><img src="docs/images/hero.png" alt="Rows of pastel circles, squares, and triangles with tiny eyes, drawn with css-doodle"></a>

<h1>css-doodle</h1>

<p> 
    A web component
    designed to explore the creative potential of <strong>CSS</strong>
    in a simple and expressive manner.
    It facilitates the creation of
    <strong>graphic patterns</strong>,
    <strong>visual backgrounds</strong>,
    <strong>handcrafted icons</strong>,
    and <strong>random decorations</strong>.
</p>

<p>
  <a href="https://www.npmjs.com/package/css-doodle"><img alt="npm" src="https://img.shields.io/npm/v/css-doodle?color=72bbf9&label=npm"></a>
  <a href="LICENSE"><img alt="MIT license" src="https://img.shields.io/github/license/css-doodle/css-doodle?color=7657ff"></a>
  <a href="https://opencollective.com/css-doodle"><img alt="Open Collective backers" src="https://img.shields.io/opencollective/backers/css-doodle?color=f2a6fa"></a>
</p>

<p>
  <a href="https://css-doodle.com">Website</a> ·
  <a href="https://css-doodle.com/getting-started/">Getting started</a> ·
  <a href="https://css-doodle.com/reference/">Reference</a> ·
  <a href="https://css-doodle.com/new/">Playground</a> ·
  <a href="https://css-doodle.com/discover/">Discover</a>
</p>

## Example 

```html
<css-doodle>
  @grid: 4 / 480px / blue +.75; 
  border-radius: @pn(100% 0, 0 100%, 50%);
  background: #fff;
</css-doodle>
```

<img width="300px" src="docs/images/start.png" alt="A 7 by 7 grid of quarter circles and circles in red, orange, and purple">

## Tools

* [Playground](https://css-doodle.com/new/): write and share doodles in the browser
* [Shapes](https://css-doodle.com/shapes/): discover new CSS polygon shapes
* [SVG playground](https://css-doodle.com/svg/): generate SVG code with the same syntax
* [cssd](https://github.com/css-doodle/cli): command-line preview and image/video export
* [Tabbied](https://tabbied.com): generated patterns for prints and wallpapers

## Articles

* [An Introduction to css-doodle](https://yuanchuan.dev/an-introduction-to-css-doodle), by Yuan Chuan
* [Arte generativo con CSS](https://www.youtube.com/watch?v=KKg6Uo1pVLU), by Sonia Ruiz
* [How to Draw Patterns with CSS Using CSS Doodle](https://webdesign.tutsplus.com/tutorials/how-to-draw-patterns-with-css-using-css-doodle--cms-33110), by Adi Purdila

## Development

```bash
npm install
npm test         # unit tests
npm run build    # css-doodle.min.js
```

`make` runs both.

## Support

css-doodle is free and MIT licensed. If it has been useful to you, consider
[backing it on Open Collective](https://opencollective.com/css-doodle). Thank you! 🙏

<a href="https://opencollective.com/css-doodle#backers" target="_blank"><img src="https://opencollective.com/css-doodle/backers.svg?width=890"></a>
<a href="https://opencollective.com/css-doodle#sponsors" target="_blank"><img src="https://opencollective.com/css-doodle/sponsors.svg?width=890"></a>
