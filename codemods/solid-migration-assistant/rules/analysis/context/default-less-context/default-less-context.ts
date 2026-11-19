import type { SgNode } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { enclosingFunction, findImportedCalls } from "../../../../shared/analysis.ts";
import { finding, type RuleFinding } from "../../../../shared/finding.ts";
import { provenImport } from "../../../../shared/imports.ts";
import { importedConstDeclaration } from "../../../../shared/provenance.ts";
import { referencesOf } from "../../../../shared/semantic.ts";
import { migrationGuide, SOLID_TARGET_VERSION } from "../../../../shared/target.ts";

const MIGRATION_GUIDE = migrationGuide("usecontext-on-a-default-less-context-returns-t-not-t--undefined");
const EMPTY = new Set(["undefined", "null"]);

/**
 * Reports `useContext(Ctx)` results that are checked for undefined, where
 * `Ctx` is a default-less `createContext()` (no argument, or `undefined`).
 * Solid 1.x returned undefined outside a Provider; Solid 2.0.3 throws
 * ContextNotFoundError instead, so the check never sees undefined.
 *
 * A check is `!ctx`, a comparison with undefined or null, `ctx ?? x`,
 * `ctx?.x`, `ctx && x`, `ctx || x`, or ctx as an `if` or ternary condition,
 * on the call itself or on the one const it is assigned to. When every check
 * only throws, the hook was a type-narrowing wrapper and the finding is a
 * cleanup; otherwise the fallback branch is dead and behavior changes.
 *
 * A hook that returns the result unchecked is reported too when the
 * undefined is its contract: its declared return type includes undefined
 * or null, or a caller the semantic provider finds checks its result. Those
 * are optional contexts, and on Solid 2 the provider-less path throws.
 *
 * The context is declared in this file, or in the project file a named
 * import resolves to (`importedConstDeclaration`).
 */
export function analyzeDefaultLessContext(
  rootNode: SgNode<TSX>,
  context: { filename: string },
): RuleFinding[] {
  const contextReferences = new Set<string>();
  for (const { call, argumentNodes } of findImportedCalls(rootNode, "solid-js", "createContext")) {
    if (argumentNodes.length > 0 && !(argumentNodes.length === 1 && argumentNodes[0]!.text() === "undefined")) continue;
    const declarator = call.parent();
    const name = declarator?.kind() === "variable_declarator" ? declarator.field("name") : null;
    if (name?.kind() !== "identifier") continue;
    for (const { root, nodes } of referencesOf(name)) {
      const filename = root.relativeFilename().replaceAll("\\", "/");
      for (const node of nodes) contextReferences.add(`${filename}:${node.id()}`);
    }
  }

  return findImportedCalls(rootNode, "solid-js", "useContext").flatMap(({ call, argumentNodes, filename }) => {
    const target = argumentNodes[0];
    if (target === undefined) return [];
    if (!contextReferences.has(`${filename}:${target.id()}`) && !importedDefaultLess(rootNode, target)) return [];
    const checks = undefinedChecks(call);
    if (checks.length === 0) {
      const hook = returningHook(call);
      if (hook === null) return [];
      const annotation = hook.fn.field("return_type")?.text() ?? "";
      const optionalType = /\b(undefined|null)\b/.test(annotation);
      const checkedBy = optionalType ? null : checkingCaller(hook.name);
      if (!optionalType && checkedBy === null) return [];
      return [
        finding(filename, call, {
          severity: "behavior",
          headline: `Keep ${hook.name.text()} optional: useContext(${target.text()}) now throws outside a Provider instead of returning undefined.`,
          why: `${target.text()} is created without a default, and ${hook.name.text()} returns useContext(${target.text()}) as is, ${optionalType ? `declaring ${annotation.replace(/^:\s*/, "")}` : `and ${checkedBy} checks its result for undefined`}, so code outside a Provider relies on getting undefined. Solid 1.x returned undefined from useContext outside a Provider; Solid ${SOLID_TARGET_VERSION} throws ContextNotFoundError instead.`,
          guidance: `Give the context an explicit empty value, createContext<T | null>(null), and map it back in the hook: return useContext(${target.text()}) ?? undefined, so callers keep their contract. undefined is never a context value in Solid 2, so createContext<T | undefined>(undefined) still throws. If every caller is always inside a Provider, drop undefined from the hook's type instead.`,
          guide: MIGRATION_GUIDE,
        }),
      ];
    }
    const onlyThrows = checks.every(throwsWhenEmpty);
    const line = checks[0]!.range().start.line + 1;
    return [
      finding(filename, call, {
        severity: onlyThrows ? "deprecated" : "behavior",
        headline: onlyThrows
          ? `Drop the undefined check on line ${line}; useContext(${target.text()}) now throws without a Provider.`
          : `The undefined fallback on line ${line} never runs; useContext(${target.text()}) now throws without a Provider.`,
        why: `${target.text()} is created without a default. Solid 1.x returned undefined from useContext outside a Provider; Solid ${SOLID_TARGET_VERSION} types the result as the context's type and throws ContextNotFoundError instead.`,
        guidance: onlyThrows
          ? `Delete the check and return the useContext result directly; the hook only existed to narrow the type. If many callers use the hook, keeping it as a one-line alias is fine.`
          : `If code here must work outside a Provider, give the context an explicit empty value, createContext<T | null>(null), and check for null. undefined is never a context value in Solid 2, so createContext<T | undefined>(undefined) still throws. Otherwise remove the fallback.`,
        guide: MIGRATION_GUIDE,
      }),
    ];
  });
}

