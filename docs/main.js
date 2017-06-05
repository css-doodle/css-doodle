(function() {

  if (!window.customElements || !document.head.attachShadow) {
    document.body.className += 'oldie';
  }

  function removeSpaces(input) {
    return input.replace(/[\s\n\t]/g, '');
  }

  function indent(input) {
    var temp = input.replace(/^\n+/g, '');
    var len = temp.length - temp.replace(/^\s+/g, '').length;
    var result = input.split('\n').map(n => (
      n.replace(new RegExp(`^\\s{${len}}`, 'g'), '')
    ));
    return result.join('\n');
  }

  var examples = document.querySelectorAll('.example');
  [].forEach.call(examples, example => {
    var textarea = example.querySelector('textarea');
    if (textarea) {
      textarea.value = example.querySelector('.container').innerHTML;
    }
  });

  var codeBlocks = document.querySelectorAll('textarea[code]');
  [].forEach.call(codeBlocks, block => {
    var content = indent(block.value).trim();
    var sample = document.createElement('div');
    sample.className = 'code-sample';
    block.parentNode.replaceChild(sample, block);
    CodeMirror(sample, {
      mode: block.getAttribute('code') || 'css',
      value: content,
      readOnly: ('ontouchstart' in window) ? 'nocursor' : true,
      cursorBlinkRate: -1,
      theme: '3024-day',
      tabSize: 2
    });
  });

  var doodles = {
    'leaves': indent(`
      :doodle {
        clip-path: @shape(circle);
        background-color: #f6ffed;
      }

      transition: .2s ease @rand(.6s);

      will-change: transform;
      transform: scale(@rand(.25, 1.25));

      border-radius: @pick(
        100% 0, 0 100%
      );

      background: hsla(
        calc(5 * @index()), 70%, 60%,@rand(.8)
      );
    `),

    fish: indent(`
      :doodle {
        clip-path: @shape(pear);
        transform: rotate(90deg);
        background-image: linear-gradient(
          to left, #03a9f4,
          rgba(156, 39, 176, .02)
        );
      }

      clip-path: @shape(fish);
      transition: .24s ease;
      background: hsla(
        calc(190 + 2 * @index()),
        70%, 60%,@rand(.8)
      );
      transform:
        scale(@rand(.3, 2))
        rotate(-90deg)
        translate(
          @rand(-50%, 50%), @rand(-50%, 50%)
        );
    `),

    flames: indent(`
      clip-path: @shape(bicorn);

      background: hsla(
        calc(200 + 2 * @index()),
        70%, 60%,
        @rand(.8)
      );

      transform:
        rotate(@rand(360deg))
        scale(@rand(.5, 3))
        translate(
          @rand(-100%, 100%),
          @rand(-100%, 100%)
        );
    `)
  }

  var doodle = document.createElement('css-doodle');
  doodle.title = 'Click to update';
  doodle.grid = '7, 7';
  if (doodle.update) {
    doodle.update(doodles.leaves);
  }

  var playground = document.querySelector('.playground');
  var source = document.querySelector('.playground .source');

  var container = document.querySelector('.playground .doodle')
  container.appendChild(doodle);
  container.addEventListener('click', function(e) {
    e.preventDefault();
    if (!toggled() || container.hasAttribute('front')) {
      if (e.target.matches('css-doodle')) {
        doodle.refresh();
      }
    }
  });

  var config = {
    value: doodles.leaves,
    mode: 'css',
    insertSoftTab: true,
    theme: '3024-day',
    matchBrackets: true,
    smartIndent: true,
    tabSize: 2
  }

  var editor = CodeMirror(source, config);
  var old = removeSpaces(editor.getValue());
  editor.on('change', function(_, obj) {
    if (old != removeSpaces(editor.getValue())) {
      if (doodle.update) {
        doodle.update(editor.getValue());
      }
      old = removeSpaces(editor.getValue());
    }
  });

  document.querySelector('.docs').addEventListener('click', function(e) {
    if (e.target.matches('css-doodle.click-to-update')) {
      e.target.refresh();
    }
  });

  function toggled() {
    var front = playground.querySelector('[front]');
    return getComputedStyle(front).transform != 'none';
  }

  container.addEventListener('click', function() {
    if (toggled()) {
      source.removeAttribute('front');
      container.setAttribute('front', '');
    }
  });

  source.addEventListener('click', function() {
    if (toggled()) {
      var back = !source.hasAttribute('front');
      container.removeAttribute('front');
      source.setAttribute('front', '');
      if (back) {
        setTimeout(function() {
          editor.setValue(editor.getValue().trimRight());
          editor.refresh();
        }, 200);
      }
    }
  });

  var nav = document.querySelector('.playground .nav');
  nav.addEventListener('click', function(e) {
    if (e.target.matches('li[data-name]')) {
      var name = e.target.getAttribute('data-name');
      nav.setAttribute('data-current', name);
      var newStyle = doodles[name];
      if (newStyle) {
        doodle.style.display = 'none';
        editor.setValue(newStyle);
        doodle.style.display = '';
      }
    }
  });

  var shapes = [
    { name: 'circle' },
    { name: 'triangle' },
    { name: 'rhombus' },
    { name: 'pentagon' },
    { name: 'hexgon' },
    { name: 'heptagon' },
    { name: 'octagon' },
    { name: 'cross' },

    { name: 'star' },
    { name: 'diamond' },

    { name: 'infinity' },
    { name: 'heart' },

    { name: 'fish' },
    { name: 'whale' },
    { name: 'pear' },
    { name: 'bean' },

    { name: 'hypocycloid', param: 3 },
    { name: 'hypocycloid', param: 4 },
    { name: 'hypocycloid', param: 5 },
    { name: 'hypocycloid', param: 6 },

    { name: 'bicorn' },
    { name: 'clover', param: 3 },
    { name: 'clover', param: 4 },
    { name: 'clover', param: 5 },

    { name: 'bud', param: 3 },
    { name: 'bud', param: 4 },
    { name: 'bud', param: 5 },
    { name: 'bud', param: 10 }

  ];

  var doodleShapes = shapes.map(n => {
    return `
      <div class="shape">
        <css-doodle>
          :doodle {
            clip-path: @shape(${ n.name }, ${ n.param || 1 });
            background: rebeccapurple;
          }
        </css-doodle>
        <p class="title">
          ${
            (n.param ? '(' + n.name  +', ' + n.param + ')' : n.name)
          }
        </p>
      </div>
    `
  }).join('');

  document.querySelector('.shapes').innerHTML = doodleShapes;

}());
