import type { SgNode } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { enclosingFunction, findImportedCalls } from "../../../../shared/analysis.ts";
import { finding, type RuleFinding } from "../../../../shared/finding.ts";
import { referencesOf } from "../../../../shared/semantic.ts";
import { migrationGuide, SOLID_TARGET_VERSION } from "../../../../shared/target.ts";

const MIGRATION_GUIDE = migrationGuide("batching--reads-values-update-after-flush");

type Pair = { kind: "signal" | "store"; getter: SgNode<TSX>; setter: SgNode<TSX> };
type Site = { node: SgNode<TSX>; filename: string; scope: number };

/**
 * Reports a read of a signal or store that runs synchronously after a write
 * to it, with no `flush()` between. At 2.0.0 a setter queues the write and
 * reads keep returning the old value until the batch flushes in a microtask
 * (checked on the browser build: `setX(1); x()` returns the old value at top
 * level, in a root, and in an event handler; a store field read after
 * `setStore` does too). Solid 1.x applied the write at once outside `batch`.
 *
 * Pairs are the two names of `const [x, setX] = createSignal(...)` and
 * `const [s, setS] = createStore(...)`, resolved by the semantic provider. A
 * read is `x()` or a member access on the store. It counts when it is in the
 * same function body as the write, later in the source, outside JSX (the
 * compiler defers JSX expressions), and not in the other branch of the
 * `if` or `switch` that holds the write. Callbacks given to `untrack` run in
 * place, so they count as the surrounding body. Reads through a memo or a
 * helper function are not traced.
 */
export function analyzeReadAfterWrite(
  rootNode: SgNode<TSX>,
  context: { filename: string },
): RuleFinding[] {
  const flushes = findImportedCalls(rootNode, "solid-js", "flush").map(({ call, filename }) => site(call, filename));
  const findings = new Map<string, RuleFinding>();

  for (const pair of pairs(rootNode)) {
    const writes = uses(pair.setter).filter(({ node }) => calleeOf(node) !== null);
    const reads = uses(pair.getter).flatMap((use) => {
      const node = readOf(use.node, pair.kind);
      return node === null || insideJsx(node) ? [] : [{ ...use, node }];
    });
    for (const write of writes) {
      const call = calleeOf(write.node)!;
      const end = call.range().end.index;
      const read = reads.find(
        (candidate) =>
          candidate.filename === write.filename &&
          candidate.scope === write.scope &&
          candidate.node.range().start.index >= end &&
          !onOtherBranch(call, candidate.node) &&
          !flushes.some(
            (flush) =>
              flush.filename === write.filename &&
              flush.scope === write.scope &&
              flush.node.range().start.index >= end &&
              flush.node.range().start.index < candidate.node.range().start.index,
          ),
      );
      if (read === undefined) continue;
      const key = `${read.filename}:${read.node.id()}`;
      if (findings.has(key)) continue;
      const name = pair.getter.text();
      findings.set(
        key,
        finding(read.filename, read.node, {
          severity: "behavior",
          headline: `This read of ${name} returns its value from before ${pair.setter.text()} on line ${call.range().start.line + 1}.`,
          why: `In Solid ${SOLID_TARGET_VERSION} a setter queues its write, and reads keep returning the old value until the batch flushes in a microtask or flush() runs. Solid 1.x applied the write at once outside batch, so this code read the new value.`,
          guidance: `Read what this function does with ${name} after the write. Where it only needs the value it just wrote, use that value (keep it in a local) instead of reading ${name} again. Where it needs the settled state, such as a memo derived from ${name}, call flush() between the write and the read; flush is a dev error inside an action body and is not re-entrant inside onSettled or tracked effects, so restructure there instead.`,
          guide: MIGRATION_GUIDE,
        }),
      );
    }
  }

  return [...findings.values()].sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.column - b.column);
}

function pairs(rootNode: SgNode<TSX>): Pair[] {
  const found: Pair[] = [];
  const sources = [
    { kind: "signal" as const, modules: ["solid-js"], name: "createSignal" },
    { kind: "store" as const, modules: ["solid-js/store", "solid-js"], name: "createStore" },
  ];
  for (const { kind, modules, name } of sources) {
    for (const { call } of findImportedCalls(rootNode, modules, name)) {
      const declarator = call.parent();
      if (declarator?.kind() !== "variable_declarator") continue;
      const pattern = declarator.field("name");
      if (pattern?.kind() !== "array_pattern") continue;
      const [getter, setter] = pattern.children().filter((child) => child.isNamed() && child.kind() !== "comment");
      if (getter?.kind() === "identifier" && setter?.kind() === "identifier") found.push({ kind, getter, setter });
    }
  }
  return found;
}

function uses(binding: SgNode<TSX>): Site[] {
  return referencesOf(binding).flatMap(({ root, nodes }) => {
    const filename = root.relativeFilename().replaceAll("\\", "/");
    return nodes.filter((node) => node.id() !== binding.id()).map((node) => site(node, filename));
  });
}

function site(node: SgNode<TSX>, filename: string): Site {
  return { node, filename, scope: scopeOf(node)?.id() ?? -1 };
}

/** The call whose callee is `reference`, or null. */
function calleeOf(reference: SgNode<TSX>): SgNode<TSX> | null {
  const call = reference.parent();
  return call?.kind() === "call_expression" && call.field("function")?.id() === reference.id() ? call : null;
}

/** `x()` for a signal; `s.a` or `s[k]` for a store. Null for any other use. */
function readOf(reference: SgNode<TSX>, kind: Pair["kind"]): SgNode<TSX> | null {
  if (kind === "signal") return calleeOf(reference);
  const parent = reference.parent();
  if (parent === null) return null;
  if (parent.kind() !== "member_expression" && parent.kind() !== "subscript_expression") return null;
  return parent.field("object")?.id() === reference.id() ? parent : null;
}

/** The function whose body runs `node`, looking through `untrack(() => ...)`. */
function scopeOf(node: SgNode<TSX>): SgNode<TSX> | null {
  let fn = enclosingFunction(node);
  while (fn !== null && runsInPlace(fn)) fn = enclosingFunction(fn);
  return fn;
}

function runsInPlace(fn: SgNode<TSX>): boolean {
  const call = fn.parent()?.parent();
  return call?.kind() === "call_expression" && call.field("function")?.text() === "untrack";
}

function insideJsx(node: SgNode<TSX>): boolean {
  const scope = scopeOf(node);
  for (const ancestor of node.ancestors()) {
    if (scope !== null && ancestor.id() === scope.id()) return false;
    if (ancestor.kind() === "jsx_expression") return true;
  }
  return false;
}

/** True when `write` and `read` sit in different branches of one `if` or `switch`. */
function onOtherBranch(write: SgNode<TSX>, read: SgNode<TSX>): boolean {
  const readAncestors = new Set(read.ancestors().map((ancestor) => ancestor.id()));
  let child = write;
  for (const ancestor of write.ancestors()) {
    if (readAncestors.has(ancestor.id())) {
      if (ancestor.kind() === "if_statement") return child.kind() !== "parenthesized_expression";
      if (ancestor.kind() === "switch_body") return true;
      return false;
    }
    child = ancestor;
  }
  return false;
}
