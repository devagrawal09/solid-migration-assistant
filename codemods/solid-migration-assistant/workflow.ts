import { approval, forEachFile, getState, jssg, shell, step } from "codemod:workflow";

// Prototype of the Solid 1.9 -> 2 RC assistant on the code-first engine
// (codemod/codemod#2485). The workflow module may only import from
// codemod:workflow on #2485, so the tables below are inlined copies of
// shared/dependencies.mjs and the generated rule list.

const SOURCES = {
  include: ["**/*.js", "**/*.jsx", "**/*.ts", "**/*.tsx"],
  exclude: ["**/node_modules/**", "**/dist/**", "**/build/**", "**/coverage/**", "**/*.d.ts"],
};
const FINDINGS = "solid-migration-assistant-guidance";
const REWRITES = "solid-migration-assistant-transform-report";

// What each common Solid 1 dependency needs on Solid 2 (shared/dependencies.mjs,
// verified 2026-11-09). `legacy` is a pattern a Solid 2 range matches; a
// declared range that does not match it is still on the Solid 1 line.
const DEPENDENCIES: { name: string; status: string; solid2?: string; replacement?: string }[] = [
  { name: "@solidjs/router", status: "upgrade", solid2: "2\\.0\\.0-next", replacement: "@solidjs/router@2.0.0-next.44" },
  { name: "@solidjs/meta", status: "use-core", solid2: "1\\.0\\.0-next", replacement: "useHead from @solidjs/web" },
  { name: "@solidjs/start", status: "replace", replacement: "@solidjs/vite-plugin start mode" },
  { name: "vinxi", status: "replace", replacement: "vite with @solidjs/vite-plugin" },
  { name: "solid-start", status: "replace", replacement: "@solidjs/vite-plugin start mode" },
  { name: "vite-plugin-solid", status: "replace", replacement: "@solidjs/vite-plugin@3.0.0-next.57" },
  { name: "babel-preset-solid", status: "replace", replacement: "@solidjs/babel-plugin@2.0.0-rc.21" },
  { name: "@solidjs/testing-library", status: "upgrade", solid2: "(^|[^0-9.])1\\.0\\.0-", replacement: "@solidjs/testing-library@1.0.0-rc.2" },
  { name: "solid-testing-library", status: "replace", replacement: "@solidjs/testing-library@1.0.0-rc.2" },
  { name: "@solid-primitives/storage", status: "upgrade", solid2: "(^|[^0-9.])([5-9]|\\d\\d)\\.", replacement: "@solid-primitives/storage@5.0.0-next.7" },
  { name: "@solid-primitives/event-listener", status: "upgrade", solid2: "(^|[^0-9.])([3-9]|\\d\\d)\\.", replacement: "@solid-primitives/event-listener@3.0.0-next.9" },
  { name: "@solid-primitives/media", status: "upgrade", solid2: "(^|[^0-9.])([4-9]|\\d\\d)\\.", replacement: "@solid-primitives/media@4.0.0-next.6" },
  { name: "@solid-primitives/scheduled", status: "upgrade", solid2: "(^|[^0-9.])([2-9]|\\d\\d)\\.", replacement: "@solid-primitives/scheduled@2.0.0-next.4" },
  { name: "@tanstack/solid-query", status: "upgrade", solid2: "(^|[^0-9.])([6-9]|\\d\\d)\\.", replacement: "@tanstack/solid-query@6.0.0-rc.5" },
  { name: "@tanstack/solid-router", status: "upgrade", solid2: "(^|[^0-9.])([2-9]|\\d\\d)\\.", replacement: "@tanstack/solid-router@2.0.0-rc.10" },
  { name: "@kobalte/core", status: "blocked" },
  { name: "@tanstack/solid-form", status: "blocked" },
  { name: "@tanstack/solid-virtual", status: "blocked" },
  { name: "@tanstack/solid-table", status: "blocked" },
  { name: "solid-icons", status: "blocked" },
  { name: "@modular-forms/solid", status: "blocked" },
  { name: "@felte/solid", status: "blocked" },
  { name: "solid-transition-group", status: "blocked" },
];

const ECOSYSTEM = ["@solidjs/router", "@solidjs/meta", "@solidjs/start", "vinxi"];

