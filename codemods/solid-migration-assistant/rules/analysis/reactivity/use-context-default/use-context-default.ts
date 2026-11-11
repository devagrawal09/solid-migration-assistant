import type { SgNode } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { enclosingFunction, stringLiteralValue } from "../../../../shared/analysis.ts";
import { findBindings } from "../../../../shared/bindings.ts";
import { importedConstDeclaration } from "../../../../shared/provenance.ts";
import { migrationGuide, SOLID_TARGET_VERSION } from "../../../../shared/target.ts";
import { finding, type RuleFinding } from "../../../../shared/finding.ts";

const MIGRATION_GUIDE = migrationGuide(
  "usecontext-on-a-default-less-context-returns-t-not-t--undefined",
);

/**
 * Reports `useContext(X)` sites where the Solid 1.x code tested the result
 * for `undefined` (or a falsy fallback) but rc.21 now throws
 * `ContextNotFoundError` on a default-less context and the result is typed
 * `T`, so the test is dead code at best and obscures a real missing-provider
 * bug at worst.
 *
 * Migration guide section "`useContext` on a default-less context returns
 * `T`, not `T | undefined`" (anchor
 * `usecontext-on-a-default-less-context-returns-t-not-t--undefined`):
 * `createContext<T>()` without a default returns `Context<T>`, `useContext`
 * returns `T` directly, and throws at runtime if no Provider is mounted.
 * `createContext<T | undefined>(undefined)` is still default-less and throws
 * the same way; `null` is the optional-context sentinel.
 *
 * A finding is produced at `behavior` severity when ALL of the following
 * hold:
 *
 * - the file has at least one `useContext` named (unaliased) import from
 *   `solid-js` whose local name is bound exactly once;
 * - the call's single argument is an identifier `X`;
 * - `X` is proven default-less: either the file binds `X` exactly once as a
 *   `const` initialized by a direct call of the file's single `createContext`
 *   named import from `solid-js` with zero arguments or with the single
 *   argument `undefined`, or `X` is a non-type named import from a relative
 *   module whose declaring file (resolved through
 *   `shared/provenance.ts#importedConstDeclaration`) initializes it the same
 *   way with the same per-file `createContext` import proof there;
 * - the call site is a `const`/`let`/`var` declarator whose name is a plain
 *   identifier `ctx`, and `ctx` is tested in the same enclosing function (or
 *   module body) by one of: `if (!ctx)`, `if (ctx === undefined)`,
 *   `if (ctx === null)`, `ctx ?? …`, `ctx || …`, or `ctx?.something`.
 *
 * Any failed clause — an aliased or shadowed `useContext`, a non-identifier
 * argument, a `createContext` call with a non-`undefined` default, a context
 * whose file cannot be opened by the provenance helper, or a result bound
 * nowhere or tested nowhere in its function — leaves the site silent, as the
 * task requires.
 */
export function analyzeUseContextDefault(
  rootNode: SgNode<TSX>,
  context: { filename: string },
): RuleFinding[] {
  const useContextLocals = findSolidImport(rootNode, "useContext");
  if (useContextLocals.size === 0) return [];

  const findings: RuleFinding[] = [];
  const emitted = new Set<string>();
  for (const call of rootNode.findAll({ rule: { kind: "call_expression" } })) {
    const callee = call.field("function");
    if (callee === null || callee.kind() !== "identifier") continue;
    if (!useContextLocals.has(callee.text())) continue;

    const argumentsNode = call.field("arguments");
    if (argumentsNode === null) continue;
    const args = argumentsNode
      .children()
      .filter((child) => child.isNamed() && child.kind() !== "comment");
    const only = args[0];
    if (args.length !== 1 || only === undefined || only.kind() !== "identifier") continue;

    if (!isDefaultlessContext(rootNode, only.text())) continue;

    const declarator = call.parent();
    if (declarator === null || declarator.kind() !== "variable_declarator") continue;
    const nameField = declarator.field("name");
    if (nameField === null || nameField.kind() !== "identifier") continue;
    const localName = nameField.text();

    const scope = enclosingFunction(call) ?? rootNode;
    if (!isTestedForFalsiness(scope, localName)) continue;

    const key = `${context.filename}:${call.id()}`;
    if (emitted.has(key)) continue;
    emitted.add(key);
    findings.push(
      finding(context.filename, call, {
        severity: "behavior",
        headline: `Drop this useContext undefined fallback: rc.21 throws instead of returning undefined.`,
        why: `Solid ${SOLID_TARGET_VERSION} types createContext() without a default as Context<T> and throws ContextNotFoundError when no Provider is mounted, so useContext(${only.text()}) returns T and never undefined; the ${localName} falsiness/null check here reads as dead code to a TypeScript reader and hides the throw at runtime.`,
        guidance: `Delete the ${localName} falsiness/null/undefined check: a wrapper that threw on undefined becomes a plain useContext call, and callers that relied on the undefined fallback should either pass an explicit default to createContext (use null for an optional context — rc.21 treats undefined as "not provided" and still throws) or wrap the useContext call in try/catch. Stop and ask when the branch does real recovery (not just a throw), when the context's declaration is unclear, or when ${localName} escapes this function so the test might run far from here.`,
        guide: MIGRATION_GUIDE,
      }),
    );
  }
  return findings.sort(
    (left, right) => left.line - right.line || left.column - right.column,
  );
}

