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
 *
 * Factories that return a context or its hooks in a tuple (Clerk's
 * `createContextProviderAndHook`, `const [Provider, useX] = factory(...)`)
 * are followed through the semantic provider: a default-less context
 * returned in the tuple is followed to every `useContext` of the binding
 * callers destructure it into, in any project file, and an unchecked hook
 * returned there counts as optional when a caller of its destructured
 * binding checks the result, or when a hook beside it in the same tuple
 * throws when that context is missing (the unchecked one is then the
 * variant meant to return undefined outside a Provider).
 */
export function analyzeDefaultLessContext(
  rootNode: SgNode<TSX>,
  context: { filename: string },
): RuleFinding[] {
  const contextReferences = new Set<string>();
  // useContext calls in other project files on a context this file returns
  // in a tuple. The callee is proven the file's one unshadowed solid-js
  // useContext import, syntactically, as for imported contexts.
  const otherFiles: { call: SgNode<TSX>; argumentNodes: SgNode<TSX>[]; filename: string }[] = [];
  for (const { call, argumentNodes } of findImportedCalls(rootNode, "solid-js", "createContext")) {
    if (argumentNodes.length > 0 && !(argumentNodes.length === 1 && argumentNodes[0]!.text() === "undefined")) continue;
    const declarator = call.parent();
    const name = declarator?.kind() === "variable_declarator" ? declarator.field("name") : null;
    if (name?.kind() !== "identifier") continue;
    for (const { root, nodes } of referencesOf(name)) {
      const filename = root.relativeFilename().replaceAll("\\", "/");
      for (const node of nodes) contextReferences.add(`${filename}:${node.id()}`);
    }
    // Returned in a tuple: the bindings callers destructure it into, in
    // whatever file reads them.
    const tuple = returnedTuple(name);
    for (const alias of tuple === null ? [] : tupleAliases(tuple)) {
      for (const { root, nodes } of referencesOf(alias)) {
        const filename = root.relativeFilename().replaceAll("\\", "/");
        const useContext = provenImport(root.root(), "solid-js", "useContext");
        for (const node of nodes) {
          contextReferences.add(`${filename}:${node.id()}`);
          const call = node.parent()?.parent();
          const argumentNodes = call?.field("arguments")?.children().filter((child) => child.isNamed() && child.kind() !== "comment") ?? [];
          if (filename === context.filename || useContext === null || call === null || call === undefined || call.kind() !== "call_expression") continue;
          if (call.field("function")?.text() === useContext.local && argumentNodes[0]?.id() === node.id()) otherFiles.push({ call, argumentNodes, filename });
        }
      }
    }
  }

  const ownFile = findImportedCalls(rootNode, "solid-js", "useContext");
  const ownReads = new Set(ownFile.map(({ call }) => call.id()));
  const followed = new Set(otherFiles.map(({ call }) => call));
  return [...ownFile, ...otherFiles].flatMap(({ call, argumentNodes, filename }) => {
    const target = argumentNodes[0];
    if (target === undefined) return [];
    if (!followed.has(call) && !contextReferences.has(`${filename}:${target.id()}`) && !importedDefaultLess(rootNode, target)) return [];
    const checks = undefinedChecks(call);
    if (checks.length === 0) {
      const hook = returningHook(call);
      if (hook === null) return [];
      const annotation = hook.fn.field("return_type")?.text() ?? "";
      const optionalType = /\b(undefined|null)\b/.test(annotation);
      const tuple = optionalType ? null : returnedTuple(hook.name);
      let checkedBy = optionalType ? null : checkingCaller(hook.name);
      if (checkedBy === null && tuple !== null) {
        for (const alias of tupleAliases(tuple)) {
          const caller = checkingCaller(alias);
          if (caller === null) continue;
          checkedBy = `${caller}, through the ${alias.text()} it destructures from ${tuple.factory}(),`;
          break;
        }
      }
      // The sibling is looked for in this file's factory only (ownReads are this file's calls).
      const throwingSibling = checkedBy !== null || tuple === null || filename !== context.filename ? null : throwingTupleSibling(tuple, target.text(), ownReads);
      if (!optionalType && checkedBy === null && throwingSibling === null) return [];
      const contract = optionalType
        ? `declaring ${annotation.replace(/^:\s*/, "")}`
        : checkedBy !== null
          ? `and ${checkedBy} checks its result for undefined`
          : `and ${tuple?.factory}() returns it beside ${throwingSibling}, which throws when the context is missing, so it is the variant that returns undefined outside a Provider`;
      return [
        finding(filename, call, {
          severity: "behavior",
          headline: `Keep ${hook.name.text()} optional: useContext(${target.text()}) now throws outside a Provider instead of returning undefined.`,
          why: `${target.text()} is created without a default, and ${hook.name.text()} returns useContext(${target.text()}) as is, ${contract}, so code outside a Provider relies on getting undefined. Solid 1.x returned undefined from useContext outside a Provider; Solid ${SOLID_TARGET_VERSION} throws ContextNotFoundError instead.`,
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

/**
 * The array literal a named function returns `name` in (`return [a, name]`,
 * `as const` allowed, or an arrow's body), with `name`'s index and the
 * function's name, or null. A spread before it leaves the index unknown.
 */
function returnedTuple(name: SgNode<TSX>): { array: SgNode<TSX>; index: number; factory: string; factoryName: SgNode<TSX> } | null {
  const owner = enclosingFunction(name);
  for (const { nodes } of referencesOf(name)) {
    for (const reference of nodes) {
      const array = reference.parent();
      if (array?.kind() !== "array" || enclosingFunction(array)?.id() !== owner?.id() || owner === null) continue;
      let returned = array;
      let parent = array.parent();
      while (parent !== null && ["as_expression", "satisfies_expression", "parenthesized_expression"].includes(parent.kind())) {
        returned = parent;
        parent = parent.parent();
      }
      if (parent?.kind() !== "return_statement" && owner.field("body")?.id() !== returned.id()) continue;
      const elements = array.children().filter((child) => child.isNamed() && child.kind() !== "comment");
      const index = elements.findIndex((element) => element.id() === reference.id());
      if (elements.slice(0, index).some((element) => element.kind() === "spread_element")) return null;
      const holder = owner.parent();
      const factoryName = owner.field("name") ?? (holder?.kind() === "variable_declarator" ? holder.field("name") : null);
      if (factoryName === null || factoryName.kind() !== "identifier") return null;
      return { array, index, factory: factoryName.text(), factoryName };
    }
  }
  return null;
}

/**
 * The identifiers callers bind the tuple's element to: every call of the
 * factory, found through the semantic provider in any project file, whose
 * result is destructured, `const [a, b] = factory(...)`, binds the element's
 * index to a plain identifier (holes count; a rest element ends the match).
 */
function tupleAliases(tuple: { index: number; factoryName: SgNode<TSX> }): SgNode<TSX>[] {
  const aliases: SgNode<TSX>[] = [];
  for (const { nodes } of referencesOf(tuple.factoryName)) {
    for (const reference of nodes) {
      const call = reference.parent();
      if (call?.kind() !== "call_expression" || call.field("function")?.id() !== reference.id()) continue;
      const declarator = call.parent();
      const pattern = declarator?.kind() === "variable_declarator" ? declarator.field("name") : null;
      if (pattern?.kind() !== "array_pattern") continue;
      let position = 0;
      for (const child of pattern.children()) {
        if (child.text() === ",") position += 1;
        else if (child.kind() === "rest_pattern") break;
        else if (position === tuple.index && child.kind() === "identifier") aliases.push(child);
      }
    }
  }
  return aliases;
}

/**
 * The name of another hook in the same returned tuple, declared in the same
 * factory, that reads useContext(`target`) (one of `reads`, the file's
 * proven solid-js useContext calls) and throws when it is empty, or null.
 */
function throwingTupleSibling(tuple: { array: SgNode<TSX>; index: number }, target: string, reads: ReadonlySet<number>): string | null {
  const factory = enclosingFunction(tuple.array);
  if (factory === null) return null;
  const elements = tuple.array.children().filter((child) => child.isNamed() && child.kind() !== "comment");
  for (const element of elements) {
    if (element.kind() !== "identifier" || elements.indexOf(element) === tuple.index) continue;
    const declarator = factory.find({ rule: { kind: "variable_declarator", has: { field: "name", regex: `^${element.text().replace(/\$/g, "\\$")}$` } } });
    const value = declarator?.field("value");
    if (value === null || value === undefined || !["arrow_function", "function_expression"].includes(value.kind())) continue;
    const read = value.findAll({ rule: { kind: "call_expression" } })
      .filter((call) => reads.has(call.id()) && call.field("arguments")?.children().find((child) => child.isNamed())?.text() === target);
    if (read.some((call) => undefinedChecks(call).some(throwsWhenEmpty))) return element.text();
  }
  return null;
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