// One stage per rule domain. `needs` is the dependency guard; `scan` is the
// file guard: rules in the stage only see files whose text contains one of
// these strings (null: every source file, for JSX rules that match syntax
// rather than imports).
const STAGES: { name: string; needs: string[]; scan: string[] | null; analyses: string[]; rewrites: string[] }[] = [
  {
    name: "Imports",
    needs: ["solid-js"],
    scan: ["solid-js"],
    analyses: ["analyzeBeta32SubpathImports", "analyzeJsxTypeImports", "analyzeWebImport"],
    rewrites: ["relocateJsxTypes", "relocateLegacySubpaths", "relocateWebPackage"],
  },
  {
    name: "JSX",
    needs: ["solid-js"],
    scan: null,
    analyses: [
      "analyzeJsxClassListAttributes", "analyzeJsxComponentRenames", "analyzeContextProvider",
      "analyzeDomAttrNamespaces", "analyzeDomEventNamespaces", "analyzeDomLowercaseEvents",
      "analyzeDomUseDirective", "analyzeDynamicComponent", "analyzeRefCallbackScope",
    ],
    rewrites: ["rewriteClassListToClass", "rewriteContextProvider", "rewriteIndexToFor", "rewriteLowercaseEventHandlers"],
  },
  {
    name: "Reactivity, lifecycle and props",
    needs: ["solid-js"],
    scan: ["solid-js"],
    analyses: [
      "analyzeOnCleanup", "analyzeOnMount", "analyzeMergeProps", "analyzeSplitProps", "analyzeBatch",
      "analyzeCreateComputed", "analyzeCreateDynamic", "analyzeCreateEffect", "analyzeCreateMemo",
      "analyzeCreateResource", "analyzeCreateSelector", "analyzeOnError", "analyzeCatchError",
      "analyzeResetErrorBoundaries", "analyzeFrom", "analyzeObservable", "analyzeIndexArray",
      "analyzeNestedCreateRoot", "analyzeOnHelper", "analyzeStartTransition", "analyzeUseTransition",
      "analyzeCreateDeferred", "analyzeEqualFn", "analyzeGetListener", "analyzeWriteSignal",
      "analyzeEnableScheduling",
    ],
    rewrites: ["rewriteOnHelper"],
  },
  {
    name: "Stores",
    needs: ["solid-js"],
    scan: ["solid-js/store"],
    analyses: ["analyzeCreateMutable", "analyzeModifyMutable", "analyzeProduce", "analyzeStoreSetterCalls", "analyzeUnwrap"],
    rewrites: ["rewriteStoreSetterLiteralPaths"],
  },
  {
    name: "Router, meta and start",
    needs: ECOSYSTEM,
    scan: ECOSYSTEM,
    analyses: ["analyzeEcosystemImports"],
    rewrites: [],
  },
];

