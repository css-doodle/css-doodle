/**
 * Maps the rewritten parser's AST to the legacy shape so the legacy
 * generator can consume it (cross-pipeline verification):
 * Argument {values, cluster} becomes a bare array with a .cluster
 * expando, cond regains its vestigial arguments field, and the
 * pre-split pseudo selectors are dropped.
 */
export default function to_legacy(ast) {
  return ast.map(adapt_statement);
}

function adapt_statement(node) {
  switch (node.type) {
    case 'rule': {
      let rule = {
        type: 'rule',
        property: node.property,
        value: adapt_rule_value(node.property, node.value),
      };
      rule.raw = node.raw;
      return rule;
    }
    case 'at-rule': {
      let rule = { type: 'at-rule', property: '', value: node.value };
      rule.raw = node.raw;
      return rule;
    }
    case 'pseudo':
      return {
        type: 'pseudo',
        selector: node.selector,
        styles: node.styles.map(adapt_statement),
      };
    case 'cond':
      return {
        type: 'cond',
        name: node.name,
        styles: node.styles.map(adapt_statement),
        arguments: [],
        addition: node.addition,
        segments: node.segments.map(s => {
          return s.arguments ? { arguments: s.arguments.map(adapt_argument) } : s;
        }),
        position: node.position,
      };
    case 'keyframes':
      return {
        type: 'keyframes',
        name: node.name,
        steps: node.steps.map(step => ({
          type: 'step',
          name: step.name.map(adapt_group),
          styles: step.styles.map(adapt_statement),
        })),
      };
    default:
      return node;
  }
}

function adapt_rule_value(property, value) {
  if (property === '@use') {
    return value.map(adapt_statement);
  }
  if (typeof value === 'string') {
    return value;
  }
  return value.map(adapt_group);
}

function adapt_group(nodes) {
  return nodes.map(adapt_node);
}

function adapt_node(node) {
  if (!node || typeof node !== 'object') return node;
  if (node.type === 'func') {
    let func = {
      type: 'func',
      name: node.name,
      arguments: (node.arguments || []).map(adapt_argument),
    };
    if (node.variables) {
      let variables = {};
      for (let [name, groups] of Object.entries(node.variables)) {
        variables[name] = Array.isArray(groups) ? groups.map(adapt_group) : groups;
      }
      func.variables = variables;
    }
    func.position = node.position;
    return func;
  }
  if (node.type === 'text') {
    if (Array.isArray(node.value)) {
      return { type: 'text', value: node.value.map(adapt_statement) };
    }
    return { type: 'text', value: node.value };
  }
  return node;
}

function adapt_argument(arg) {
  let values = adapt_group(arg.values);
  if (arg.cluster) {
    values.cluster = true;
  }
  return values;
}
