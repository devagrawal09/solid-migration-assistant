import type { SgNode } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { findImportedCalls } from "../../../../shared/analysis.ts";
import { migrationGuide } from "../../../../shared/target.ts";
import { finding, type RuleFinding } from "../../../../shared/finding.ts";
import { referencesOf } from "../../../../shared/semantic.ts";

const MIGRATION_GUIDE =
  migrationGuide("createresource--async-computations--loading");

export function analyzeCreateResource(
  rootNode: SgNode<TSX>,
  context: { filename: string },
): RuleFinding[] {
  const findings: RuleFinding[] = [];

  // createResource() call sites
  for (const { call, filename } of findImportedCalls(
    rootNode,
    ["solid-js", "solid-js/web"],
    "createResource",
  ).filter(
    ({ argumentNodes }) =>
      argumentNodes.length >= 1 &&
      !argumentNodes.some((a) => a.kind() === "spread_element"),
  )) {
    const start = call.range().start;
    findings.push(
      finding(filename, start, {
        severity: "build",
        headline: `Migrate this createResource call to async computations with Loading boundaries.`,
        why: `Solid 2 removes createResource; async data fetching uses async computations wrapped in Loading boundaries.`,
        guidance: `Read the complete source, fetcher, options, and every consumer of the resource tuple (data, loading, error, mutate, refetch). Replace with an async computation and wrap the consuming JSX in a Loading boundary whose fallback handles the not-ready state. Track the resource tuple destructuring sites to confirm the replacement covers every field.`,
        lint: ["removed-api"],
        guide: MIGRATION_GUIDE,
      }),
    );
  }

  // Resource tuple members, resolved from the bindings each createResource
  // call introduces: `const [data, { refetch, mutate }] = createResource(...)`
  // or `const [data, actions] = createResource(...)`. Only references to those
  // bindings are reported, so `console.error`, `toast.error`, or an unrelated
  // object's `.loading` never match (they did when this was a text match).
  const accessors: SgNode<TSX>[] = [];
  const actionObjects: SgNode<TSX>[] = [];
  const actionFunctions = new Map<string, SgNode<TSX>[]>();
  for (const { call } of findImportedCalls(rootNode, ["solid-js", "solid-js/web"], "createResource")) {
    const declarator = call.parent();
    if (declarator === null || declarator.kind() !== "variable_declarator") continue;
    const pattern = declarator.field("name");
    if (pattern === null || pattern.kind() !== "array_pattern") continue;
    const elements = pattern.children().filter((child) => child.isNamed() && child.kind() !== "comment");
    const [accessor, actions] = elements;
    if (accessor !== undefined && accessor.kind() === "identifier") accessors.push(accessor);
    if (actions === undefined) continue;
    if (actions.kind() === "identifier") actionObjects.push(actions);
    if (actions.kind() === "object_pattern") {
      for (const property of actions.children()) {
        if (property.kind() === "shorthand_property_identifier_pattern") {
          actionFunctions.set(property.text(), [...(actionFunctions.get(property.text()) ?? []), property]);
        } else if (property.kind() === "pair_pattern") {
          const key = property.field("key");
          const value = property.field("value");
          if (key !== null && value !== null && value.kind() === "identifier") {
            actionFunctions.set(key.text(), [...(actionFunctions.get(key.text()) ?? []), value]);
          }
        }
      }
    }
  }
  if (accessors.length === 0 && actionObjects.length === 0 && actionFunctions.size === 0) return findings;

  const patterns = [
    {
      property: "loading",
      kind: "access" as const,
      label: ".loading access",
      why: "Solid 2 removes the resource.loading boolean; use Loading for initial not-ready UI and isPending for in-flight change indicators.",
      guidance:
        "If this reads the initial loading state, wrap the consuming JSX in a <Loading fallback={...}> boundary. If this reads an in-flight pending state (after an input change), replace with isPending(() => resource()).",
    },
    {
      property: "error",
      kind: "access" as const,
      label: ".error access",
      why: "Solid 2 removes the resource.error field; use Errored boundaries for component-level error UI or the effect error option for programmatic handling.",
      guidance:
        "Replace this error read with a structural boundary (<Errored fallback={...}>) or move the error handling to an effect's error option. The error is now an Error object — use err().message in Errored fallbacks.",
    },
    {
      property: "refetch",
      kind: "call" as const,
      label: ".refetch() call",
      why: "Solid 2 replaces resource.refetch() with refresh(resource) for explicit recomputation.",
      guidance:
        "Replace this refetch call with refresh(resource) where resource is the async computation or derived store that replaces createResource.",
    },
    {
      property: "mutate",
      kind: "call" as const,
      label: ".mutate() call",
      why: "Solid 2 replaces resource.mutate() with createOptimisticStore and action for optimistic updates.",
      guidance:
        "Replace this mutate call with the optimistic mutation pattern: wrap the server write in action(), use createOptimisticStore for the optimistic UI, and call refresh() after the action completes.",
    },
  ];

  const memberOf = (reference: SgNode<TSX>): SgNode<TSX> | null => {
    const member = reference.parent();
    if (member === null || member.kind() !== "member_expression") return null;
    if (member.field("object")?.id() !== reference.id()) return null;
    return member;
  };
  const callOf = (callee: SgNode<TSX>): SgNode<TSX> | null => {
    const call = callee.parent();
    if (call === null || call.kind() !== "call_expression") return null;
    return call.field("function")?.id() === callee.id() ? call : null;
  };

  for (const { property, kind, label, why, guidance } of patterns) {
    const nodes = new Map<string, { node: SgNode<TSX>; filename: string }>();
    const record = (node: SgNode<TSX>, filename: string) => nodes.set(`${filename}:${node.id()}`, { node, filename });
    const bindings = kind === "access" ? accessors : [...accessors, ...actionObjects];
    for (const binding of bindings) {
      for (const fileReferences of referencesOf(binding)) {
        const filename = fileReferences.root.relativeFilename().replaceAll("\\", "/");
        for (const reference of fileReferences.nodes) {
          const member = memberOf(reference);
          if (member === null) continue;
          if (member.field("property")?.text() !== property) continue;
          if (kind === "access") record(member, filename);
          else {
            const call = callOf(member);
            if (call !== null) record(call, filename);
          }
        }
      }
    }
    if (kind === "call") {
      for (const binding of actionFunctions.get(property) ?? []) {
        for (const fileReferences of referencesOf(binding)) {
          const filename = fileReferences.root.relativeFilename().replaceAll("\\", "/");
          for (const reference of fileReferences.nodes) {
            const call = callOf(reference);
            if (call !== null) record(call, filename);
          }
        }
      }
    }
    for (const { node, filename } of [...nodes.values()].sort((left, right) => {
      const a = left.node.range().start;
      const b = right.node.range().start;
      return left.filename.localeCompare(right.filename) || a.line - b.line || a.column - b.column;
    })) {
      const start = node.range().start;
      findings.push(
        finding(filename, start, {
        severity: "build",
        headline: `Migrate this ${label}.`,
        why: `${why}`,
        guidance: `${guidance}`,
        lint: ["removed-api"],
        guide: MIGRATION_GUIDE,
      }),
      );
    }
  }

  return findings;
}



