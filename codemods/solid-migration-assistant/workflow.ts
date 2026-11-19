import { approval, forEachFile, jssg, shell, step } from "codemod/workflow";
import { DEPENDENCY_MAP } from "./shared/dependencies.mjs";
import { bumpManifest, bumpTsconfig } from "./shared/manifest.mjs";
import { bumpCatalogs } from "./shared/catalog.mjs";
import { byLocation, renderText } from "./shared/format.mjs";
import { ANALYSIS_STEPS, TRANSFORM_STEPS } from "./shared/steps.generated.ts";
import { MIGRATION_GUIDE_URL, SOLID_TARGET_VERSION } from "./shared/target.ts";

// The Solid 1.9 -> 2 assistant on the code-first engine (codemod/codemod#2485,
// published as codemod@2.0.0-alpha.4). The engine keeps no workflow state:
// rules return findings and rewrites as jssg data, and shell steps print
// their result as one JSON line that the workflow parses.

const OUTSIDE_PROJECT = ["**/node_modules/**", "**/dist/**", "**/build/**", "**/coverage/**"];
const SOURCES = {
  include: ["**/*.js", "**/*.jsx", "**/*.ts", "**/*.tsx"],
  exclude: [...OUTSIDE_PROJECT, "**/*.d.ts"],
};
// create-vite's Solid TypeScript template keeps jsxImportSource in
// tsconfig.app.json; tsconfig.json there only lists references.
const PROJECT_CONFIGS = {
  include: ["package.json", "tsconfig.json", "tsconfig.*.json", "jsconfig.json"],
  exclude: OUTSIDE_PROJECT,
};

type DependencyEntry = {
  name: string;
  legacy: ((range: string) => boolean) | null;
  status: "upgrade" | "replace" | "use-core" | "blocked";
  replacement: string | null;
};
// shared/dependencies.mjs is untyped JavaScript; this is its shape.
const DEPENDENCIES = DEPENDENCY_MAP as readonly DependencyEntry[];

const ECOSYSTEM = ["@solidjs/router", "@solidjs/meta", "@solidjs/start", "vinxi"];

// One stage per group of rule domains (rules/<kind>/<domain>/<rule>). `needs`
// is the dependency guard; `scan` is the file guard: rules in the stage only
// see files whose text contains one of these strings (null: every source
// file, for JSX rules that match syntax rather than imports). The steps come
// from shared/steps.generated.ts, which `pnpm generate` derives from rules/.
const STAGES: { name: string; needs: string[]; scan: string[] | null; rules: (rule: string) => boolean }[] = [
  { name: "Imports", needs: ["solid-js"], scan: ["solid-js"], rules: (r) => r.startsWith("imports/") && r !== "imports/ecosystem-apis" },
  { name: "JSX", needs: ["solid-js"], scan: null, rules: (r) => r.startsWith("jsx/") },
  {
    name: "Reactivity, lifecycle and props",
    needs: ["solid-js"],
    scan: ["solid-js"],
    rules: (r) => /^(reactivity|lifecycle|props)\//.test(r),
  },
  { name: "Stores", needs: ["solid-js"], scan: ["solid-js/store"], rules: (r) => r.startsWith("store/") },
  { name: "Router, meta and start", needs: ECOSYSTEM, scan: ECOSYSTEM, rules: (r) => r === "imports/ecosystem-apis" },
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
      // Linked and workspace entries have no version.
      if (key.startsWith("node_modules/") && typeof entry.version === "string" && !(name in resolved)) {
        resolved[name] = entry.version;
      }
    }
    return { path, resolved };
  }
  return { path, declared: { ...json.devDependencies, ...json.peerDependencies, ...json.dependencies } };
}

function major(version: string | undefined): number | undefined {
  const match = version?.match(/(\d+)\./);
  return match ? Number(match[1]) : undefined;
}

