import Cache from '../utils/cache.js';
import parse_pattern from '../parser/parse-pattern.js';
import parse_grid from '../parser/parse-grid.js';

function generate_shader(input, {x, y}) {
  return `
    vec3 mapping(vec2 uv, vec2 grid) {
      vec2 _grid = 1.0/grid;
      float x = ceil(uv.x/_grid.x);
      float y = ceil(grid.y - uv.y/_grid.y);
      float i = x + (y - 1.0) * y;
      return vec3(x, y, i);
    }
    vec4 getColor(float x, float y, float i, float I, float X, float Y, float t) {
      vec4 color = vec4(0, 0, 0, 0);
      ${input}
      return color;
    }
    void main() {
      vec2 uv = gl_FragCoord.xy/u_resolution.xy;
      vec2 v = vec2(${x}, ${y});
      vec3 p = mapping(uv, v);
      FragColor = getColor(p.x, p.y, p.z, v.x * v.y, v.x, v.y, u_time);
    }
  `;
}

function generate_statement(token, extra) {
  if (token.name === 'fill') {
    let {r, g, b, a} = extra.get_rgba_color(token.value);
    return {
      type: 'statement',
      value: `\ncolor = vec4(${float(r/255)}, ${float(g/255)}, ${float(b/255)}, ${float(a)});\n`,
    }
  }
  if (token.name == 'grid') {
    return {
      type: 'grid',
      value: token.value,
    }
  }
  return {
    type: 'statement',
    value: ''
  }
}

function generate_block(token, extra) {
  if (token.name === 'match') {
    let cond = token.args[0];
    let values = [];
    token.value.forEach(t => {
      let statement = generate_statement(t, extra);
      if (statement.type == 'statement') {
        values.push(statement.value);
      }
    });
    return `
      if (${cond}) {
        ${values.join('')}
      }
    `
  }
  return '';
}

function float(n) {
  return String(n).includes('.') ? n : n + '.0';
}

export default function draw_pattern(code, extra) {
  let tokens = parse_pattern(code);
  let result = [];
  let grid = {x: 1, y: 1};
  tokens.forEach(token => {
    if (token.type === 'statement') {
      let statement = generate_statement(token, extra);
      if (statement.type == 'statement') {
        result.push(statement.value);
      }
      if (statement.type === 'grid') {
        grid = parse_grid(statement.value, Infinity);
      }
    } else if (token.type === 'block') {
      result.push(generate_block(token, extra));
    }
  });
  return generate_shader(result.join(''), grid);
}
