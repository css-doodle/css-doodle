import { scan, iterator, textOf } from './tokenizer.js';
import { parseBody, readValue } from './parse-body.js';
import parseValueGroup from './parse-value-group.js';

// The language @shape and @scene share:
//
//   body  = { row | shape }
//   row   = name ':' value [ ';' ]
//   shape = [ name ] [ '#' id ] [ '*' count [ 'x' count ] ] [ '{' body '}' ]

const GROUPS = ['union', 'subtract', 'intersect', 'exclude'];
const STEPS = ['move', 'rotate', 'scale', 'grow', 'frame', 'mirror'];
const SEMICOLON = scan(';')[0];

// `circle#dot*2x3` or `circle*2x3#dot` → { name: 'circle', id: 'dot', count: [2, 3] }
function shapeOf(text, value) {
    let [, name, id, x, y = 1, after] = text.match(/^([^]*?)(?:#([\w-]+))?(?:\s*\*\s*(\d+)(?:\s*x\s*(\d+))?)?(?:#([\w-]+))?$/);
    let count = x ? [+x, +y] : 0;
    id ||= after;
    let node = { name, id, count, rows: [], children: [] };
    for (let r of value) {
        // copy blocks: `circle*2 {{ … } { … }}`
        if (count && r.copy) (node.copies ||= []).push(r);
        else if (r.rows) node.children.push(r);
        else node.rows.push(r);
    }
    node.copies?.forEach(c => {
        c.rows.unshift(...node.rows);
        c.children.unshift(...node.children);
        c.name = name;
        c.count = count;
    });
    node.copy = !text;
    return node;
}

// parts split at spaces, but an operator keeps its operands: `k * .5 0` → ['k * .5', '0']
function spaced(input) {
    let parts = [];
    for (let v of parseValueGroup(input)) {
        if (parts.length && (/[-+*/%^]$/.test(parts.at(-1)) || /^([*/%^]|[-+]$)/.test(v))) parts[parts.length - 1] += ' ' + v;
        else parts.push(v);
    }
    return parts;
}

function partsOf(input) {
    let parts = parseValueGroup(input, { noSpace: true });
    return parts.length > 1 ? parts : spaced(input);
}

// an angle's own units are degrees, `90deg` is 90 and `.25turn` 90; inside calls like `sin(…)` they keep their math values
function degrees(text) {
    let calls = [];
    return text.replace(/\w+\(?|[()]/g, m =>
        m == ')' ? (calls.pop(), m)
        : m.endsWith('(') ? (calls.push(/[a-zA-Z_]/.test(m)), m)
        : calls.includes(true) ? m : m.replace(/(\d)(deg|turn)$/, (_, d, unit) => unit == 'deg' ? d : d + '*360'));
}

// a space before `#` starts another shape: `#a #b { … }`
let split = head => textOf(head).trim().split(/ (?=#)(?![^(]*\))/);

function readShapes(input, warn = () => {}, options) {
    let last;
    let bare = head => Object.assign(shapeOf(head, []), { bare: true });
    let reader = {
        readBlocks(iter, head) {
            let parts = split(head), block = parts.pop();
            // leftovers glue only to a row of their own block
            last = null;
            let node = shapeOf(block, parseBody(iter, {}, reader).value);
            last = null;
            return [...parts.map(bare), node];
        },
        readStatement(iter, head) {
            let name = textOf(head).trim(), value = readValue(iter), depth = 0, quote = false;
            for (let t of value) {
                if (t.status) quote = t.status == 'open';
                else if (!quote) depth += t.isSymbol('(') - t.isSymbol(')');
                if (!quote && !depth && t.isSymbol(':', '{')) {
                    warn(`${name} needs ;`);
                    break;
                }
            }
            return [last = { name, value }];
        },
        // a bare name is a shape, anything else belongs to the row before it
        readTail(head) {
            if (/^[a-z_#(]/i.test(textOf(head).trim())) return split(head).map(bare);
            last?.value.push(SEMICOLON, ...head);
            return [];
        },
    };
    let root = shapeOf('', parseBody(iterator(scan(input, options)), null, reader));

    let defs = {}, used = new Set();
    let define = nodes => nodes.filter(n => {
        n.children = define(n.children);
        n.copies?.forEach(c => c.children = define(c.children));
        return !(n.name && n.id && (defs[n.id] = n));
    });
    // `#dot { scale: 2 }` adds rows to the named shape
    let merge = (def, ref) => ({
        ...def,
        id: undefined,
        bare: undefined,
        count: ref.count || def.count,
        rows: [...def.rows, ...ref.rows],
        children: [...def.children, ...ref.children],
        copies: ref.copies ? ref.copies.map(c => merge(def, c))
            : ref.count ? undefined
            : def.copies?.map(c => merge(c, { ...ref, copies: undefined })),
    });
    let resolve = (nodes, using) => nodes.flatMap(n => {
        if (n.count && !(n.count[0] * n.count[1])) return [];
        if (n.name || !n.id) return [visit(n, using)];
        let def = defs[n.id];
        if (!def || using.includes(n.id)) {
            warn(def ? `#${n.id} uses itself` : `unknown shape #${n.id}`);
            return [];
        }
        used.add(n.id);
        return [visit(merge(def, n), [...using, n.id])];
    });
    let visit = (n, using) => ({ ...n, children: resolve(n.children, using), copies: n.copies?.map(c => visit(c, using)) });

    root.children = define(root.children);
    root = visit(root, []);
    // named shapes nothing draws, kept so their mistakes show
    root.unused = Object.keys(defs).filter(id => !used.has(id)).map(id => visit(defs[id], [id]));
    return root;
}

// `steps` keeps move, rotate, scale, grow, frame and mirror in the order written
function commandsOf(node) {
    let commands = {};
    for (let { name, value } of node.rows) {
        // `-x: sin(t)` negates the value, each part of `-move: .5 0`; `-: 10` and dashed names like `--x` do not
        let negative = /^-[^-]/.test(name), text = textOf(value);
        if (negative) name = name.slice(1).trim();
        if (name == 'steps' || name == 'blocks') continue;
        if (negative && text && !name.startsWith('fill')) {
            let items = parseValueGroup(text, { noSpace: true });
            if ((name == 'move' || name == 'scale') && items.length < 2) items = spaced(text);
            text = items.map(v => `-1 * (${v})`).join(', ');
        }
        commands[name] = text;
        if (STEPS.includes(name)) (commands.steps ||= []).push([name, text]);
    }
    let items = node.children.flatMap(member);
    if (GROUPS.includes(node.name) || items.length) {
        commands.blocks = { op: GROUPS.includes(node.name) ? node.name : 'union', items };
    }
    return commands;
}

function member(node) {
    let body = n => GROUPS.includes(n.name) || n.children.length
        ? commandsOf(n)
        : [n.name, ...n.rows.map(r => r.name + ':' + textOf(r.value))].join(';');
    if (!node.count) return [body(node)];
    let [X, Y] = node.count, list = node.copies || Array(X * Y).fill(node);
    return list.slice(0, X * Y).map((c, i) => {
        let v = { n: String(i + 1), N: String(X * Y), nx: String(i % X + 1), ny: String((i / X | 0) + 1) }, b = body(c);
        return typeof b == 'string' ? b + ';' + Object.entries(v).map(e => e.join(':')).join(';') : { ...b, ...v };
    });
}

// a bare name at the top is the preset, read by the generator
function parse(input) {
    let root = readShapes(input);
    root.children = root.children.filter(n => !n.bare || n.count);
    return commandsOf(root);
}

export { readShapes, commandsOf, spaced, partsOf, degrees, GROUPS };
export default parse;
