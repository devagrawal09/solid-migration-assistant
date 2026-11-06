import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { output, treeSnapshot } from "./helpers.mjs";

const packageDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const codemodLauncher = resolve(
  packageDirectory,
  "node_modules/codemod/codemod",
);
const workflowPath = resolve(packageDirectory, "transform.yaml");
const fixtureDirectory = resolve(packageDirectory, "tests/transform-fixture");
const expectedDirectory = resolve(packageDirectory, "tests/transform-expected");

test(
  "relocates the five pure legacy subpaths plus proven solid-js/web statements, rewrites safe intrinsic classList attributes, Context.Provider elements, Index elements, and lowercase event handlers, and changes nothing else",
  () => {
    const temporaryRoot = mkdtempSync(
      join(tmpdir(), "solid-migration-assistant-transform-"),
    );
    const target = join(temporaryRoot, "target");
    try {
      cpSync(fixtureDirectory, target, { recursive: true });

      const first = runTransform(target);
      assert.equal(first.status, 0, output(first));
      assertTreeEquals(target, expectedDirectory);
      assertRelocationReport(first.stderr);
      assertClassListReport(first.stderr);
      assertContextProviderReport(first.stderr);
      assertIndexReport(first.stderr);
      assertEventHandlerReport(first.stderr);
      assertJsxTypeReport(first.stderr);
      assert.equal(
        reportLines(first.stderr).length,
        22 + 7 + 5 + 2 + 2 + 8 + 5 + 4,
        "unexpected total number of rewrite report lines",
      );
      assertSummary(first.stderr, 55, 11);
      assert.deepEqual(
        reportLines(first.stderr),
        [...reportLines(first.stderr)].sort(),
        "the combined report is not in deterministic whole-string order",
      );

      const settled = treeSnapshot(target);
      const second = runTransform(target);
      assert.equal(second.status, 0, output(second));
      assert.deepEqual(
        treeSnapshot(target),
        settled,
        "a second transform run changed the target (not idempotent)",
      );
      assert.deepEqual(
        reportLines(second.stderr),
        [],
        "a second transform run re-reported rewrites (not idempotent)",
      );
      assertNoPersistentArtifacts(target);
    } finally {
      rmSync(temporaryRoot, { recursive: true, force: true });
    }
  },
  { timeout: 120_000 },
);

function runTransform(target) {
  return spawnSync(
    process.execPath,
    [
      codemodLauncher,
      "--disable-analytics",
      "workflow",
      "run",
      "-w",
      workflowPath,
      "-t",
      target,
      "--allow-dirty",
      "--no-interactive",
      "--no-color",
    ],
    {
      cwd: packageDirectory,
      encoding: "utf8",
      env: { ...process.env, CI: "true", NO_COLOR: "1", FORCE_COLOR: undefined },
      maxBuffer: 10 * 1024 * 1024,
    },
  );
}

function reportLines(stderr) {
  return stderr
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^src\/\S+:\d+:\d+ /.test(line));
}

function relocationLines(stderr) {
  return reportLines(stderr).filter(
    (line) => line.includes("Relocate ") && !line.includes("JSX type import"),
  );
}

function classListLines(stderr) {
  return reportLines(stderr).filter((line) =>
    line.includes("Rewrite the classList attribute"),
  );
}

const GUIDE =
  "https://github.com/solidjs/solid/blob/2105ffb8ca2fced55f5fac0763177fc93f97c2c2/documentation/solid-2.0/MIGRATION.md";
const CLASS_LIST_GUIDE = `${GUIDE}#classlist--class-objectarray-forms`;
const CONTEXT_PROVIDER_GUIDE = `${GUIDE}#context-providers-contextprovider--context-is-the-provider`;
const INDEX_GUIDE = `${GUIDE}#list-rendering-index-is-gone-and-for-handles-each-keying-mode`;
const EVENT_HANDLER_GUIDE = `${GUIDE}#attributes--events-closer-to-html-and-fewer-namespaces`;
const JSX_TYPE_GUIDE = `${GUIDE}#typescript-jsx-solid-js--renderer-package`;

/**
 * The transform rewrites exactly the five intrinsic classList attributes whose
 * element carries no other class source and no spread; every other classList
 * attribute in the fixture tree (including the class-plus-classList button in
 * the real-world snippet) must survive for the analyzer to report.
 */
