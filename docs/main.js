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
      mode: block.getAttribute('code') || 'css',
      value: content,
      readOnly: 'nocursor',
      cursorBlinkRate: -1,
      theme: '3024-day',
      tabSize: 2
    });
  });

  var doodleStyle = indent(`
    :doodle {
      clip-path: circle(50% at 50% 50%);
      background-color: #f6ffed;
    }

    transition: .2s ease @rand(.6s);

    will-change: transform;
    transform: scale(@rand(.25, 1.25));

    border-radius: @any(
      100% 0, 0 100%
    );

    background: hsla(
      calc(5 * @index()), 70%, 60%, @rand(.8)
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
    if (!toggled() || container.hasAttribute('front')) {
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
          editor.setValue(editor.getValue().trim());
          editor.refresh();
        }, 200);
      }
    }
  });

}());
