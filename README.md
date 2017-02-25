# css-doodle (wip)

A web component for drawing patterns with css.

![circles](screenshot/circles.png)

## Example

include [css-doodle.js](css-doodle.js) in your html:

```html
<script src="./css-doodle.js"></script>
```

drawing the above circles with css:

```html
<css-doodle grid="6">
  :doodle {
    width: 50vh;
    height: 50vh;
    border-radius: 50%;
    overflow: hidden;
    background: #fafff1;
  }

  --size: @rand(200%);
  width: var(--size);
  height: var(--size);
  border-radius: 50%;
  background: hsla(
    @rand(360), 80%, 50%, @rand(.8)
  );
</css-doodle>
```

