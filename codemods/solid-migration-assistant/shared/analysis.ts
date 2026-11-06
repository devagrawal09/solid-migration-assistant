import type { SgNode } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";

export const ANALYSIS_STATE_KEY = "solid-migration-assistant-guidance";

type ImportedCall = {
  call: SgNode<TSX>;
  argumentNodes: SgNode<TSX>[];
  filename: string;
};

export function findImportedCalls(
  rootNode: SgNode<TSX>,
  moduleName: string | string[],
  importedName: string,
): ImportedCall[] {
  const modules = Array.isArray(moduleName) ? moduleName : [moduleName];
  const calls = new Map<string, ImportedCall>();

  for (const statement of rootNode.findAll({
    rule: { kind: "import_statement" },
  })) {
    const source = statement.children().find((child) => child.is("string"));
    const resolved = source ? stringLiteralValue(source) : null;
    if (!resolved || !modules.includes(resolved)) continue;

    // ── Named imports (plain or aliased) ──
    for (const specifier of statement.findAll({
      rule: { kind: "import_specifier" },
    })) {
      const identifiers = specifier.findAll({ rule: { kind: "identifier" } });
      // Allow 1 id (plain) or 2 ids (aliased); first id is the imported name.
      if (identifiers.length < 1 || identifiers.length > 2) continue;
      if (identifiers[0]!.text().trim() !== importedName) continue;
      const binding = identifiers[identifiers.length - 1]!;

      for (const fileReferences of binding.references()) {
        const filename = fileReferences.root
          .relativeFilename()
          .replaceAll("\\", "/");
        for (const reference of fileReferences.nodes) {
          const resolved = resolveCallFromCallee(reference);
          if (!resolved) continue;
          const { call, argumentsNode } = resolved;
          const argumentNodes = argumentsNode
            .children()
            .filter((child) => child.isNamed() && child.kind() !== "comment");
          calls.set(`${filename}:${call.id()}`, {
            call,
            argumentNodes,
            filename,
          });
        }
      }
    }

    // ── Namespace imports (import * as X) ──
    for (const ns of statement.findAll({
      rule: { kind: "namespace_import" },
    })) {
      const binding = ns.findAll({ rule: { kind: "identifier" } })[0];
      if (!binding) continue;

      for (const fileReferences of binding.references()) {
        const filename = fileReferences.root
          .relativeFilename()
          .replaceAll("\\", "/");
        for (const ref of fileReferences.nodes) {
          // Walk up through parens to the member_expression whose object is ref
          let obj = ref;
          let member = ref.parent();
          while (member?.kind() === "parenthesized_expression") {
            obj = member;
            member = member.parent();
          }
          if (!member || member.kind() !== "member_expression") continue;
          if (member.field("object")?.id() !== obj.id()) continue;

          const prop = member.field("property");
          if (!prop) continue;
          if (prop.kind() === "property_identifier") {
            if (prop.text() !== importedName) continue;
          } else if (prop.kind() === "string") {
            if (stringLiteralValue(prop) !== importedName) continue;
          } else {
            continue; // computed property — unresolvable
          }

          const resolved = resolveCallFromCallee(member);
          if (!resolved) continue;
          const { call, argumentsNode } = resolved;
          const argumentNodes = argumentsNode
            .children()
            .filter((child) => child.isNamed() && child.kind() !== "comment");
          calls.set(`${filename}:${call.id()}`, {
            call,
            argumentNodes,
            filename,
          });
        }
      }
    }
  }

  return [...calls.values()];
}

/**
 * Given a node that should be the callee of a call, unwrap parenthesized
 * expressions and verify it is the function field of a call_expression.
 * Returns the call and its arguments node, or null if the node is not a
 * direct callee.
 */
function resolveCallFromCallee(
  node: SgNode<TSX>,
): { call: SgNode<TSX>; argumentsNode: SgNode<TSX> } | null {
  let functionNode = node;
  let call = node.parent();
  while (call?.kind() === "parenthesized_expression") {
    functionNode = call;
    call = call.parent();
  }
  if (!call || call.kind() !== "call_expression") return null;
  if (call.field("function")?.id() !== functionNode.id()) return null;
  const argumentsNode = call.field("arguments");
  if (!argumentsNode) return null;
  return { call, argumentsNode };
}

