import { parse } from "codemod/ast-grep";
import { dependencyGraph } from "codemod/deps";
import { approval, forEachFile, shell, step, type WorkflowContext } from "codemod/workflow";
import { ANALYSES, TRANSFORMS } from "./shared/callbacks.generated.ts";
import { DEPENDENCY_MAP } from "./shared/dependencies.mjs";
import { bumpManifest, bumpTsconfig } from "./shared/manifest.mjs";
import { bumpBabelConfig } from "./shared/babel.mjs";
import { bumpCatalogs, catalogPlan } from "./shared/catalog.mjs";
import { byLocation, renderText } from "./shared/format.mjs";
import { babelConfigFindings, configFindings, manifestFindings } from "./shared/project.mjs";
import { ANALYSIS_STEPS, TRANSFORM_STEPS } from "./shared/steps.generated.ts";
import { MIGRATION_GUIDE_URL, SOLID_TARGET_VERSION } from "./shared/target.ts";

// The Solid 1.9 -> 2 assistant on the code-first engine (codemod 2.0.0-alpha.6).
// The engine keeps no workflow state: rules are forEachFile callbacks that
// return their findings and rewrites, and shell steps print their result as
// one JSON line that the workflow parses.

const OUTSIDE_PROJECT = ["**/node_modules/**", "**/dist/**", "**/build/**", "**/coverage/**"];
const SOURCES = {
  include: ["**/*.js", "**/*.jsx", "**/*.ts", "**/*.tsx"],
  exclude: [...OUTSIDE_PROJECT, "**/*.d.ts"],
};
// create-vite's Solid TypeScript template keeps jsxImportSource in
// tsconfig.app.json; tsconfig.json there only lists references.
const PROJECT_CONFIGS = {
  include: ["**/package.json", "**/tsconfig.json", "**/tsconfig.*.json", "**/jsconfig.json"],
  exclude: OUTSIDE_PROJECT,
};
// Build tool configs, which SOURCES leaves out when they are .mjs, .cjs,
// .mts or .cts files (lucide's rollup.config.mjs, vitest.config.mts), and
// Babel's file-relative JavaScript configs, which it leaves out by name.
const BUILD_CONFIGS = {
  include: [
    ...["vite", "vitest", "rollup", "tsup", "tsdown", "esbuild", "babel", "webpack", "app"].flatMap((tool) =>
      ["js", "mjs", "cjs", "ts", "mts", "cts"].map((extension) => `**/${tool}.config.${extension}`),
    ),
    ...["js", "mjs", "cjs"].map((extension) => `**/.babelrc.${extension}`),
  ],
  exclude: OUTSIDE_PROJECT,
  containing: "solid",
};
// Babel's JSON configs, which the rules can't parse as TSX (shared/babel.mjs).
const BABEL_JSON_CONFIGS = {
  include: ["**/.babelrc", "**/.babelrc.json", "**/babel.config.json"],
  exclude: OUTSIDE_PROJECT,
  containing: "solid",
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
// Source files that import a renamed package; build configs always run.
const RENAMED = ["vite-plugin-solid", "solid-testing-library"];

// One stage per group of rule domains (rules/<kind>/<domain>/<rule>). `needs`
// is the dependency guard; `scan` is the file guard: rules in the stage only
// see files whose text contains one of these strings (null: every source
// file, for JSX rules that match syntax rather than imports). The steps come
// from shared/steps.generated.ts, which `pnpm generate` derives from rules/.
// `configs` adds the build config files (BUILD_CONFIGS) to the stage's files;
// with `imports`, `scan` names modules a file must import.
const STAGES: { name: string; needs: string[]; scan: string[] | null; configs?: boolean; imports?: true; rules: (rule: string) => boolean }[] = [
  { name: "Imports", needs: ["solid-js"], scan: ["solid-js"], rules: (r) => r.startsWith("imports/") && r !== "imports/ecosystem-apis" },
  { name: "Context", needs: ["solid-js"], scan: ["solid-js"], rules: (r) => r.startsWith("context/") },
  { name: "JSX", needs: ["solid-js"], scan: null, rules: (r) => r.startsWith("jsx/") },
  {
    name: "Reactivity, lifecycle and props",
    needs: ["solid-js"],
    scan: ["solid-js"],
    rules: (r) => /^(reactivity|lifecycle|props)\//.test(r),
  },
  // The store rules only follow bindings imported from solid-js/store, so a
  // file needs an import statement of it, not just the text.
  { name: "Stores", needs: ["solid-js"], scan: ["solid-js/store"], imports: true, rules: (r) => r.startsWith("store/") },
  { name: "Router, meta and start", needs: ECOSYSTEM, scan: ECOSYSTEM, rules: (r) => r === "imports/ecosystem-apis" },
  { name: "Build tooling", needs: ["solid-js"], scan: RENAMED, configs: true, rules: (r) => r.startsWith("tooling/") },
];

// Declared ranges come from package.json; installed versions come from the
// root lockfile (npm, pnpm or yarn) through dependencyGraph.
const LOCKFILES = ["package-lock.json", "pnpm-lock.yaml", "yarn.lock"];

function readDependencies(path: string, text: string) {
  // The workspace file is kept as text for the project checks' catalogs.
  if (path.endsWith("pnpm-workspace.yaml")) return { path, workspaceYaml: text };
  if (LOCKFILES.includes(path)) return { path, lockfile: true };
  if (!path.endsWith("package.json")) return undefined;
  const json = JSON.parse(text);
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

export default async function main({ params }: WorkflowContext<Params>) {
  const migrate = params.mode === "migrate";
  // --param values arrive as JSON when they parse as JSON, so false is a boolean.
  const verify = params.verify !== false && params.verify !== "false";
  const install = params.install !== false && params.install !== "false";

  const manifests = await step(
    "Read dependencies",
    forEachFile(
      { include: ["package.json", "pnpm-workspace.yaml", ...LOCKFILES], exclude: OUTSIDE_PROJECT },
      (file) => readDependencies(file.path, file.text),
    ),
  );
  // What each of the project's packages resolves a dependency to, root first,
  // then any installed version (solid-js through a meta-framework).
  // dependencyGraph fails the step without a lockfile, so it only runs with one.
  const resolved: Record<string, string> = !manifests.outputs.some((m) => m.lockfile) ? {} : await step(
    "Read installed versions",
    dependencyGraph((g) => {
      const versions: Record<string, string> = {};
      const edges = g.workspaces().sort((a, b) => (a.dir ?? "").length - (b.dir ?? "").length).flatMap((w) => w.dependencies());
      for (const edge of edges) if (edge.to && !(edge.name in versions)) versions[edge.name] = edge.to.version;
      for (const node of g.nodes()) if (!node.local && !(node.name in versions)) versions[node.name] = node.version;
      return versions;
    }),
  );
  const declared: Record<string, string> = {};
  const solidRanges: string[] = [];
  let workspaceYaml = "";
  for (const m of manifests.outputs as any[]) {
    Object.assign(declared, m.declared ?? {});
    if (typeof m.declared?.["solid-js"] === "string") solidRanges.push(m.declared["solid-js"]);
    if (typeof m.workspaceYaml === "string" && m.path === "pnpm-workspace.yaml") workspaceYaml = m.workspaceYaml;
  }

  // Guard: this workflow only knows the Solid 1 -> 2 move. In a workspace,
  // one package on Solid 1 is enough to run. Codemod prints nothing about a
  // workflow that returns early, so the report says why.
  const skip = (reason: string) => {
    if (params.report !== "none") {
      console.log(`[solid-migration-assistant] Nothing to ${migrate ? "migrate" : "analyze"}: ${reason}. This workflow moves Solid 1.9 projects to Solid ${SOLID_TARGET_VERSION}, and everything it detects or rewrites is Solid 1 code, so it scanned no source files. This is not proof that the project is ready for Solid 2; run its own type, build, and test checks.`);
    }
    return { skipped: reason };
  };
  const solid = resolved["solid-js"] ?? declared["solid-js"];
  if (solid === undefined) return skip("solid-js is not a dependency of this project");
  // A range without a version (latest, *, workspace:) goes by the lockfile.
  const onSolid2 = solidRanges.every((range) => (major(range) ?? major(resolved["solid-js"]) ?? 1) >= 2)
    && (major(resolved["solid-js"]) ?? 2) >= 2;
  if (onSolid2) return skip(`solid-js is already ${solid}`);

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
      const needles = [...new Set(STAGES.flatMap((stage) => stage.scan ?? []))].filter((needle) => file.text.includes(needle));
      const modules = STAGES.filter((stage) => stage.imports).flatMap((stage) => stage.scan ?? []);
      // Parsed only when the text names a module a stage must see imported.
      const imported = needles.some((needle) => modules.includes(needle))
        ? parse(file, { language: "tsx" }).root().findAll({ rule: { kind: "import_statement" } }).map((node) => node.field("source")?.text().slice(1, -1))
        : [];
      return { path: file.path, hits: needles.filter((needle) => !modules.includes(needle) || imported.includes(needle)) };
    }),
  );
  const files = scanned.outputs as { path: string; hits: string[] }[];
  const configs = await step("Find build configs", forEachFile(BUILD_CONFIGS, (file) => file.path));
  const configFiles = configs.outputs;
  const plan = STAGES.map((stage) => {
    const scannedFiles = stage.scan === null ? files.map((f) => f.path) : files.filter((f) => f.hits.some((h) => stage.scan!.includes(h))).map((f) => f.path);
    return {
      ...stage,
      analyses: ANALYSIS_STEPS.filter((s) => stage.rules(s.rule)).map((s) => s.name),
      rewrites: TRANSFORM_STEPS.filter((s) => stage.rules(s.rule)).map((s) => s.name),
      run: stage.needs.some((name) => declared[name] !== undefined),
      files: stage.configs === true ? [...new Set([...configFiles, ...scannedFiles])] : scannedFiles,
    };
  });

  // package.json and tsconfig findings: the Solid version, the dependency
  // table, Vite, a library's peers and module resolution (shared/project.mjs,
  // the same checks the npm launcher runs). Migrate reads them after its
  // edits, so they are what it left.
  const checkProject = async (workspace: string) => {
    const checked = await step(
      "Check package.json and tsconfig.json",
      forEachFile(PROJECT_CONFIGS, (file) =>
        file.path.endsWith("package.json") ? manifestFindings(file.path, file.text, workspace) : configFindings(file.path, file.text),
      ),
    );
    const babel = await step("Check Babel's JSON configs", forEachFile(BABEL_JSON_CONFIGS, (file) => babelConfigFindings(file.path, file.text)));
    return [...checked.outputs.flat(), ...babel.outputs.flat()];
  };

  // A shell step runs where Codemod was started unless given a cwd, which is
  // relative to the target. The script prints its summary as JSON on stdout.
  // A dry run skips shell steps, and only the last 1 MiB of output comes back,
  // so a missing or cut-off line leaves the summary undefined.
  const lint = async (label: string, key: string) => {
    const linted = await step(label, shell({ cwd: "." })`sh ${import.meta.dirname}/verify/eslint-solid-v2.sh ${key}`);
    try {
      return JSON.parse(linted.stdout?.trimEnd().split("\n").pop() ?? "");
    } catch {
      return undefined;
    }
  };

  // Rules run on exactly the stage's files, with workspace semantics so
  // references resolve across them. Paths are passed as globs, so brackets in
  // route files like src/routes/[id].tsx are escaped.
  const ruleFiles = (files: string[]) => ({ include: files.map(literalGlob), language: "tsx", semanticAnalysis: "workspace" as const });
  const failures: { step: string; path: string; error: string }[] = [];
  const found: any[] = [];
  const rewritten: any[] = [];

  const before = verify ? await lint("Lint with eslint-plugin-solid v2 (before)", "lintBefore") : undefined;
  // The launcher (report=none) reads package.json and tsconfig itself, with
  // the npm lookups the workflow can't make, so the workflow skips them there.
  const reportProject = params.report !== "none";
  let projectFound: any[] = migrate || !reportProject ? [] : await checkProject(workspaceYaml);
  let after: any;

  const analyze = async () => {
    for (const stage of plan) {
      if (!stage.run || stage.files.length === 0) continue;
      for (const rule of stage.analyses) {
        const label = `${stage.name}: ${rule}`;
        const result = await step(label, forEachFile(ruleFiles(stage.files), (file) => ANALYSES[rule as keyof typeof ANALYSES](file)));
        found.push(...result.outputs.flat());
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
    // What the catalogs will hold once moved, so a package.json takes
    // @solidjs/web and renamed packages only from a catalog that has them.
    const catalogs = catalogPlan(workspaceYaml);
    // A renamed package's imports move only where its package.json now names
    // the successor, so no file imports a package nothing depends on (a
    // catalog outside the target can't be swapped). Keyed by every package
    // directory, so a file goes by its nearest package.json.
    const renamedIn: Record<string, string[]> = {};
    for (const output of manifests.outputs as any[]) {
      if (typeof output.path === "string" && output.path.endsWith("package.json")) renamedIn[directoryOf(output.path)] = [];
    }
    const project = await step(
      "Move package.json and tsconfig.json to Solid 2",
      forEachFile({ ...PROJECT_CONFIGS, include: [...PROJECT_CONFIGS.include, "pnpm-workspace.yaml"] }, (file) => {
        if (file.path.endsWith("pnpm-workspace.yaml")) {
          const bumped = bumpCatalogs(file.text);
          if (bumped === null) return undefined;
          if (bumped.changes.length > 0) file.write(bumped.text);
          return {
            workspaceYaml: bumped.text,
            rewrites: bumped.changes.map((change: any) => ({
              rule: "project/dependencies",
              file: file.path,
              line: change.line,
              column: 1,
              message: `${change.from === null ? `Add ${change.name} ${change.to}` : change.renamedTo !== undefined ? `Replace ${change.name} ${change.from} with ${change.renamedTo} ${change.to}` : `Move ${change.name} from ${change.from} to ${change.to}`} in the ${change.catalog === "" ? "default catalog" : `${change.catalog} catalog`}.`,
              guide: `${MIGRATION_GUIDE_URL}#imports-where-things-live-now`,
              catalog: change.catalog,
              name: change.name,
            })),
            skipped: bumped.skipped.map((skip: any) => ({ file: file.path, ...skip })),
          };
        }
        if (file.path.endsWith("package.json")) {
          const bumped = bumpManifest(file.text, catalogs);
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
                : change.renamedTo !== undefined
                  ? `Replace ${change.name} ${change.from} with ${change.renamedTo} ${change.to}, its Solid 2 successor.`
                  : `Move ${change.name} from ${change.from} to ${change.to}.`,
              guide: `${MIGRATION_GUIDE_URL}#imports-where-things-live-now`,
              renamed: change.renamedTo === undefined ? null : change.name,
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
      if (typeof output.workspaceYaml === "string") workspaceYaml = output.workspaceYaml;
      projectRewrites.push(...output.rewrites.map(({ catalog, name, renamed, ...rewrite }: any) => rewrite));
      for (const { file, renamed } of output.rewrites) {
        if (typeof renamed === "string" && file.endsWith("package.json")) renamedIn[directoryOf(file)]?.push(renamed);
      }
      dependencySkips.push(...output.skipped.filter((skip: any) => {
        const catalog = /^catalog:(.*)$/.exec(skip.range)?.[1];
        return catalog === undefined || !movedInCatalog.has(`${catalog === "default" ? "" : catalog}:${skip.name}`);
      }));
    }
    failures.push(...project.failures.map((f) => ({ step: "Move package.json and tsconfig.json to Solid 2", ...f })));

    // A JSON Babel config moves babel-preset-solid to plugins only in a
    // package whose package.json now names @solidjs/babel-plugin, like the
    // renamed imports below; JavaScript configs move in tooling/package-renames.
    const babel = await step(
      "Move Babel's JSON configs to @solidjs/babel-plugin",
      forEachFile(BABEL_JSON_CONFIGS, (file) => {
        const nearest = Object.keys(renamedIn)
          .filter((directory) => directory === "." || file.path.startsWith(`${directory}/`))
          .sort((left, right) => (left === "." ? 0 : left.length) - (right === "." ? 0 : right.length))
          .pop();
        if (nearest === undefined || !renamedIn[nearest]?.includes("babel-preset-solid")) return [];
        const bumped = bumpBabelConfig(file.text);
        if (bumped === null || bumped.moved.length === 0) return [];
        file.write(bumped.text);
        return bumped.moved.map(({ line, column }) => ({
          rule: "tooling/package-renames",
          file: file.path,
          line,
          column,
          message: "Move babel-preset-solid from presets to plugins as @solidjs/babel-plugin, its Solid 2 successor.",
          guide: `${MIGRATION_GUIDE_URL}#imports-where-things-live-now`,
        }));
      }),
    );
    projectRewrites.push(...babel.outputs.flat());
    failures.push(...babel.failures.map((f) => ({ step: "Move Babel's JSON configs to @solidjs/babel-plugin", ...f })));

    for (const stage of plan) {
      if (!stage.run || stage.files.length === 0) continue;
      for (const rule of stage.rewrites) {
        const label = `${stage.name}: ${rule}`;
        const renamed = JSON.stringify(renamedIn);
        const result = await step(label, forEachFile(ruleFiles(stage.files), (file) => TRANSFORMS[rule as keyof typeof TRANSFORMS](file, { renamed })));
        rewritten.push(...result.outputs.flat());
        failures.push(...result.failures.map((f) => ({ step: label, ...f })));
      }
    }
    if (install) {
      // In a workspace the install is scoped to the packages migrate changed.
      const changedManifests = [...new Set(projectRewrites.map((rewrite) => rewrite.file).filter((file: string) => file.endsWith("package.json")))];
      const installed = await step("Install and typecheck", shell({ cwd: "." })`node ${import.meta.dirname}/verify/after-migrate.mjs install ${changedManifests}`);
      // A dry run skips shell steps; the report then says to install by hand.
      if (!installed.skipped) {
        try {
          afterMigrate = JSON.parse(installed.stdout.trimEnd().split("\n").pop() ?? "");
        } catch {
          afterMigrate = { install: { ok: false, error: "The install step printed no result." }, typecheck: [] };
        }
      }
    }
    if (verify) after = await lint("Lint with eslint-plugin-solid v2 (after)", "lintAfter");
    await analyze();
    if (reportProject) projectFound = await checkProject(workspaceYaml);
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
    const text = renderText({ findings: byLocation([...projectFound, ...findings]), rewrites, afterMigrate, solidVersion: SOLID_TARGET_VERSION });
    console.log(
      text !== ""
        ? text
        : `[solid-migration-assistant] ${migrate ? "Nothing to rewrite." : "No supported migration sites found."} This is not proof that the project is ready for Solid 2; run its own type, build, and test checks.`,
    );
  }
  if (params.report !== "none" && dependencySkips.length > 0) {
    console.log(`Left these dependency ranges as they are; move them by hand:\n${dependencySkips.map((s) => `  ${s.file}: ${s.name} ${JSON.stringify(s.range)} (${s.reason})`).join("\n")}`);
  }
  if (failures.length > 0) console.log(`${failures.length} file(s) failed in rule steps; see failures in the run output.`);
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
    projectFindings: byLocation(projectFound),
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

function directoryOf(path: string): string {
  return path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : ".";
}

function literalGlob(path: string): string {
  return path.replace(/[[\]*?{}]/g, (c) => `[${c}]`);
}

function tally(values: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const value of values) counts[value] = (counts[value] ?? 0) + 1;
  return counts;
}