/**
 * Whether `target`, a context passed to useContext, is a default-less
 * createContext from solid-js declared in another project file and imported
 * here by name.
 */
function importedDefaultLess(rootNode: SgNode<TSX>, target: SgNode<TSX>): boolean {
  if (target.kind() !== "identifier") return false;
  const declaration = importedConstDeclaration(rootNode, target.text());
  const value = declaration?.declarator.field("value");
  if (declaration === null || value === null || value === undefined || value.kind() !== "call_expression") return false;
  // The declaring file is re-parsed without a semantic provider, so its
  // createContext import is proven syntactically: the single, unshadowed one.
  const createContext = provenImport(declaration.rootNode, "solid-js", "createContext");
  if (createContext === null || value.field("function")?.text() !== createContext.local) return false;
  const argumentNodes = value.field("arguments")?.children().filter((child) => child.isNamed() && child.kind() !== "comment") ?? [];
  return argumentNodes.length === 0 || (argumentNodes.length === 1 && argumentNodes[0]!.text() === "undefined");
}

/**
 * The named function that returns the call's result as is, as an arrow
 * body, a `return` argument, or a const that it returns, with its name.
 */
function returningHook(call: SgNode<TSX>): { fn: SgNode<TSX>; name: SgNode<TSX> } | null {
  const fn = enclosingFunction(call);
  if (fn === null) return null;
  const parent = call.parent();
  const declarator = parent?.kind() === "variable_declarator" ? parent.field("name") : null;
  const returned =
    fn.field("body")?.id() === call.id() ||
    parent?.kind() === "return_statement" ||
    (declarator?.kind() === "identifier" &&
      fn.findAll({ rule: { kind: "return_statement" } }).some((statement) => statement.child(1)?.text() === declarator.text()));
  if (!returned) return null;
  const own = fn.field("name");
  if (own !== null) return { fn, name: own };
  const holder = fn.parent();
  const name = holder?.kind() === "variable_declarator" ? holder.field("name") : null;
  return name?.kind() === "identifier" ? { fn, name } : null;
}

/** `file:line` of the first call of the hook whose result is checked for undefined, or null. */
function checkingCaller(name: SgNode<TSX>): string | null {
  for (const { root, nodes } of referencesOf(name)) {
    for (const reference of nodes) {
      const call = reference.parent();
      if (call?.kind() !== "call_expression" || call.field("function")?.id() !== reference.id()) continue;
      const checks = undefinedChecks(call);
      if (checks.length > 0) return `${root.relativeFilename().replaceAll("\\", "/")}:${checks[0]!.range().start.line + 1}`;
    }
  }
  return null;
}

/** The nodes that test the call's result for emptiness. */
function undefinedChecks(call: SgNode<TSX>): SgNode<TSX>[] {
  const direct = checkAround(call);
  if (direct !== null) return [direct];
  const declarator = call.parent();
  const name = declarator?.kind() === "variable_declarator" ? declarator.field("name") : null;
  const scope = enclosingFunction(call);
  if (name?.kind() !== "identifier" || scope === null) return [];
  return scope
    .findAll({ rule: { kind: "identifier", regex: `^${name.text().replace(/\$/g, "\\$")}$` } })
    .filter((reference) => reference.id() !== name.id())
    .map(checkAround)
    .filter((check): check is SgNode<TSX> => check !== null);
}

function checkAround(value: SgNode<TSX>): SgNode<TSX> | null {
  const parent = value.parent();
  if (parent === null) return null;
  switch (parent.kind()) {
    case "unary_expression":
      return parent.text().startsWith("!") ? parent : null;
    case "binary_expression": {
      const operator = parent.field("operator")?.text() ?? "";
      if (["??", "&&", "||"].includes(operator)) return parent.field("left")?.id() === value.id() ? parent : null;
      if (!["==", "===", "!=", "!=="].includes(operator)) return null;
      const other = parent.field("left")?.id() === value.id() ? parent.field("right") : parent.field("left");
      return other !== null && EMPTY.has(other.text()) ? parent : null;
    }
    case "member_expression":
    case "call_expression":
      return parent.children().some((child) => child.kind() === "optional_chain") && parent.child(0)?.id() === value.id() ? parent : null;
    case "parenthesized_expression": {
      const holder = parent.parent();
      return holder?.kind() === "if_statement" && holder.field("condition")?.id() === parent.id() ? parent : null;
    }
    case "ternary_expression":
      return parent.field("condition")?.id() === value.id() ? parent : null;
    default:
      return null;
  }
}

/** True for `if (!ctx) throw ...`. */
function throwsWhenEmpty(check: SgNode<TSX>): boolean {
  const condition = check.parent();
  const statement = condition?.parent();
  if (condition?.kind() !== "parenthesized_expression" || statement?.kind() !== "if_statement") return false;
  if (!check.text().startsWith("!") && !/^[^=!]*===?\s*(undefined|null)$/.test(check.text())) return false;
  const consequence = statement.field("consequence");
  if (consequence === null) return false;
  if (consequence.kind() === "throw_statement") return true;
  const statements = consequence.children().filter((child) => child.isNamed() && child.kind() !== "comment");
  return statements.length === 1 && statements[0]!.kind() === "throw_statement";
}
