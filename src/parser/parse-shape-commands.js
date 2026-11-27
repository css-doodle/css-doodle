import { scan, iterator, textOf } from './tokenizer.js';
import { parseBody, readValue, namesOf, rowsOf, readMatch, armsOf, armIndex } from './parse-body.js';
import parseValueGroup from './parse-value-group.js';


const GROUPS = ['union', 'subtract', 'intersect', 'exclude'];
const STEPS = ['move', 'rotate', 'scale', 'grow', 'frame', 'mirror'];
const SEMICOLON = scan(';')[0];
const NONE = { __proto__: null, move: '0', rotate: '0', scale: '1', grow: '0', twist: '0' };

function shapeOf(text, value, lower) {
    let [, name, id, x, y = 1, after] = text.match(/^([^]*?)(?:#([\w-]+))?(?:\s*\*\s*(\d+)(?:\s*x\s*(\d+))?)?(?:#([\w-]+))?$/);
    let count = x ? [+x, +y] : 0;
    id ||= after;
    let node = { name, id, count, rows: [], children: [] };
    for (let r of value) {
        if (lower && r.arms) lower(node, r);
        else if (count && r.copy) (node.copies ||= []).push(r);
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

function spaced(input) {
    let parts = [];
    for (let v of parseValueGroup(input)) {
        if (parts.length && (/[-+*/%^]$/.test(parts.at(-1)) || /^([*/%^]|[-+]$)/.test(v))) parts[parts.length - 1] += ' ' + v;
        else parts.push(v);
    }
    return parts;
}

function negate(name, text) {
    return parseValueGroup(text, { noSpace: true }).map(item => {
        let parts = spaced(item);
        return parts.map((v, i) => name != 'rotate' || i == parts.length - 1 ? `-1 * (${v})` : v).join(' ');
    }).join(', ');
}

function partsOf(input) {
    let parts = parseValueGroup(input, { noSpace: true });
    return parts.length > 1 ? parts : spaced(input);
}

function degrees(text) {
    let calls = [];
    return text.replace(/\w+\(?|[()]/g, m =>
        m == ')' ? (calls.pop(), m)
        : m.endsWith('(') ? (calls.push(/[a-zA-Z_]/.test(m)), m)
        : calls.includes(true) ? m : m.replace(/(\d)(deg|turn)$/, (_, d, unit) => unit == 'deg' ? d : d + '*360'));
}

let split = head => textOf(head).trim().split(/ (?=#)(?![^(]*\))/);

function groupsOf(text) {
    let groups = [], depth = 0, from = 0;
    for (let i = 0; i < text.length; i++) {
        let c = text[i];
        if (!depth && /\s/.test(c)) continue;
        if (!depth && c != '(') return null;
        if (c == '(' && !depth++) from = i + 1;
        else if (c == ')' && !--depth) groups.push(text.slice(from, i));
    }
    return !depth && groups.length ? groups : null;
}

function readShapes(input, warn = () => {}, options) {
    let last, blocks = 0, outer = [];
    let bare = head => Object.assign(shapeOf(head, []), { bare: true });
    let lower = (node, m) => {
        let valid = armsOf(m.arms, warn), id = `match_${++blocks}_`;
        outer.push(node.rows);
        let arms = valid.map(a => shapeOf('', a.value, lower));
        outer.pop();
        node.rows.push({ name: id, value: scan(armIndex(valid)) });
        if (arms.some(a => a.children.length)) warn('shapes in match');
        let chains = arms.map(a => [...new Set(a.rows.map(r => r.name))]);
        for (let first; (first = chains.find(c => c.length));) {
            let name = chains.map(c => c[0]).find(n => n && chains.every(c => c.indexOf(n) < 1)) ?? first[0];
            chains = chains.map(c => c.filter(n => n != name));
            let texts = arms.map(a => a.rows.findLast(r => r.name == name)).map(r => r && textOf(r.value));
            let prior = [...outer.flat(), ...node.rows].findLast(r => r.name == name), none = NONE[name];
            let text = texts.find(Boolean), made = !prior && !none && /^\w+_\d+_/.test(name);
            if (!none && !prior && !made) {
                warn(`set ${name} first`);
                continue;
            }
            let parts = texts.map(t => t && !(made && t == text) && partsOf(t));
            let base = made ? partsOf(text) : prior && partsOf(textOf(prior.value));
            let size = Math.max(...[...parts, base].filter(Boolean).map(p => p.length));
            let at = (p, j) => p && (p[j] ?? (p.length == 1 ? p[0] : undefined));
            let out = Array.from({ length: size }, (_, j) => name == 'rotate' && j < size - 1 ? at(parts.find(Boolean), j)
                : `match(${parts.map((p, k) => at(p, j) ? `${id} == ${k + 1}, ${at(p, j)}, ` : '').join('')}${none || at(base, j)})`);
            node.rows.push({ name, value: scan(out.join(parseValueGroup(text, { noSpace: true }).length > 1 ? ', ' : ' ')) });
        }
    };
    let reader = {
        readBlocks(iter, head) {
            last = null;
            let match = readMatch(iter, head, reader), parts = match ? [] : split(head);
            let node = match || shapeOf(parts.pop(), parseBody(iter, {}, reader).value, lower);
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
            return rowsOf(namesOf(head), value, v => partsOf(textOf(v)).map(p => scan(p))).map(({ name, value }) => {
                if (/^-[^-]/.test(name)) {
                    name = name.slice(1).trim();
                    if (textOf(value).trim() && !name.startsWith('fill')) value = scan(negate(name, textOf(value)));
                }
                return last = { name, value };
            });
        },
        readTail(head) {
            let groups = options?.parens && groupsOf(textOf(head));
            if (groups) {
                let nodes = groups.map(g => shapeOf('union', parseBody(iterator(scan(g, options)), null, reader), lower));
                last = null;
                return nodes;
            }
            if (/^[a-z_#(]/i.test(textOf(head).trim())) return split(head).map(bare);
            last?.value.push(SEMICOLON, ...head);
            return [];
        },
    };
    let root = shapeOf('', parseBody(iterator(scan(input, options)), null, reader), lower);

    let defs = {}, used = new Set();
    let define = nodes => nodes.filter(n => {
        n.children = define(n.children);
        n.copies?.forEach(c => c.children = define(c.children));
        return !(n.name && n.id && (defs[n.id] = n));
    });
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
            warn(def ? `recursive #${n.id}` : `unknown #${n.id}`);
            return [];
        }
        used.add(n.id);
        return [visit(merge(def, n), [...using, n.id])];
    });
    let visit = (n, using) => ({ ...n, children: resolve(n.children, using), copies: n.copies?.map(c => visit(c, using)) });

    root.children = define(root.children);
    root = visit(root, []);
    root.unused = Object.keys(defs).filter(id => !used.has(id)).map(id => visit(defs[id], [id]));
    return root;
}

function commandsOf(node) {
    let commands = {};
    for (let { name, value } of node.rows) {
        let text = textOf(value);
        if (name == 'steps' || name == 'blocks') continue;
        commands[name] = text;
        if (STEPS.includes(name)) (commands.steps ||= []).push([name, text]);
    }
    let items = node.children.flatMap(member), group = GROUPS.includes(node.name);
    if (group || items.length) {
        commands.blocks = { op: group ? node.name : 'union', items };
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

function parse(input) {
    let root = readShapes(input);
    root.children = root.children.filter(n => !n.bare || n.count);
    return commandsOf(root);
}

export { readShapes, commandsOf, spaced, partsOf, degrees, GROUPS };
export default parse;
