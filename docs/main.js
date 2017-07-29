(function() {

  if (!window.customElements || !document.head.attachShadow) {
    document.body.className += 'oldie';
  }

  function removeSpaces(input) {
    return input.replace(/[\s\n\t]/g, '');
  }

  function indent(input) {
    let temp = input.replace(/^\n+/g, '');
    let len = temp.length - temp.replace(/^\s+/g, '').length;
    let result = input.split('\n').map(n => (
      n.replace(new RegExp(`^\\s{${len}}`, 'g'), '')
    ));
    return result.join('\n');
  }

  let examples = document.querySelectorAll('.example');
  [].forEach.call(examples, example => {
    let textarea = example.querySelector('textarea');
    if (textarea) {
      textarea.value = example.querySelector('.container').innerHTML;
    }
  });

  let codeBlocks = document.querySelectorAll('textarea[code]');
  [].forEach.call(codeBlocks, block => {
    let content = indent(block.value).trim();
    let sample = document.createElement('div');
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

  const doodles = {
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

    star: indent(`
      :doodle {
        clip-path: @shape(bud, 5);
        background: #673AB7;
      }

      clip-path: @shape(bud, 5);

      background: hsla(
        calc(300 + 3 * @index()),
        75%, 70%, @rand(.8)
      );

      transition: .2s ease @rand(300ms);
      transform:
        scale(@rand(.2, 1.5))
        translate3d(
          @rand(-50%, 50%),
          @rand(-50%, 50%),
          0
        );
    `)
  }

  let doodle = document.createElement('css-doodle');
  doodle.title = 'Click to update';
  doodle.grid = '7, 7';
  if (doodle.update) {
    doodle.update(doodles.leaves);
  }

  let playground = document.querySelector('.playground');
  let source = document.querySelector('.playground .source');

  let container = document.querySelector('.playground .doodle')
  container.appendChild(doodle);
  container.addEventListener('click', function(e) {
    e.preventDefault();
    if (!toggled() || container.hasAttribute('front')) {
      if (e.target.matches('css-doodle')) {
        doodle.refresh();
      }
    }
  });

  let config = {
    value: doodles.leaves,
    mode: 'css',
    insertSoftTab: true,
    theme: '3024-day',
    matchBrackets: true,
    smartIndent: true,
    tabSize: 2
  }

  let editor = CodeMirror(source, config);
  let old = removeSpaces(editor.getValue());
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
    let front = playground.querySelector('[front]');
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
      let back = !source.hasAttribute('front');
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

  let nav = document.querySelector('.playground .nav');
  nav.addEventListener('click', function(e) {
    if (e.target.matches('li[data-name]')) {
      let name = e.target.getAttribute('data-name');
      nav.setAttribute('data-current', name);
      let newStyle = doodles[name];
      if (newStyle) {
        doodle.style.display = 'none';
        editor.setValue(newStyle);
        doodle.style.display = '';
      }
    }
  });

  const allShapes = document.querySelector('.shapes');
  const shapes = [
    'circle',        'triangle',      'rhombus',       'pentagon',
    'hexagon',       'heptagon',      'octagon',       'cross',
    'star',          'diamond',       'infinity',      'heart',
    'fish',          'whale',         'pear',          'bean',
    'hypocycloid:3', 'hypocycloid:4', 'hypocycloid:5', 'hypocycloid:6',
    'bicorn',        'clover:3',      'clover:4',      'clover:5',
    'bud:3',         'bud:4',         'bud:5',         'bud:10'
  ];

  if (allShapes) {
    allShapes.innerHTML = shapes.map(shape => {
      let [name, param] = shape.split(':').map(n => n.trim());
      return `
        <div class="shape">
          <css-doodle>
            :doodle {
              clip-path: @shape(${ name }, ${ param || 1});
              background: rebeccapurple;
            }
          </css-doodle>
          <p class="title">
            ${ param ? `(${ name }, ${ param })` : name }
          </p>
        </div>
      `
    }).join('');
  }

}());