export function stringLiteralValue(node: SgNode<TSX>): string | null {
  const text = node.text();
  if (text.length < 2) return null;
  const quote = text[0];
  if ((quote !== '"' && quote !== "'") || text[text.length - 1] !== quote) {
    return null;
  }

  let value = "";
  const end = text.length - 1;
  for (let index = 1; index < end; index++) {
    const character = text[index]!;
    if (character !== "\\") {
      value += character;
      continue;
    }

    index++;
    if (index >= end) return null;
    const escaped = text[index]!;
    if (escaped === "\n" || escaped === "\u2028" || escaped === "\u2029")
      continue;
    if (escaped === "\r") {
      if (text[index + 1] === "\n") index++;
      continue;
    }

    const simpleEscapes: Record<string, string> = {
      b: "\b",
      f: "\f",
      n: "\n",
      r: "\r",
      t: "\t",
      v: "\v",
      "0": "\0",
    };
    if (escaped in simpleEscapes) {
      if (escaped === "0" && /[0-9]/.test(text[index + 1] ?? "")) return null;
      value += simpleEscapes[escaped]!;
      continue;
    }

    if (escaped === "x") {
      const digits = text.slice(index + 1, index + 3);
      if (!/^[0-9a-f]{2}$/i.test(digits)) return null;
      value += String.fromCharCode(Number.parseInt(digits, 16));
      index += 2;
      continue;
    }

    if (escaped === "u") {
      if (text[index + 1] === "{") {
        const close = text.indexOf("}", index + 2);
        if (close < 0 || close >= end) return null;
        const digits = text.slice(index + 2, close);
        if (!/^[0-9a-f]+$/i.test(digits)) return null;
        const codePoint = Number.parseInt(digits, 16);
        if (codePoint > 0x10ffff) return null;
        value += String.fromCodePoint(codePoint);
        index = close;
        continue;
      }
      const digits = text.slice(index + 1, index + 5);
      if (!/^[0-9a-f]{4}$/i.test(digits)) return null;
      value += String.fromCharCode(Number.parseInt(digits, 16));
      index += 4;
      continue;
    }

    value += escaped;
  }
  return value;
}


export type ModuleReferenceForm = "import" | "re-export" | "dynamic-import" | "require";

export type ModuleReference = {
  source: SgNode<TSX>;
  moduleName: string;
  form: ModuleReferenceForm;
};

/**
 * Finds all module references (static imports, re-exports, dynamic imports,
 * and require calls) in a file. Returns the string source node, the resolved
 * module name, and the reference form for each match.
 */
export function findModuleReferences(
  rootNode: SgNode<TSX>,
): ModuleReference[] {
  const matches: ModuleReference[] = [];

  // Static import statements
  for (const statement of rootNode.findAll({
    rule: { kind: "import_statement" },
  })) {
    const source = statement.children().find((child) => child.is("string"));
    if (!source) continue;
    const moduleName = stringLiteralValue(source);
    if (moduleName === null) continue;
    matches.push({ source, moduleName, form: "import" });
  }

  // Re-exports: export { ... } from "..."
  for (const statement of rootNode.findAll({
    rule: { kind: "export_statement" },
  })) {
    const source = statement.children().find((child) => child.is("string"));
    if (!source) continue;
    const moduleName = stringLiteralValue(source);
    if (moduleName === null) continue;
    matches.push({ source, moduleName, form: "re-export" });
  }

  // Dynamic imports: import("...") and require("...")
  for (const call of rootNode.findAll({
    rule: { kind: "call_expression" },
  })) {
    const fnNode = call.field("function");
    if (!fnNode) continue;

    const fnText = fnNode.text();
    const isImport = fnText === "import";
    const isRequire =
      fnNode.kind() === "identifier" && fnText === "require";
    if (!isImport && !isRequire) continue;

    const argumentsNode = call.field("arguments");
    if (!argumentsNode) continue;
    const args = argumentsNode
      .children()
      .filter((child) => child.isNamed() && child.kind() !== "comment");
    const firstArg = args[0];
    if (!firstArg || !firstArg.is("string")) continue;

    const moduleName = stringLiteralValue(firstArg);
    if (moduleName === null) continue;

    matches.push({
      source: firstArg,
      moduleName,
      form: isImport ? "dynamic-import" : "require",
    });
  }

  return matches;
}

const FUNCTION_LIKE = new Set([
  "arrow_function",
  "function_expression",
  "function_declaration",
  "generator_function",
  "generator_function_declaration",
  "method_definition",
]);

/** The nearest function-like ancestor of `node`, or null at module scope. */
export function enclosingFunction(node: SgNode<TSX>): SgNode<TSX> | null {
  return node.ancestors().find((ancestor) => FUNCTION_LIKE.has(ancestor.kind())) ?? null;
}

/**
 * The call whose first argument is exactly `fn` (looking through
 * parentheses), or null when `fn` is not a first call argument.
 */
export function callTakingAsFirstArgument(fn: SgNode<TSX>): SgNode<TSX> | null {
  let node = fn;
  let parent = node.parent();
  while (parent?.kind() === "parenthesized_expression") {
    node = parent;
    parent = node.parent();
  }
  if (parent === null || parent.kind() !== "arguments") return null;
  const first = parent.children().find((child) => child.isNamed() && child.kind() !== "comment");
  if (first?.id() !== node.id()) return null;
  const call = parent.parent();
  return call !== null && call.kind() === "call_expression" ? call : null;
}

/**
 * Calls to functions, by plain callee name, anywhere inside `fn`'s own body,
 * not counting calls nested in inner function literals (whose bodies run at
 * some other time).
 */
export function directCalleeNames(fn: SgNode<TSX>): Set<string> {
  const names = new Set<string>();
  for (const call of fn.findAll({ rule: { kind: "call_expression" } })) {
    if (enclosingFunction(call)?.id() !== fn.id()) continue;
    const callee = call.field("function");
    if (callee !== null && callee.kind() === "identifier") names.add(callee.text());
  }
  return names;
}
