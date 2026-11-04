import type { SgNode } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { findImportedCalls } from "../../../../shared/analysis.ts";
import { lintHint, migrationGuide } from "../../../../shared/target.ts";

const MIGRATION_GUIDE =
  migrationGuide("createresource--async-computations--loading");

export function analyzeCreateResource(
  rootNode: SgNode<TSX>,
  context: { filename: string },
): string[] {
  const findings: string[] = [];

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
      `${filename}:${start.line + 1}:${start.column + 1} Manual review required: migrate this createResource call to async computations with Loading boundaries.
Why: Solid 2 removes createResource; async data fetching uses async computations wrapped in Loading boundaries.
Guidance: Read the complete source, fetcher, options, and every consumer of the resource tuple (data, loading, error, mutate, refetch). Replace with an async computation and wrap the consuming JSX in a Loading boundary whose fallback handles the not-ready state. Track the resource tuple destructuring sites to confirm the replacement covers every field. Make and validate that edit yourself; this analyzer never edits or runs the target project.${lintHint("removed-api")} Official migration guide: ${MIGRATION_GUIDE}`,
    );
  }

  // Resource tuple member access — only when createResource is imported
  // Only scan for tuple members when createResource is imported
  let importsCreateResource = false;
  for (const statement of rootNode.findAll({
    rule: { kind: "import_statement" },
  })) {
    const source = statement.children().find((child) => child.is("string"));
    if (!source) continue;
    const moduleName = source.text().slice(1, -1);
    if (moduleName !== "solid-js" && moduleName !== "solid-js/web") continue;
    for (const specifier of statement.findAll({
      rule: { kind: "import_specifier" },
    })) {
      if (specifier.text().trim() === "createResource") {
        importsCreateResource = true;
      }
    }
  }
  if (!importsCreateResource) return findings;

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

  for (const { property, kind, label, why, guidance } of patterns) {
    const nodes: SgNode<TSX>[] = [];
    if (kind === "call") {
      for (const call of rootNode.findAll({
        rule: { kind: "call_expression" },
      })) {
        const fn = call.children().find(
          (child) => child.kind() === "member_expression",
        );
        if (!fn) continue;
        const prop = fn.children().find(
          (child) => child.kind() === "property_identifier",
        );
        if (prop && prop.text() === property) nodes.push(call);
      }
    } else {
      for (const member of rootNode.findAll({
        rule: { kind: "member_expression" },
      })) {
        const prop = member.children().find(
          (child) => child.kind() === "property_identifier",
        );
        if (prop && prop.text() === property) nodes.push(member);
      }
    }
    for (const node of nodes) {
      const start = node.range().start;
      findings.push(
        `${context.filename}:${start.line + 1}:${start.column + 1} Manual review required: migrate this ${label}.
Why: ${why}
Guidance: ${guidance} Make and validate this migration yourself; this analyzer never edits or runs the target project.${lintHint("removed-api")} Official migration guide: ${MIGRATION_GUIDE}`,
      );
    }
  }

  return findings;
}