type Params = {
  /** analyze (default) reports findings; migrate also applies the rewrites. */
  mode?: string;
  /** Lint before and after with eslint-plugin-solid's v2 config (default true). */
  verify?: boolean | string;
  /** none skips the text report (the CLI renders its own from the run output). */
  report?: string;
  /**
   * After migrate, install with the project's package manager and typecheck
   * with its own TypeScript (default true).
   */
  install?: boolean | string;
};

export default async function main({ params }: { params: Params }) {
  const migrate = params.mode === "migrate";
  // --param values arrive as JSON when they parse as JSON, so false is a boolean.
  const verify = params.verify !== false && params.verify !== "false";
  const install = params.install !== false && params.install !== "false";

  const manifests = await step(
    "Read dependencies",
    forEachFile(
      { include: ["package.json", "package-lock.json"], exclude: OUTSIDE_PROJECT },
      (file) => readDependencies(file.path, file.text),
    ),
  );
  const declared: Record<string, string> = {};
  const resolved: Record<string, string> = {};
  const solidRanges: string[] = [];
  for (const m of manifests.outputs as any[]) {
    Object.assign(declared, m.declared ?? {});
    Object.assign(resolved, m.resolved ?? {});
    if (typeof m.declared?.["solid-js"] === "string") solidRanges.push(m.declared["solid-js"]);
  }

  // Guard: this workflow only knows the Solid 1 -> 2 move. In a workspace,
  // one package on Solid 1 is enough to run.
  const solid = resolved["solid-js"] ?? declared["solid-js"];
  if (solid === undefined) return { skipped: "solid-js is not a dependency of this project" };
  // A range without a version (latest, *, workspace:) goes by the lockfile.
  const onSolid2 = solidRanges.every((range) => (major(range) ?? major(resolved["solid-js"]) ?? 1) >= 2)
    && (major(resolved["solid-js"]) ?? 2) >= 2;
  if (onSolid2) return { skipped: `solid-js is already ${solid}` };

  const dependencyPlan = DEPENDENCIES.filter((d) => typeof declared[d.name] === "string")
    .filter((d) => d.legacy === null || d.legacy(declared[d.name]!))
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
    analyses: ANALYSIS_STEPS.filter((s) => stage.rules(s.rule)).map((s) => s.name),
    rewrites: TRANSFORM_STEPS.filter((s) => stage.rules(s.rule)).map((s) => s.name),
    run: stage.needs.some((name) => declared[name] !== undefined),
    files: stage.scan === null ? files.map((f) => f.path) : files.filter((f) => f.hits.some((h) => stage.scan!.includes(h))).map((f) => f.path),
  }));

  // A shell step runs where Codemod was started unless given a cwd, which is
  // relative to the target. The script prints its summary as JSON on stdout.
  const lint = async (label: string, key: string) =>
    lastJsonLine((await step(label, shell({ cwd: "." })`sh ${import.meta.dirname}/verify/eslint-solid-v2.sh ${key}`)).stdout);

  // jssg rules run on exactly the stage's files. Paths are passed as globs, so
  // brackets in route files like src/routes/[id].tsx are escaped.
  const runRule = (label: string, script: string, files: string[]) =>
    step(label, forEachFile(
      { include: files.map(literalGlob), language: "tsx" },
      jssg(script, { semanticAnalysis: "workspace" }),
    ));
  const failures: { step: string; path: string; error: string }[] = [];
  const found: any[] = [];
  const rewritten: any[] = [];

  const before = verify ? await lint("Lint with eslint-plugin-solid v2 (before)", "lintBefore") : undefined;
  let after: any;

  const analyze = async () => {
    for (const stage of plan) {
      if (!stage.run || stage.files.length === 0) continue;
      for (const rule of stage.analyses) {
        const label = `${stage.name}: ${rule}`;
        const result = await runRule(label, `./scripts/analysis/${rule}.ts`, stage.files);
        for (const entry of result.data) found.push(...((entry.data as any)?.findings ?? []));
        failures.push(...result.failures.map((f) => ({ step: label, ...f })));
      }
    }
  };

  // Migrate analyzes after the rewrites, so its findings are what they left.
  if (!migrate) await analyze();

  const projectRewrites: any[] = [];
  const dependencySkips: any[] = [];
  let afterMigrate: any = migrate ? { install: { skipped: "--no-install" }, typecheck: [] } : undefined;
  if (migrate) {
    if (blocked.length > 0) {
      await step(approval(`${blocked.join(", ")} ${blocked.length === 1 ? "has" : "have"} no Solid 2 release. Apply the source rewrites anyway?`));
    }
    for (const stage of plan) {
      if (!stage.run || stage.files.length === 0) continue;
      for (const rule of stage.rewrites) {
        const label = `${stage.name}: ${rule}`;
        const result = await runRule(label, `./scripts/transformations/${rule}.ts`, stage.files);
        for (const entry of result.data) rewritten.push(...((entry.data as any)?.rewrites ?? []));
        failures.push(...result.failures.map((f) => ({ step: label, ...f })));
      }
    }
    const project = await step(
      "Move package.json and tsconfig.json to Solid 2",
      forEachFile(PROJECT_CONFIGS, (file) => {
        if (file.path.endsWith("pnpm-workspace.yaml")) {
          const bumped = bumpCatalogs(file.text);
          if (bumped === null) return undefined;
          if (bumped.changes.length > 0) file.write(bumped.text);
          return {
            rewrites: bumped.changes.map((change: any) => ({
              rule: "project/dependencies",
              file: file.path,
              line: change.line,
              column: 1,
              message: `${change.from === null ? `Add ${change.name} ${change.to}` : `Move ${change.name} from ${change.from} to ${change.to}`} in the ${change.catalog === "" ? "default catalog" : `${change.catalog} catalog`}.`,
              guide: `${MIGRATION_GUIDE_URL}#imports-where-things-live-now`,
              catalog: change.catalog,
              name: change.name,
            })),
            skipped: bumped.skipped.map((skip: any) => ({ file: file.path, ...skip })),
          };
        }
        if (file.path.endsWith("package.json")) {
          const bumped = bumpManifest(file.text);
          if (bumped === null) return undefined;
          if (bumped.changes.length > 0) file.write(bumped.text);
          return {
            rewrites: bumped.changes.map((change: any) => ({
              rule: "project/dependencies",
              file: file.path,
              line: change.line,
              column: 1,
              message: change.from === null
                ? `Add ${change.name} ${change.to}.`
                : `Move ${change.name} from ${change.from} to ${change.to}.`,
              guide: `${MIGRATION_GUIDE_URL}#imports-where-things-live-now`,
            })),
            skipped: bumped.skipped.map((skip: any) => ({ file: file.path, ...skip })),
          };
        }
        const bumped = bumpTsconfig(file.text);
        if (bumped === null) return undefined;
        file.write(bumped.text);
        return {
          rewrites: [{
            rule: "project/jsx-import-source",
            file: file.path,
            line: bumped.line,
            column: 1,
            message: "Point jsxImportSource at @solidjs/web.",
            guide: `${MIGRATION_GUIDE_URL}#typescript-jsx-solid-js--renderer-package`,
          }],
          skipped: [],
        };
      }),
    );
    // A package.json range like "catalog:" is moved where the catalog lives,
    // so it is only left to the user when no pnpm catalog moved that package.
    const movedInCatalog = new Set(
      (project.outputs as any[]).flatMap((output) => output.rewrites).filter((rewrite: any) => rewrite.catalog !== undefined)
        .map((rewrite: any) => `${rewrite.catalog}:${rewrite.name}`),
    );
    for (const output of project.outputs as any[]) {
      projectRewrites.push(...output.rewrites.map(({ catalog, name, ...rewrite }: any) => rewrite));
      dependencySkips.push(...output.skipped.filter((skip: any) => {
        const catalog = /^catalog:(.*)$/.exec(skip.range)?.[1];
        return catalog === undefined || !movedInCatalog.has(`${catalog === "default" ? "" : catalog}:${skip.name}`);
      }));
    }
    failures.push(...project.failures.map((f) => ({ step: "Move package.json and tsconfig.json to Solid 2", ...f })));
    if (install) {
      const installed = await step("Install and typecheck", shell({ cwd: "." })`node ${import.meta.dirname}/verify/after-migrate.mjs install`);
      // A dry run skips shell steps; the report then says to install by hand.
      if (!installed.skipped) afterMigrate = lastJsonLine(installed.stdout) ?? { install: { ok: false, error: "The install step printed no result." }, typecheck: [] };
    }
    if (verify) after = await lint("Lint with eslint-plugin-solid v2 (after)", "lintAfter");
    await analyze();
  }

  const findings = byLocation(found);
  const rewrites = byLocation([...rewritten, ...projectRewrites]);

  // Each finding names the eslint-plugin-solid rules that keep reporting it.
  // removed-api reports the import rather than each call, so agreement is
  // checked per file, and disagreements are listed by rule.
  const lintSites = new Set<string>(before?.sites ?? []);
  const withLint = findings.filter((f) => f.lint.length > 0);
  const unconfirmed = withLint.filter((f) => !f.lint.some((rule: string) => lintSites.has(`${f.file}\tsolid/${rule}`)));

  if (params.report !== "none") {
    const text = renderText({ findings, rewrites, afterMigrate, solidVersion: SOLID_TARGET_VERSION });
    if (text !== "") console.log(text);
  }
  if (params.report !== "none" && dependencySkips.length > 0) {
    console.log(`Left these dependency ranges as they are; move them by hand:\n${dependencySkips.map((s) => `  ${s.file}: ${s.name} ${JSON.stringify(s.range)} (${s.reason})`).join("\n")}`);
  }
  if (failures.length > 0) console.log(`${failures.length} file(s) failed in jssg steps; see failures in the run output.`);
  if (verify) console.log(`eslint-plugin-solid v2: ${before?.total ?? "?"} messages before${after ? `, ${after.total} after` : ""}; ${withLint.length - unconfirmed.length} of ${withLint.length} findings confirmed by the linter.`);

  return {
    solid,
    stages: plan.map((s) => ({ name: s.name, ran: s.run && s.files.length > 0, files: s.files.length })),
    dependencies: dependencyPlan,
    blocked,
    dependencySkips,
    unknownSolidPackages: unknown,
    findingsByRule: tally(findings.map((f) => f.rule)),
    rewritesByRule: tally(rewrites.map((r) => r.rule)),
    findings,
    rewrites,
    ...(afterMigrate ? { afterMigrate } : {}),
    failures: [...manifests.failures.map((f) => ({ step: "Read dependencies", ...f })), ...failures],
    lint: verify ? {
      before: before?.byRule,
      after: after?.byRule,
      findingsTheLinterAlsoReports: `${withLint.length - unconfirmed.length} of ${withLint.length}`,
      findingsTheLinterMisses: tally(unconfirmed.map((f) => `${f.rule} (expects ${f.lint.join(", ")})`)),
    } : "skipped",
  };
}

/**
 * The JSON a shell step printed as its last line, or undefined when there is
 * none: a dry run skips shell steps, and only the last 1 MiB of output comes
 * back.
 */
function lastJsonLine(stdout: string | undefined): any {
  const line = stdout?.trimEnd().split("\n").pop();
  if (!line) return undefined;
  try {
    return JSON.parse(line);
  } catch {
    return undefined;
  }
}

function literalGlob(path: string): string {
  return path.replace(/[[\]*?{}]/g, (c) => `[${c}]`);
}

function tally(values: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const value of values) counts[value] = (counts[value] ?? 0) + 1;
  return counts;
}
