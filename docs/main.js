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
    result[result.length - 2] =
      result[result.length - 2].trim();
    return result.join('\n')
  }

  var example = document.querySelector('.example');
  example.querySelector('textarea').value =
    example.querySelector('.container').innerHTML;

  var codeBlocks = document.querySelectorAll('textarea[code]');
  [].forEach.call(codeBlocks, block => {
    var content = indent(block.value).trim();
    var sample = document.createElement('div');
    sample.className = 'code-sample';
    block.parentNode.replaceChild(sample, block);
    CodeMirror(sample, {
      value: content,
      readOnly: 'nocursor',
      cursorBlinkRate: -1,
      theme: '3024-day',
      tabSize: 2
    });
  });

  var doodleStyle = indent(`
    :doodle {
      border-radius: 50%;
      overflow: hidden;
      background-color: #f6ffed;
    }

    --size: @rand(25%, 125%);
    width: var(--size);
    height: var(--size);

    transition: all .2s ease @rand(.6s);

    border-radius: @any(
      '100% 0', '0 100%'
    );

    background: hsla(
      calc(5*@index()), 70%, 61.8%, @rand(.8)
    );
  `);

  var doodle = document.createElement('css-doodle');
  doodle.grid = '7, 7';
  if (doodle.update) {
    doodle.update(doodleStyle);
  }

  var playground = document.querySelector('.playground');
  var source = document.querySelector('.playground .source');

  var container = document.querySelector('.playground .doodle')
  container.appendChild(doodle);
  container.addEventListener('click', function(e) {
    e.preventDefault();
    if (container.hasAttribute('front')) {
      doodle.refresh();
    }
  });

  var config = {
    value: doodleStyle,
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

  container.addEventListener('click', function() {
    source.removeAttribute('front');
    container.setAttribute('front', '');
  });
  source.addEventListener('click', function() {
    var back = !source.hasAttribute('front');
    container.removeAttribute('front');
    source.setAttribute('front', '');
    if (back) {
      setTimeout(function() {
        editor.refresh();
      }, 200);
    }
  });

}());