function assertClassListReport(stderr) {
  assert.deepEqual(classListLines(stderr), [
    `src/class-list.tsx:14:14 Rewrite the classList attribute on <section> to class, preserving its value expression. Official migration guide: ${CLASS_LIST_GUIDE}`,
    `src/class-list.tsx:15:23 Rewrite the classList attribute on <div> to class, preserving its value expression. Official migration guide: ${CLASS_LIST_GUIDE}`,
    `src/class-list.tsx:16:15 Rewrite the classList attribute on <span> to class, preserving its value expression. Official migration guide: ${CLASS_LIST_GUIDE}`,
    `src/combined.tsx:18:11 Rewrite the classList attribute on <ul> to class, preserving its value expression. Official migration guide: ${CLASS_LIST_GUIDE}`,
    `src/nested/deep.jsx:11:41 Rewrite the classList attribute on <div> to class, preserving its value expression. Official migration guide: ${CLASS_LIST_GUIDE}`,
  ]);
  // The literal class plus object classList pairs with disjoint keys merge
  // into the array form; the colliding `class="a b"` plus `{ b }` pair stays.
  assert.deepEqual(
    reportLines(stderr).filter((line) => line.includes("Merge the class and classList")),
    [
      `src/class-list.tsx:20:12 Merge the class and classList attributes on <div> into the class array form, preserving the static string and the object literal. Official migration guide: ${CLASS_LIST_GUIDE}`,
      `src/real-world/active-element.tsx:21:7 Merge the class and classList attributes on <button> into the class array form, preserving the static string and the object literal. Official migration guide: ${CLASS_LIST_GUIDE}`,
    ],
  );
}

/**
 * The sole-specifier JSX type import and the pragma move, the type-only JSX
 * specifier is split out of the mixed statement, and JSXElement is rewritten
 * in the file that binds no JSX of its own (it is refused in types.tsx,
 * which does).
 */
function assertJsxTypeReport(stderr) {
  assert.deepEqual(
    reportLines(stderr).filter((line) => /JSX type|JSXElement type|@jsxImportSource/.test(line)),
    [
      `src/types-element.tsx:3:10 Replace the JSXElement type import from solid-js with JSX from @solidjs/web and rewrite its 3 type reference(s) to JSX.Element. Official migration guide: ${JSX_TYPE_GUIDE}`,
      `src/types.tsx:1:1 Rewrite the @jsxImportSource pragma from solid-js to @solidjs/web. Official migration guide: ${JSX_TYPE_GUIDE}`,
      `src/types.tsx:4:26 Relocate the JSX type import from solid-js to @solidjs/web. Official migration guide: ${JSX_TYPE_GUIDE}`,
      `src/types.tsx:5:15 Move the JSX type specifier out of this solid-js import into a separate @solidjs/web type import. Official migration guide: ${JSX_TYPE_GUIDE}`,
    ],
  );
}

/**
 * The summary tail follows the report lines: a header with the totals, then
 * per distinct message a count and a sorted site list, with no guide links.
 */
function assertSummary(stderr, rewrites, files) {
  const lines = stderr
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");
  const header = lines.indexOf(`[solid-migration-assistant] Summary: ${rewrites} rewrites in ${files} file(s)`);
  assert.notEqual(header, -1, "summary header missing");
  const tail = lines.slice(header + 1).filter((line) => /^\d+ {2}|^sites: /.test(line));
  assert.ok(tail.length >= 2 && tail.length % 2 === 0, "summary must pair counts with site lists");
  const counted = tail.filter((line) => /^\d+ {2}/.test(line)).reduce((sum, line) => sum + Number(line.split(" ")[0]), 0);
  assert.equal(counted, rewrites, "summary counts must add up to the rewrite total");
  assert.ok(tail.every((line) => !line.includes("Official migration guide")), "summary lines carry no guide links");
}

/**
 * Only the two Context.Provider elements whose context is declared in the same
 * file by a solid-js createContext call are rewritten; the imported context,
 * the shadowed parameter, and the malformed attribute lists stay untouched.
 */
function assertContextProviderReport(stderr) {
  assert.deepEqual(
    reportLines(stderr).filter((line) => line.includes(".Provider>")),
    [
      `src/combined.tsx:17:5 Rewrite <ThemeContext.Provider> to <ThemeContext>, keeping its value attribute and children unchanged. Official migration guide: ${CONTEXT_PROVIDER_GUIDE}`,
      `src/context.tsx:11:5 Rewrite <ThemeContext.Provider> to <ThemeContext>, keeping its value attribute and children unchanged. Official migration guide: ${CONTEXT_PROVIDER_GUIDE}`,
    ],
  );
}

/**
 * Every Index element in a fully provable file is rewritten together with its
 * import; src/lists-refused.tsx carries one spread element and therefore stays
 * byte-identical as a whole.
 */
function assertIndexReport(stderr) {
  const element = (location) =>
    `${location} Rewrite <Index> to <For keyed={false}>, keeping its each, fallback, and child callback unchanged. Official migration guide: ${INDEX_GUIDE}`;
  const importLine = (location) =>
    `${location} Rewrite the Index import from solid-js to For. Official migration guide: ${INDEX_GUIDE}`;
  assert.deepEqual(
    reportLines(stderr).filter((line) => line.includes("Index")),
    [
      element("src/combined.tsx:19:9"),
      importLine("src/combined.tsx:3:39"),
      element("src/lists.tsx:13:13"),
      element("src/lists.tsx:17:7"),
      importLine("src/lists.tsx:2:24"),
      element("src/lists.tsx:9:7"),
      element("src/real-world/active-element.tsx:40:7"),
      importLine("src/real-world/active-element.tsx:9:40"),
    ],
  );
}

