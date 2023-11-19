import { next_id, is_nil } from '../utils/index.js';

const NS = 'http://www.w3.org/2000/svg';
const NSXLink = 'http://www.w3.org/1999/xlink';
const nextId = next_id();

class Tag {
  constructor(name, value = '') {
    if (!name) {
      throw new Error("Tag name is required");
    }
    this.id = Symbol();
    this.name = name;
    this.body = [];
    this.attrs = {};
    if (this.isTextNode()) {
      this.body = value;
    }
  }
  isTextNode() {
    return this.name === 'text-node';
  }
  find(target) {
    let id = target.attrs.id;
    let name = target.name;
    if (Array.isArray(this.body) && id !== undefined) {
      return this.body.find(tag => tag.attrs.id === id && tag.name === name);
    }
  }
  findSpareDefs() {
    return this.body.find(n => n.name === 'defs' && !n.attrs.id);
  }
  append(tags) {
    if (!Array.isArray(tags)) {
      tags = [tags];
    }
    for (let tag of tags) {
      if (!this.isTextNode()) {
        this.body.push(tag);
      }
    }
  }
  merge(tag) {
    for (let [name, value] of Object.entries(tag.attrs)) {
      this.attrs[name] = value;
    }
    if (Array.isArray(tag.body)) {
      this.body.push(...tag.body);
    }
  }
  attr(name, value) {
    if (!this.isTextNode()) {
      if (value === undefined) {
        return this.attrs[name];
      }
      return this.attrs[name] = value;
    }
  }
  toString() {
    if (this.isTextNode()) {
      return removeQuotes(this.body);
    }
    let attrs = [''];
    let body = [];
    for (let [name, value] of Object.entries(this.attrs)) {
      value = removeQuotes(value);
      attrs.push(`${name}="${value}"`);
    }
    for (let tag of this.body) {
      body.push(tag.toString());
    }
    let content = body.join('');
    if (content.length || /svg/i.test(this.name)) {
      return `<${this.name}${attrs.join(' ')}>${body.join('')}</${this.name}>`;
    }
    return `<${this.name}${attrs.join(' ')}/>`;
  }
}

function composeStyleRule(name, value) {
  return `${name}:${value};`
}

function removeQuotes(text) {
  text = String(text);
  let double = text.startsWith('"') && text.endsWith('"');
  let single = text.startsWith("'") && text.endsWith("'");
  if (double || single) {
    return text.substring(1, text.length - 1);
  }
  return text;
}

function transformViewBox(token) {
  let viewBox = token.detail.value;
  let p = token.detail.padding || token.detail.p || token.detail.expand;
  if (!viewBox.length) {
    return '';
  }
  let [x, y, w, h] = viewBox;
  if (p) {
    [x, y, w, h] = [x-p, y-p, w+p*2, h+p*2];
  }
  return `${x} ${y} ${w} ${h}`;
}

function isGraphicElement(name) {
  return name === 'path'
    || name === 'line'
    || name === 'circle'
    || name === 'ellipse'
    || name === 'rect'
    || name === 'polygon'
    || name === 'polyline';
}

function generate(token, element, parent, root) {
  let inlineId;
  if (!element) {
    element = new Tag('root');
  }
  if (token.type === 'block') {
    // style tag
    if (token.name === 'style') {
      let el = new Tag('style');
      el.append(token.value);
      element.append(el);
    }
    // normal svg elements
    else {
      let el = new Tag(token.name);
      if (!root) {
        root = el;
        root.attr('xmlns', NS);
      }
      if (token.name === 'defs') {
        let defsElement = root.findSpareDefs();
        // replace with existing defs
        if (defsElement) {
          el = defsElement;
        }
      }
      for (let block of token.value) {
        token.parent = parent;
        let id = generate(block, el, token, root);
        if (id) { inlineId = id }
      }
      let isInlineAndNotDefs = token && token.inline && token.name !== 'defs';
      let isParentInlineDefs = parent && parent.inline && parent.name === 'defs';
      let isSingleDefChild = isParentInlineDefs && parent.value.length == 1;

      if (isInlineAndNotDefs || isParentInlineDefs) {
        // generate id for inline block if no id is found
        let found = token.value.find(n => n.type === 'statement' && n.name === 'id');
        if (found) {
          inlineId = found.value;
        } else if (isSingleDefChild || isInlineAndNotDefs) {
          inlineId = nextId(token.name);
          el.attr('id', inlineId);
        }
      }
      let existedTag = element.find(el);
      if (existedTag) {
        existedTag.merge(el);
      } else {
        if (token.name === 'defs') {
          // append only when there's no defs and spare defs
          let defsElement = root.findSpareDefs();
          if (defsElement && !el.attrs.id) {
            if (el.id !== defsElement.id) {
              defsElement.append(el.body);
            }
          } else {
            root.append(el);
          }
        } else {
          element.append(el);
        }
      }
    }
  }
  if (token.type === 'statement' && !token.variable) {
    if (token.name === 'content') {
      let text = new Tag('text-node', token.value);
      element.append(text);
    }
    // inline style
    else if (token.name.startsWith('style ')) {
      let name = (token.name.split('style ')[1] || '').trim();
      if (name.length) {
        let style = element.attr('style') || '';
        element.attr('style', style + composeStyleRule(name, token.value));
      }
    }
    else {
      let value = token.value;
      // handle inline block value
      if (value && value.type === 'block') {
        let id = generate(token.value, root, token, root);
        if (is_nil(id)) {
          value = '';
        } else {
          value = `url(#${id})`;
          if (token.name === 'xlink:href' || token.name === 'href') {
            value = `#${id}`;
          }
        }
      }
      if (/viewBox/i.test(token.name)) {
        value = transformViewBox(token, value);
        if (value) {
          element.attr(token.name, value);
        }
      }
      else if ((token.name === 'draw' || token.name === 'animate') && isGraphicElement(parent && parent.name)) {
        let [dur, repeatCount] = String(value).split(/\s+/);
        if (dur === 'indefinite' || dur === 'infinite' || /\d$/.test(dur)) {
          [dur, repeatCount] = [repeatCount, dur];
        }
        if (repeatCount === 'infinite') {
          repeatCount = 'indefinite';
        }
        element.attr('stroke-dasharray', 10);
        element.attr('pathLength', 10);
        let animate = new Tag('animate');
        animate.attr('attributeName', 'stroke-dashoffset');
        animate.attr('from', 10);
        animate.attr('to', 0);
        animate.attr('dur', dur);
        if (repeatCount) {
          animate.attr('repeatCount', repeatCount);
        }
        element.append(animate);
      }
      else {
        element.attr(token.name, value);
      }
      if (token.name.includes('xlink:')) {
        root.attr('xmlns:xlink', NSXLink);
      }
    }
  }
  if (!parent) {
    return root.toString();
  }
  return inlineId;
}

function generate_svg(token) {
  return generate(token);
}

export {
  generate_svg,
}