function findSolidImport(rootNode: SgNode<TSX>, name: string): Set<string> {
  const locals = new Set<string>();
  for (const statement of rootNode.findAll({ rule: { kind: "import_statement" } })) {
    if (statement.children().some((child) => child.kind() === "type")) continue;
    const source = statement.children().find((child) => child.is("string"));
    if (source === undefined || stringLiteralValue(source) !== "solid-js") continue;
    for (const specifier of statement.findAll({ rule: { kind: "import_specifier" } })) {
      if (specifier.children().some((child) => child.kind() === "type")) continue;
      const imported = specifier.field("name");
      if (imported === null || imported.kind() !== "identifier" || imported.text() !== name) continue;
      if (specifier.field("alias") !== null) continue;
      if (findBindings(rootNode, name).length !== 1) continue;
      locals.add(name);
    }
  }
  return locals;
}

function isDefaultlessContext(rootNode: SgNode<TSX>, name: string): boolean {
  const bindings = findBindings(rootNode, name);
  if (bindings.length !== 1) return false;
  const binding = bindings[0]!;
  const parent = binding.parent();
  if (parent === null) return false;

  if (parent.kind() === "variable_declarator") {
    const declaration = parent.parent();
    if (
      declaration === null ||
      declaration.kind() !== "lexical_declaration" ||
      !declaration.children().some((child) => child.kind() === "const")
    ) {
      return false;
    }
    const value = parent.field("value");
    if (value === null || value.kind() !== "call_expression") return false;
    return isLocalCreateContextCall(rootNode, value);
  }

  if (parent.kind() === "import_specifier") {
    const imported = importedConstDeclaration(rootNode, name);
    if (imported === null) return false;
    const value = imported.declarator.field("value");
    if (value === null || value.kind() !== "call_expression") return false;
    return isLocalCreateContextCall(imported.rootNode, value);
  }

  return false;
}

function isLocalCreateContextCall(
  rootNode: SgNode<TSX>,
  call: SgNode<TSX>,
): boolean {
  const createContextLocals = findSolidImport(rootNode, "createContext");
  if (createContextLocals.size === 0) return false;
  const callee = call.field("function");
  if (callee === null || callee.kind() !== "identifier") return false;
  if (!createContextLocals.has(callee.text())) return false;
  const argumentsNode = call.field("arguments");
  if (argumentsNode === null) return false;
  const args = argumentsNode
    .children()
    .filter((child) => child.isNamed() && child.kind() !== "comment");
  if (args.length === 0) return true;
  if (args.length > 1) return false;
  const only = args[0]!;
  return only.kind() === "undefined" || (only.kind() === "identifier" && only.text() === "undefined");
}

function isTestedForFalsiness(
  scope: SgNode<TSX>,
  name: string,
): boolean {
  const scopeIsFunction = scope.kind() !== "program";
  for (const node of scope.findAll({ rule: { kind: "identifier", regex: `^${name}$` } })) {
    const nearest = enclosingFunction(node);
    if (scopeIsFunction) {
      if (nearest === null || nearest.id() !== scope.id()) continue;
    } else {
      if (nearest !== null) continue;
    }
    const parent = node.parent();
    if (parent === null) continue;
    const parentKind = parent.kind();

    // !ctx
    if (parentKind === "unary_expression") {
      const op = parent.children().find((child) => child.kind() === "!");
      if (op !== undefined) return true;
    }

    // ctx === undefined / ctx === null / ctx == null / ctx == undefined / ctx !== undefined / ctx !== null
    if (parentKind === "binary_expression") {
      const op = parent.children().find((child) =>
        child.kind() === "==" ||
        child.kind() === "===" ||
        child.kind() === "!=" ||
        child.kind() === "!==",
      );
      if (op !== undefined && isNullishOperand(parent, node)) return true;
    }

    // ctx ?? fallback / ctx || fallback / ctx && … (truthiness guards)
    if (parentKind === "binary_expression") {
      const op = parent.children().find((child) =>
        child.kind() === "??" || child.kind() === "||" || child.kind() === "&&",
      );
      if (op !== undefined && parent.field("left")?.id() === node.id()) return true;
    }

    // ctx?.member
    if (parentKind === "member_expression" || parentKind === "subscript_expression") {
      const optional = parent.children().some((child) => {
        const k = child.kind();
        return k === "?." || k === "optional_chain";
      });
      if (optional && parent.field("object")?.id() === node.id()) return true;
    }
  }
  return false;
}

function isNullishOperand(parent: SgNode<TSX>, operand: SgNode<TSX>): boolean {
  const other = parent.children().find((child) =>
    child.isNamed() && child.id() !== operand.id() && child.kind() !== "comment",
  );
  if (other === undefined) return false;
  const text = other.text();
  return text === "undefined" || text === "null" || other.kind() === "null" || other.kind() === "undefined";
}