/**
 * Lowercase handlers are renamed only on intrinsic elements with no spread and
 * no second attribute targeting the same event; the component prop, the
 * string value, and the unknown event name stay untouched.
 */
function assertEventHandlerReport(stderr) {
  const line = (location, from, element, to) =>
    `${location} Rewrite the ${from} event handler attribute on <${element}> to ${to}, preserving its value expression. Official migration guide: ${EVENT_HANDLER_GUIDE}`;
  assert.deepEqual(
    reportLines(stderr).filter((entry) => entry.includes("event handler attribute")),
    [
      line("src/combined.tsx:18:46", "onclick", "ul", "onClick"),
      line("src/events.tsx:12:15", "onclick", "button", "onClick"),
      line("src/events.tsx:12:33", "oninput", "button", "onInput"),
      line("src/events.tsx:15:19", "onpointerdown", "my-element", "onPointerDown"),
      line("src/real-world/active-element.tsx:49:9", "onclick", "button", "onClick"),
    ],
  );
}

const LEGACY_SUBPATH_RELOCATION =
  /^src\/[^:]+:\d+:\d+ Relocate solid-js\/(?:h|html|universal|jsx-runtime|jsx-dev-runtime) to @solidjs\/(?:h|html|universal|web\/jsx-runtime|web\/jsx-dev-runtime)\. Official migration guide: https:\/\/github\.com\/solidjs\/solid\/blob\/2105ffb8ca2fced55f5fac0763177fc93f97c2c2\/documentation\/solid-2\.0\/MIGRATION\.md#imports-where-things-live-now$/;

const PROVEN_BINDING = "(?:Dynamic|hydrate|isServer|render)";
const DYNAMIC_NOTE =
  "(?: Note: Dynamic is deprecated in Solid 2 in favor of the dynamic\\(source\\) factory; it keeps working without a runtime warning\\.)?";
const WEB_PACKAGE_RELOCATION = new RegExp(
  `^src/[^:]+:\\d+:\\d+ Relocate solid-js/web to @solidjs/web for proven bindings ${PROVEN_BINDING}(?:, ${PROVEN_BINDING})*\\.${DYNAMIC_NOTE} Official migration guide: https://github\\.com/solidjs/solid/blob/2105ffb8ca2fced55f5fac0763177fc93f97c2c2/documentation/solid-2\\.0/MIGRATION\\.md#imports-where-things-live-now$`,
);

function assertRelocationReport(stderr) {
  const lines = relocationLines(stderr);
  assert.deepEqual(
    lines,
    [...lines].sort(),
    "relocation report is not in deterministic whole-string order",
  );

  const legacy = lines.filter((line) => LEGACY_SUBPATH_RELOCATION.test(line));
  const web = lines.filter((line) => WEB_PACKAGE_RELOCATION.test(line));
  assert.deepEqual(
    lines.filter((line) => !legacy.includes(line) && !web.includes(line)),
    [],
    "a relocation line matched neither the legacy subpath nor the web package format",
  );
  // Exact counts, not lower bounds: a rule that silently widened its scope and
  // relocated more statements than the fixture tree licenses must fail here.
  assert.equal(
    legacy.length,
    22,
    `expected exactly 22 legacy subpath relocations, got ${legacy.length}`,
  );
  assert.equal(
    web.length,
    7,
    `expected exactly 7 proven solid-js/web relocations, got ${web.length}`,
  );
  // A line that carries Dynamic must carry the deprecation note, and no other
  // line may.
  for (const line of web) {
    const carriesDynamic = /proven bindings [^.]*\bDynamic\b/.test(line);
    assert.equal(line.includes("Note: Dynamic is deprecated"), carriesDynamic, line);
  }
  for (const line of lines) {
    assert.doesNotMatch(line, /solid-js\/store/);
  }
  for (const line of legacy) {
    assert.doesNotMatch(line, /solid-js\/web\b/);
  }
}

function assertNoPersistentArtifacts(target) {
  for (const path of [
    ".codemod",
    ".codemod-reports",
    "build",
    "coverage",
    "dist",
  ]) {
    assert.equal(existsSync(join(target, path)), false, path);
  }
}

function assertTreeEquals(actualDirectory, expectedDirectory) {
  assert.deepEqual(
    treeSnapshot(actualDirectory),
    treeSnapshot(expectedDirectory),
    "transformed tree differs from the expected tree",
  );
}