// Stand-in for the dependency analysis task being built on #2485. It reads
// declared ranges from package.json and resolved versions from
// package-lock.json; the real task adds pnpm/yarn lockfiles, workspaces and
// the transitive graph, and should replace this function one for one.
function readDependencies(path: string, text: string) {
  const json = JSON.parse(text);
  if (path.endsWith("package-lock.json")) {
    const resolved: Record<string, string> = {};
    for (const [key, entry] of Object.entries<any>(json.packages ?? {})) {
      const name = key.replace(/^.*node_modules\//, "");
      if (key.startsWith("node_modules/") && !(name in resolved)) resolved[name] = entry.version;
    }
    return { path, resolved };
  }
  return { path, declared: { ...json.devDependencies, ...json.peerDependencies, ...json.dependencies } };
}

function major(version: string | undefined): number | undefined {
  const match = version?.match(/(\d+)\./);
  return match ? Number(match[1]) : undefined;
}

export default async function main({ params }: { params: { mode?: string; verify?: string } }) {
  const migrate = params.mode === "migrate";
  const verify = params.verify !== "false";

  const manifests = await step(
    "Read dependencies",
    forEachFile(
      { include: ["package.json", "package-lock.json"] },
      (file) => readDependencies(file.path, file.text),
    ),
  );
  const declared: Record<string, string> = {};
  const resolved: Record<string, string> = {};
  for (const m of manifests.outputs as any[]) {
    Object.assign(declared, m.declared ?? {});
    Object.assign(resolved, m.resolved ?? {});
  }

  // Guard: this workflow only knows the Solid 1 -> 2 RC move.
  const solid = resolved["solid-js"] ?? declared["solid-js"];
  if (solid === undefined) return { skipped: "solid-js is not a dependency of this project" };
  if ((major(solid) ?? 1) >= 2) return { skipped: `solid-js is already ${solid}` };

  const dependencyPlan = DEPENDENCIES.filter((d) => declared[d.name] !== undefined)
    .filter((d) => d.solid2 === undefined || !new RegExp(d.solid2).test(declared[d.name]))
    .map((d) => ({ name: d.name, declared: declared[d.name], resolved: resolved[d.name], status: d.status, replacement: d.replacement }));
  const blocked = dependencyPlan.filter((d) => d.status === "blocked").map((d) => d.name);
  const unknown = Object.keys(declared).filter(
    (name) => /solid/.test(name) && name !== "solid-js" && !DEPENDENCIES.some((d) => d.name === name),
  );

  const scanned = await step(
    "Find files each stage needs",
    forEachFile(SOURCES, (file) => {
      const hits = STAGES.flatMap((stage) => stage.scan ?? []).filter((needle) => file.text.includes(needle));
      return { path: file.path, hits: [...new Set(hits)] };
    }),
  );
  const files = scanned.outputs as { path: string; hits: string[] }[];
  const plan = STAGES.map((stage) => ({
    ...stage,
    run: stage.needs.some((name) => declared[name] !== undefined),
    files: stage.scan === null ? files.map((f) => f.path) : files.filter((f) => f.hits.some((h) => stage.scan!.includes(h))).map((f) => f.path),
  }));

  const lint = async (label: string, key: string) =>
    step(label, shell(`sh "$CODEMOD_PATH/verify/eslint-solid-v2.sh" ${key}`));

  if (verify) await lint("Lint with eslint-plugin-solid v2 (before)", "lintBefore");

  for (const stage of plan) {
    if (!stage.run || stage.files.length === 0) continue;
    for (const rule of stage.analyses) {
      await step(`${stage.name}: ${rule}`, jssg(`./scripts/analysis/${rule}.ts`, {
        files: stage.files, language: "tsx", semanticAnalysis: "workspace",
      }));
    }
  }
  const findings = (getState(FINDINGS) ?? []) as any[];

  if (migrate) {
    if (blocked.length > 0) {
      await step(approval(`${blocked.join(", ")} ${blocked.length === 1 ? "has" : "have"} no Solid 2 release. Apply the source rewrites anyway?`));
    }
    for (const stage of plan) {
      if (!stage.run || stage.files.length === 0) continue;
      for (const rule of stage.rewrites) {
        await step(`${stage.name}: ${rule}`, jssg(`./scripts/transformations/${rule}.ts`, {
          files: stage.files, language: "tsx", semanticAnalysis: "workspace",
        }));
      }
    }
    if (verify) await lint("Lint with eslint-plugin-solid v2 (after)", "lintAfter");
  }

  const rewrites = (getState(REWRITES) ?? []) as any[];
  const before = getState("lintBefore") as any;
  const after = getState("lintAfter") as any;

  // Each finding names the eslint-plugin-solid rules that keep reporting it.
  // removed-api reports the import rather than each call, so agreement is
  // checked per file, and disagreements are listed by rule.
  const lintSites = new Set((before?.messages ?? []).map((m: any) => `${m.file}:${m.rule}`));
  const withLint = findings.filter((f) => f.lint.length > 0);
  const unconfirmed = withLint.filter((f) => !f.lint.some((rule: string) => lintSites.has(`${f.file}:solid/${rule}`)));

  return {
    solid,
    stages: plan.map((s) => ({ name: s.name, ran: s.run && s.files.length > 0, files: s.files.length })),
    dependencies: dependencyPlan,
    blocked,
    unknownSolidPackages: unknown,
    findings: findings.length,
    findingsByRule: tally(findings.map((f) => f.rule)),
    rewrites: rewrites.length,
    rewritesByRule: tally(rewrites.map((r) => r.rule)),
    lint: verify ? {
      before: before?.byRule,
      after: after?.byRule,
      findingsTheLinterAlsoReports: `${withLint.length - unconfirmed.length} of ${withLint.length}`,
      findingsTheLinterMisses: tally(unconfirmed.map((f) => `${f.rule} (expects ${f.lint.join(", ")})`)),
    } : "skipped",
  };
}

function tally(values: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const value of values) counts[value] = (counts[value] ?? 0) + 1;
  return counts;
}
