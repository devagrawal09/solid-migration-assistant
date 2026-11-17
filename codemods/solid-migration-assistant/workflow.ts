import { approval, forEachFile, jssg, shell, step } from "codemod/workflow";
import { DEPENDENCY_MAP } from "./shared/dependencies.mjs";
import { bumpManifest, bumpTsconfig } from "./shared/manifest.mjs";
import { byLocation, renderText } from "./shared/format.mjs";
import { ANALYSIS_STEPS, TRANSFORM_STEPS } from "./shared/steps.generated.ts";
import { MIGRATION_GUIDE_URL, SOLID_TARGET_VERSION } from "./shared/target.ts";

// The Solid 1.9 -> 2 RC assistant on the code-first engine with step-scoped
// state (codemod/codemod#2489 at a03dc72, unpublished): rules return their
// findings and rewrites as jssg data, and the report reads step results.

const SOURCES = {
  include: ["**/*.js", "**/*.jsx", "**/*.ts", "**/*.tsx"],
  exclude: ["**/node_modules/**", "**/dist/**", "**/build/**", "**/coverage/**", "**/*.d.ts"],
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
};

export default async function main({ params }: { params: Params }) {
  const migrate = params.mode === "migrate";
  // --param values arrive as JSON when they parse as JSON, so false is a boolean.
  const verify = params.verify !== false && params.verify !== "false";

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

  // The shell runs in the target (a cwd is relative to it); the lint script
  // writes its summary to STATE_OUTPUTS, which comes back as result.state.
  const lint = async (label: string, key: string) =>
    (await step(label, shell({ cwd: "." })`sh ${import.meta.dirname}/verify/eslint-solid-v2.sh ${key}`)).state?.[key] as any;

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

  // Migrate mode only rewrites, as the old transform workflow did: findings
  // computed before the rewrites would list sites the rewrites just fixed.
  for (const stage of migrate ? [] : plan) {
    if (!stage.run || stage.files.length === 0) continue;
    for (const rule of stage.analyses) {
      const label = `${stage.name}: ${rule}`;
      const result = await runRule(label, `./scripts/analysis/${rule}.ts`, stage.files);
      found.push(...rows(result.data?.findings).map((row) => ({ ...row, line: Number(row.line), column: Number(row.column), lint: row.lint === "" ? [] : row.lint.split(",") })));
      failures.push(...result.failures.map((f) => ({ step: label, ...f })));
    }
  }
  const findings = byLocation(found);

  const projectRewrites: any[] = [];
  const dependencySkips: any[] = [];
  if (migrate) {
    if (blocked.length > 0) {
      await step(approval(`${blocked.join(", ")} ${blocked.length === 1 ? "has" : "have"} no Solid 2 release. Apply the source rewrites anyway?`));
    }
    for (const stage of plan) {
      if (!stage.run || stage.files.length === 0) continue;
      for (const rule of stage.rewrites) {
        const label = `${stage.name}: ${rule}`;
        const result = await runRule(label, `./scripts/transformations/${rule}.ts`, stage.files);
        rewritten.push(...rows(result.data?.rewrites).map((row) => ({ ...row, line: Number(row.line), column: Number(row.column) })));
        failures.push(...result.failures.map((f) => ({ step: label, ...f })));
      }
    }
    const project = await step(
      "Move package.json and tsconfig.json to Solid 2",
      forEachFile({ include: ["package.json", "tsconfig.json"] }, (file) => {
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
    for (const output of project.outputs as any[]) {
      projectRewrites.push(...output.rewrites);
      dependencySkips.push(...output.skipped);
    }
    failures.push(...project.failures.map((f) => ({ step: "Move package.json and tsconfig.json to Solid 2", ...f })));
    if (verify) after = await lint("Lint with eslint-plugin-solid v2 (after)", "lintAfter");
  }

  const rewrites = byLocation([...rewritten, ...projectRewrites]);

  // Each finding names the eslint-plugin-solid rules that keep reporting it.
  // removed-api reports the import rather than each call, so agreement is
  // checked per file, and disagreements are listed by rule.
  const lintSites = new Set((before?.messages ?? []).map((m: any) => `${m.file}:${m.rule}`));
  const withLint = findings.filter((f) => f.lint.length > 0);
  const unconfirmed = withLint.filter((f) => !f.lint.some((rule: string) => lintSites.has(`${f.file}:solid/${rule}`)));

  if (params.report !== "none") {
    const text = renderText({ findings, rewrites, solidVersion: SOLID_TARGET_VERSION });
    if (text !== "") console.log(text);
  }
  if (params.report !== "none" && dependencySkips.length > 0) {
    console.log(`Left these dependency ranges as they are; move them by hand:\n${dependencySkips.map((s) => `  ${s.file}: ${s.name} ${JSON.stringify(s.range)} (${s.reason})`).join("\n")}`);
  }
  if (params.report !== "none" && projectRewrites.some((r) => r.rule === "project/dependencies")) {
    console.log("package.json changed, but nothing was installed and no lockfile was touched. Run your package manager's install next (npm install, pnpm install, yarn or bun install).");
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
 * A jssg step's data list as the rows the transforms returned. The step adds
 * up rows with identical labels, which is the deduplication the report wants
 * (an element with a closing tag reports one rewrite for two edits), and
 * hands every label back as a string.
 */
function rows(data: { cardinality: Record<string, string>; count: number }[] | undefined): Record<string, string>[] {
  return (data ?? []).map((entry) => entry.cardinality);
}

function literalGlob(path: string): string {
  return path.replace(/[[\]*?{}]/g, (c) => `[${c}]`);
}

function tally(values: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const value of values) counts[value] = (counts[value] ?? 0) + 1;
  return counts;
}
