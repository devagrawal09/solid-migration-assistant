import type { SgNode } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";

/**
 * Kinds of syntax nodes that can directly hold a binding. For the
 * position-sensitive kinds, `isBindingSlot` narrows the match to the actual
 * binding slot so adjacent references never count.
 */
const BINDING_PARENT_KINDS = new Set([
  "function_declaration",
  "generator_function_declaration",
  "class_declaration",
  "abstract_class_declaration",
  "enum_declaration",
  "variable_declarator",
  "required_parameter",
  "optional_parameter",
  "arrow_function",
  "rest_pattern",
  "array_pattern",
  "object_pattern",
  "pair_pattern",
  "import_clause",
  "namespace_import",
  "import_specifier",
  "catch_clause",
  "assignment_pattern",
  "object_assignment_pattern",
]);

function samePosition(left: SgNode<TSX>, right: SgNode<TSX>): boolean {
  const a = left.range().start;
  const b = right.range().start;
  return a.line === b.line && a.column === b.column;
}

/**
 * True when the identifier occupies the binding slot of its parent node and
 * not merely a reference next to it. This keeps the scan precise in both
 * directions: `import { name as alias }`, `function f(a = name)`, and
 * `const alias = name` are references (the local binding is `alias`, `a`, and
 * `alias`), while `const [name] = arr`, `const { name = 1 } = obj`, and
 * `function g(name = 1)` all bind `name`.
 */
export function isBindingSlot(node: SgNode<TSX>): boolean {
  const parent = node.parent();
  if (!parent || !BINDING_PARENT_KINDS.has(parent.kind())) {
    return false;
  }
  switch (parent.kind()) {
    case "import_specifier": {
      const alias = parent.field("alias");
      return alias === null || samePosition(alias, node);
    }
    case "required_parameter":
    case "optional_parameter": {
      const pattern = parent.field("pattern");
      return pattern !== null && samePosition(pattern, node);
    }
    case "arrow_function": {
      const parameter = parent.field("parameter");
      return parameter !== null && samePosition(parameter, node);
    }
    case "assignment_pattern":
    case "object_assignment_pattern": {
      const left = parent.field("left");
      return left !== null && samePosition(left, node);
    }
    case "pair_pattern": {
      const value = parent.field("value");
      return value !== null && samePosition(value, node);
    }
    case "function_declaration":
    case "generator_function_declaration":
    case "class_declaration":
    case "abstract_class_declaration":
    case "enum_declaration":
    case "variable_declarator": {
      const name = parent.field("name");
      return name !== null && samePosition(name, node);
    }
    default:
      return true;
  }
}

/**
 * Every identifier-like node in the file that declares a binding named
 * `name`: function, class, and enum declarations, variables, destructuring
 * patterns, parameters, imports, and catch parameters. The transform
 * workflow has no semantic provider, so callers use this syntactic scan to
 * refuse files where a name they rely on is bound more than once or bound by
 * something other than the declaration they proved. Ambient declarations
 * (`declare const name`, `declare function name`) describe an existing global
 * and are skipped when `ignoreAmbient` is set.
 */
export function findBindings(
  rootNode: SgNode<TSX>,
  name: string,
  { ignoreAmbient = false }: { ignoreAmbient?: boolean } = {},
): SgNode<TSX>[] {
  const bindings: SgNode<TSX>[] = [];
  const pattern = `^${name.replace(/[$^\\.*+?()[\]{}|]/g, "\\$&")}$`;
  const kinds = [
    "identifier",
    "type_identifier",
    "shorthand_property_identifier_pattern",
  ] as const;
  for (const kind of kinds) {
    for (const node of rootNode.findAll({ rule: { kind, regex: pattern } })) {
      if (
        ignoreAmbient &&
        node
          .ancestors()
          .some((ancestor) => ancestor.kind() === "ambient_declaration")
      ) {
        continue;
      }
      if (isBindingSlot(node)) bindings.push(node);
    }
  }
  return bindings.sort(
    (left, right) => left.range().start.index - right.range().start.index,
  );
}
