import type { SgNode } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { findImportedCalls, stringLiteralValue } from "../../../../shared/analysis.ts";
import { finding, type RuleFinding } from "../../../../shared/finding.ts";
import { referencesOf } from "../../../../shared/semantic.ts";
import { calleeOf, runningFunction, statePairs, type StatePair } from "../../../../shared/state-pairs.ts";
import { migrationGuide, SOLID_TARGET_VERSION } from "../../../../shared/target.ts";

const MIGRATION_GUIDE = migrationGuide("batching--reads-values-update-after-flush");

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
 * place, so they count as the surrounding body. A store read of a top-level
 * field the write provably leaves alone (a path setter's first key, an
 * object merge's keys, or the `draft.key` uses of a draft callback) is not
 * reported. Reads through a memo or a helper function are not traced.
 */
export function analyzeReadAfterWrite(
  rootNode: SgNode<TSX>,
  context: { filename: string },
): RuleFinding[] {
  const flushes = findImportedCalls(rootNode, "solid-js", "flush").map(({ call, filename }) => site(call, filename));
  const findings = new Map<string, RuleFinding>();

  for (const pair of statePairs(rootNode)) {
    const writes = uses(pair.setter).filter(({ node }) => calleeOf(node) !== null);
    const reads = uses(pair.getter).flatMap((use) => {
      const node = readOf(use.node, pair.kind);
      return node === null || insideJsx(node) ? [] : [{ ...use, node }];
    });
    for (const write of writes) {
      const call = calleeOf(write.node)!;
      const end = call.range().end.index;
      const written = pair.kind === "store" ? writtenKeys(call) : null;
      const read = reads.find(
        (candidate) =>
          candidate.filename === write.filename &&
          (written === null || !untouched(written, candidate.node)) &&
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

function uses(binding: SgNode<TSX>): Site[] {
  return referencesOf(binding).flatMap(({ root, nodes }) => {
    const filename = root.relativeFilename().replaceAll("\\", "/");
    return nodes.filter((node) => node.id() !== binding.id()).map((node) => site(node, filename));
  });
}

function site(node: SgNode<TSX>, filename: string): Site {
  return { node, filename, scope: runningFunction(node)?.id() ?? -1 };
}

/** `x()` for a signal; `s.a` or `s[k]` for a store. Null for any other use. */
function readOf(reference: SgNode<TSX>, kind: StatePair["kind"]): SgNode<TSX> | null {
  if (kind === "signal") return calleeOf(reference);
  const parent = reference.parent();
  if (parent === null) return null;
  if (parent.kind() !== "member_expression" && parent.kind() !== "subscript_expression") return null;
  return parent.field("object")?.id() === reference.id() ? parent : null;
}

function insideJsx(node: SgNode<TSX>): boolean {
  const scope = runningFunction(node);
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

/**
 * The top-level store fields a setter call writes, or null when they can't
 * be read off the call: `setS("a", ...)`, `setS({ a, b })`, or a draft
 * callback that only uses its draft as `draft.a...`.
 */
function writtenKeys(call: SgNode<TSX>): Set<string> | null {
  const [first] = call.field("arguments")?.children().filter((child) => child.isNamed() && child.kind() !== "comment") ?? [];
  if (first === undefined) return null;
  const path = stringLiteralValue(first);
  if (path !== null) return new Set([path]);
  if (first.kind() === "object") {
    const keys = new Set<string>();
    for (const entry of first.children().filter((child) => child.isNamed() && child.kind() !== "comment")) {
      const key = entry.kind() === "shorthand_property_identifier" ? entry : entry.kind() === "pair" ? entry.field("key") : null;
      if (key === null) return null;
      const name = key.kind() === "property_identifier" || key.kind() === "shorthand_property_identifier" ? key.text() : stringLiteralValue(key);
      if (name === null) return null;
      keys.add(name);
    }
    return keys;
  }
  if (first.kind() !== "arrow_function" && first.kind() !== "function_expression") return null;
  const parameters = first.field("parameters")?.children().filter((child) => child.isNamed()) ?? [];
  const draft = parameters.length === 1 ? (parameters[0]!.kind() === "identifier" ? parameters[0]! : parameters[0]!.field("pattern")) : first.field("parameter");
  const body = first.field("body");
  if (draft?.kind() !== "identifier" || body?.kind() !== "statement_block") return null;
  if (body.find({ rule: { kind: "return_statement", has: { kind: "identifier" } } }) !== null) return null;
  const keys = new Set<string>();
  for (const use of body.findAll({ rule: { kind: "identifier", regex: `^${draft.text()}$` } })) {
    const key = readKey(use.parent());
    if (key === null || use.parent()!.field("object")?.id() !== use.id()) return null;
    keys.add(key);
  }
  return keys;
}

/** True when `read` is a store field read of a top-level key outside `written`. */
function untouched(written: Set<string>, read: SgNode<TSX>): boolean {
  const key = readKey(read);
  return key !== null && !written.has(key);
}

/** The field name of `s.a` or `s["a"]`, or null. */
function readKey(node: SgNode<TSX> | null): string | null {
  if (node?.kind() === "member_expression") {
    const property = node.field("property");
    return property?.kind() === "property_identifier" ? property.text() : null;
  }
  if (node?.kind() === "subscript_expression") {
    const index = node.field("index");
    return index === null ? null : stringLiteralValue(index);
  }
  return null;
}
