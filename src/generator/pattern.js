import parse_pattern from '../parser/parse-pattern.js';
import parse_grid from '../parser/parse-grid.js';
import transform from './glsl-math-transformer.js';

const CIRCLE_MASK = `
  vec2 cellUV = fract(uv * v) - 0.5;
  float dist = length(cellUV);
  shapeMask = 1.0 - smoothstep(0.5 - fwidth(dist), 0.5, dist);
`;

const float = n => String(n).includes('.') ? n : n + '.0';

const STATEMENT_HANDLERS = {
  fill(token, extra) {
    let { r, g, b, a } = extra.get_rgba_color(token.value);
    return {
      type: 'statement',
      value: `\ncolor = vec4(${float(r / 255)}, ${float(g / 255)}, ${float(b / 255)}, ${float(a)});\n`,
    };
  },
  grid(token) {
    return { type: 'grid', value: token.value };
  },
  shape(token, _, insideBlock) {
    let shape = token.value.trim();
    if (insideBlock && shape) {
      return {
        type: 'statement',
        value: shape === 'circle' ? CIRCLE_MASK : '\nshapeMask = 1.0;\n',
      };
    }
    return { type: 'shape', value: shape };
  },
};

function generate_statement(token, extra, insideBlock = false, vars = {}) {
  if (token.name.startsWith('--')) {
    let varName = token.name.slice(2).trim();
    return { type: 'variable', name: varName, value: token.value.trim() };
  }
  let handler = STATEMENT_HANDLERS[token.name];
  return handler
    ? handler(token, extra, insideBlock)
    : { type: 'statement', value: '' };
}

function substitute_variables(expr, vars, depth = 0, excludeName = null) {
  if (depth > 10) return expr;
  let names = Object.keys(vars).sort((a, b) => b.length - a.length);
  for (let name of names) {
    if (name === excludeName) continue;
    let regex = new RegExp(`\\b${name}\\b`, 'g');
    if (regex.test(expr)) {
      let resolved = substitute_variables(vars[name], vars, depth + 1, name);
      expr = expr.replace(regex, `(${resolved})`);
    }
  }
  return expr;
}

function generate_block(token, extra, vars = {}) {
  if (token.name !== 'match') {
    return '';
  }
  let expr = substitute_variables(token.args[0], vars);
  let cond = transform(expr, { expect: 'bool' });
  let body = token.value
    .map(t => generate_statement(t, extra, true, vars))
    .filter(s => s.type === 'statement')
    .map(s => s.value)
    .join('');
  return `
    if (${cond}) {
      ${body}
    }
  `;
}

function generate_shader(input, { x, y }, shape) {
  let shapeInit = shape === 'circle' ? CIRCLE_MASK : '';
  return `
    vec3 mapping(vec2 uv, vec2 grid) {
      float x = floor(uv.x * grid.x) + 1.0;
      float y = floor((1.0 - uv.y) * grid.y) + 1.0;
      float i = x + (y - 1.0) * grid.x;
      return vec3(x, y, i);
    }
    vec4 getColor(float x, float y, float i, float I, float X, float Y, float t, vec2 uv, vec2 v) {
      vec4 color = vec4(0, 0, 0, 0);
      float shapeMask = 1.0;
      ${shapeInit}
      ${input}
      color.a *= shapeMask;
      return color;
    }
    void main() {
      vec2 uv = gl_FragCoord.xy/u_resolution.xy;
      vec2 v = vec2(${x}, ${y});
      vec3 p = mapping(uv, v);
      FragColor = getColor(p.x, p.y, p.z, v.x * v.y, v.x, v.y, u_time, uv, v);
    }
  `;
}

export default function draw_pattern(code, extra) {
  let tokens = parse_pattern(code);
  let result = [];
  let grid = { x: 1, y: 1 };
  let shape = null;
  let vars = {};

  for (let token of tokens) {
    if (token.type === 'statement') {
      let stmt = generate_statement(token, extra);
      switch (stmt.type) {
        case 'statement': result.push(stmt.value); break;
        case 'grid': grid = parse_grid(stmt.value, Infinity); break;
        case 'shape': shape = stmt.value; break;
        case 'variable': vars[stmt.name] = stmt.value; break;
      }
    } else if (token.type === 'block') {
      result.push(generate_block(token, extra, vars));
    }
  }

  return generate_shader(result.join(''), grid, shape);
}
