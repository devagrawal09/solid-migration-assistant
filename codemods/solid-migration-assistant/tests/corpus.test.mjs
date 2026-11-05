import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { output, treeSnapshot } from "./helpers.mjs";

/**
 * Opt-in (`pnpm test:corpus`): proves the assistant behaves safely on real,
 * pinned open-source Solid 1.x projects, not only on the synthetic fixtures.
 * It needs network access to clone them, so it is not part of `pnpm verify`,
 * and it never writes inside a clone beyond what the transform itself
 * reports (the analyzer runs against the clone; the transform runs against a
 * `.git`-free copy of it).
 *
 * `tests/corpus/corpus.json` is the manifest: a JSON array of entries
 *
 *   { "name", "url", "commit", "license", "solidVersion", "subdirectory", "notes" }
 *
 * - `name`: unique label, used as the test name and in the JSON summary line;
 * - `url`: the git clone URL;
 * - `commit`: the full 40-character commit hash to pin. The clone fetches
 *   that hash directly, so the check is reproducible and immune to branch
 *   moves;
 * - `license`: the license as found in the repository, or "unverified" when
 *   the repository has no license file (record the evidence in `notes`);
 * - `solidVersion`: the solid-js range(s) the project declares at that commit;
 * - `subdirectory` (optional): a path inside the clone to analyze instead of
 *   the repository root, for monorepos and template collections;
 * - `notes`: free text for the next maintainer.
 *
 * To add a project, append an entry; nothing else needs to change. Each
 * entry becomes one test that:
 *
 * 1. clones the repository at exactly the pinned commit into a temp dir;
 * 2. runs the analyzer through the launcher and proves it exits 0, leaves
 *    the target byte-identical, and logs no crash signature;
 * 3. runs the transform through the launcher on a `.git`-free copy and
 *    proves the set of changed files is exactly the set of files it
 *    reported, with nothing added or deleted;
 * 4. proves every rewritten file still parses;
 * 5. runs the transform again and proves it reports nothing and changes
 *    nothing (idempotency);
 * 6. runs the analyzer on the transformed copy and proves it still exits 0;
 * 7. prints one JSON line to stdout with finding and rewrite counts, the
 *    changed-file count, and elapsed milliseconds per phase; and
 * 8. compares those counts with `tests/corpus/baseline.json` and fails on any
 *    difference, so every effect a rule change has on real code becomes a
 *    reviewed diff of that file instead of a surprise.
 *
 * Refreshing the baseline is deliberate: run
 * `node ./tests/corpus.test.mjs --update-baseline` (or
 * `pnpm corpus:update-baseline`), which runs every check above and then
 * rewrites the baseline entry for each project that passed, and commit the
 * resulting diff together with the change that caused it. Timings are never
 * part of the baseline.
 */
const packageDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const launcher = resolve(packageDirectory, "bin/solid-migration-assistant.mjs");
const corpus = JSON.parse(
  readFileSync(resolve(packageDirectory, "tests/corpus/corpus.json"), "utf8"),
);
const baselinePath = resolve(packageDirectory, "tests/corpus/baseline.json");
const updateBaseline = process.argv.includes("--update-baseline");

/**
 * One finding or rewrite report line: two-space indent, `file:line:column`,
 * then the headline (analyzer) or the message (transform). The launcher's
 * own `package.json` / `tsconfig.json` findings are printed unindented and
 * always at `1:1`.
 */
const REPORT_LINE = /^ {2}(\S+):(\d+):(\d+) (.*)$/;
const LAUNCHER_FINDING = /^(package\.json|tsconfig\.json):1:1 (.*)$/;
/** The per-headline summary repeats every headline, so parsing stops here. */
const SUMMARY_LINE = /^ {2}\[solid-migration-assistant\] Summary: (\d+) (?:findings|rewrites)/;
const CRASH_SIGNATURE = /panic|RuntimeError|Cannot read|TypeError|ReferenceError/;
/** Only a clone that fails for lack of network is a skip; anything else fails. */
const NETWORK_FAILURE =
  /Could not resolve host|unable to access|Failed to connect|Connection (?:refused|reset|timed out)|Network is unreachable|Temporary failure in name resolution|Operation timed out/i;
/** A JSX element or fragment opener; used to pick the script kind for `.js` files. */
const JSX_HINT = /<(?:[A-Za-z]|>)/;

test("the corpus manifest is well-formed", () => {
  assert.ok(Array.isArray(corpus) && corpus.length > 0, "corpus.json must be a non-empty array");
  const names = new Set();
  for (const entry of corpus) {
    for (const key of ["name", "url", "commit", "license", "solidVersion", "notes"]) {
      assert.equal(typeof entry[key], "string", `${entry.name ?? "?"}: ${key} must be a string`);
    }
    assert.match(entry.commit, /^[0-9a-f]{40}$/, `${entry.name}: commit must be a full hash`);
    assert.ok(!names.has(entry.name), `${entry.name}: duplicate name`);
    names.add(entry.name);
    if (entry.subdirectory !== undefined) {
      assert.equal(typeof entry.subdirectory, "string", `${entry.name}: subdirectory must be a string`);
    }
  }
});

for (const entry of corpus) {
  test(
    `${entry.name}: analyzer is read-only and crash-free, transform changes exactly what it reports, rewrites parse, second run is a no-op`,
    async (t) => {
      const temporaryRoot = mkdtempSync(
        join(tmpdir(), `solid-migration-assistant-corpus-${entry.name}-`),
      );
      const elapsedMs = {};
      try {
        // 1. Clone at exactly the pinned commit. Fetching by hash keeps the
        //    clone shallow and independent of any branch.
        let started = performance.now();
        const repository = join(temporaryRoot, "repository");
        mkdirSync(repository);
        const clone = cloneAtCommit(repository, entry);
        elapsedMs.clone = Math.round(performance.now() - started);
        if (clone.networkFailure) {
          t.skip(`network unavailable while cloning ${entry.url}: ${clone.networkFailure}`);
          return;
        }
        assert.equal(
          git(repository, ["rev-parse", "HEAD"]).stdout.trim(),
          entry.commit,
          "the clone is not at the pinned commit",
        );
        const target = entry.subdirectory
          ? resolve(repository, entry.subdirectory)
          : repository;
        assert.ok(
          statSync(target).isDirectory(),
          `${entry.name}: subdirectory ${entry.subdirectory} is not a directory in the clone`,
        );

        // 2. The analyzer must exit 0, must not crash, and must leave the
        //    target byte-identical. `.git` is excluded from the comparison
        //    because git itself may refresh its index when the launcher
        //    queries status; everything else is compared by content hash.
        const before = snapshotWithoutGit(target);
        started = performance.now();
        const analyze = runLauncher(["--target", target]);
        elapsedMs.analyze = Math.round(performance.now() - started);
        assert.equal(analyze.status, 0, output(analyze));
        assertNoCrash(analyze, "analyzer");
        assert.deepEqual(
          snapshotWithoutGit(target),
          before,
          "the analyzer changed the target",
        );
        const findings = parseAnalyzerOutput(analyze.stdout);

        // 3. The transform runs on a `.git`-free copy so the clone itself is
        //    never written to, and so `--allow-dirty` is the only way in.
        const copy = join(temporaryRoot, "copy");
        cpSync(target, copy, {
          recursive: true,
          filter: (source) => basename(source) !== ".git",
        });
        const original = treeSnapshot(copy);
        assert.deepEqual(original, before, "the copy does not match the clone");
        started = performance.now();
        const transform = runLauncher(["transform", "--allow-dirty", "--target", copy]);
        elapsedMs.transform = Math.round(performance.now() - started);
        assert.equal(transform.status, 0, output(transform));
        assertNoCrash(transform, "transform");
        // The launcher swaps the Codemod child's stdio so that workflow step
        // output (the report lines) reaches our stdout, while Codemod's
        // progress envelope goes to our stderr; so the report is on stdout.
        const report = parseReportLines(transform.stdout);
        const after = treeSnapshot(copy);
        const { changed, added, deleted } = diffSnapshots(original, after);
        assert.deepEqual(added, [], "the transform added entries to the target");
        assert.deepEqual(deleted, [], "the transform removed entries from the target");
        assert.deepEqual(
          changed,
          [...new Set(report.map((line) => line.file))].sort(),
          "the set of changed files differs from the set of reported files",
        );

        // 4. Every rewritten file must still parse: a rewrite that breaks
        //    syntax is worse than no rewrite at all.
        started = performance.now();
        for (const file of changed) {
          assert.match(file, /\.(?:js|jsx|ts|tsx)$/, `${file}: the transform edited a non-source file`);
          const diagnostics = parseDiagnostics(file, readFileSync(join(copy, file), "utf8"));
          assert.deepEqual(
            diagnostics,
            [],
            `${file} no longer parses after the transform:\n${diagnostics.join("\n")}`,
          );
        }
        elapsedMs.parse = Math.round(performance.now() - started);

        // 5. Idempotency: a second run reports nothing and changes nothing.
        started = performance.now();
        const second = runLauncher(["transform", "--allow-dirty", "--target", copy]);
        elapsedMs.idempotency = Math.round(performance.now() - started);
        assert.equal(second.status, 0, output(second));
        assertNoCrash(second, "second transform");
        assert.deepEqual(
          parseReportLines(second.stdout),
          [],
          "a second transform run re-reported rewrites (not idempotent)",
        );
        assert.deepEqual(
          treeSnapshot(copy),
          after,
          "a second transform run changed the target (not idempotent)",
        );

        // 6. The analyzer still runs cleanly on the transformed tree. Its
        //    findings legitimately differ (the rewritten sites are gone), so
        //    only the exit status is asserted and the total is recorded.
        started = performance.now();
        const transformedAnalyze = runLauncher(["--target", copy]);
        elapsedMs.analyzeTransformed = Math.round(performance.now() - started);
        assert.equal(transformedAnalyze.status, 0, output(transformedAnalyze));
        assertNoCrash(transformedAnalyze, "analyzer on the transformed copy");
        const transformedFindings = parseAnalyzerOutput(transformedAnalyze.stdout);

        // 7. One machine-readable line per entry for the run log.
        const rewrites = new Map();
        for (const line of report) increment(rewrites, stripGuide(line.message));
        const counts = {
          commit: entry.commit,
          analyzerFindings: sortedObject(findings.counts),
          rewrites: sortedObject(rewrites),
          changedFiles: changed.length,
          transformedAnalyzerFindings: total(transformedFindings.counts),
        };
        console.log(JSON.stringify({ name: entry.name, ...counts, elapsedMs }));

        // 8. The counts must match the reviewed baseline exactly. A rule that
        //    starts reporting more, fewer, or different sites on real code
        //    fails here until the baseline diff is committed on purpose.
        if (updateBaseline) {
          writeBaselineEntry(entry.name, counts);
        } else {
          assertMatchesBaseline(entry.name, counts);
        }
      } finally {
        rmSync(temporaryRoot, { recursive: true, force: true });
      }
    },
    { timeout: 600_000 },
  );
}

function readBaseline() {
  return existsSync(baselinePath) ? JSON.parse(readFileSync(baselinePath, "utf8")) : {};
}

/**
 * Tests in one file run one after another, so a read-modify-write per entry
 * is safe; entries are kept in manifest order and projects no longer in the
 * manifest are dropped.
 */
function writeBaselineEntry(name, counts) {
  const baseline = readBaseline();
  baseline[name] = counts;
  const ordered = {};
  for (const { name: entryName } of corpus) {
    if (baseline[entryName] !== undefined) ordered[entryName] = baseline[entryName];
  }
  writeFileSync(baselinePath, `${JSON.stringify(ordered, null, 2)}\n`);
}

/**
 * Fails with a per-headline delta (`+3`, `-1`, `new`, `gone`) so a reviewer
 * sees what moved without diffing two JSON blobs by eye.
 */
function assertMatchesBaseline(name, counts) {
  const expected = readBaseline()[name];
  assert.ok(
    expected !== undefined,
    `${name} has no entry in tests/corpus/baseline.json; run \`pnpm corpus:update-baseline\` and review the diff`,
  );
  assert.equal(
    expected.commit,
    counts.commit,
    `${name}: the baseline was recorded at ${expected.commit} but the manifest pins ${counts.commit}; refresh the baseline`,
  );
  const deltas = [];
  for (const key of ["analyzerFindings", "rewrites"]) {
    const headlines = new Set([...Object.keys(expected[key]), ...Object.keys(counts[key])]);
    for (const headline of [...headlines].sort()) {
      const before = expected[key][headline];
      const after = counts[key][headline];
      if (before === after) continue;
      const change =
        before === undefined ? `new (${after})` : after === undefined ? `gone (was ${before})` : `${after - before > 0 ? "+" : ""}${after - before} (${before} -> ${after})`;
      deltas.push(`  ${key}: ${change}  ${headline}`);
    }
  }
  for (const key of ["changedFiles", "transformedAnalyzerFindings"]) {
    if (expected[key] !== counts[key]) deltas.push(`  ${key}: ${expected[key]} -> ${counts[key]}`);
  }
  assert.ok(
    deltas.length === 0,
    `${name} differs from tests/corpus/baseline.json:\n${deltas.join("\n")}\nIf the change is intended, run \`pnpm corpus:update-baseline\` and commit the diff with it.`,
  );
}

/**
 * `git init` + `remote add` + `fetch --depth 1 origin <commit>` + `checkout
 * FETCH_HEAD`. Returns `{ networkFailure }` when the fetch failed for lack
 * of network (the caller skips); every other git failure is a real failure.
 */
function cloneAtCommit(repository, { url, commit }) {
  const steps = [
    ["init", "--quiet"],
    ["remote", "add", "origin", url],
    ["fetch", "--quiet", "--depth", "1", "origin", commit],
    ["checkout", "--quiet", "FETCH_HEAD"],
  ];
  for (const argumentsList of steps) {
    const result = git(repository, argumentsList);
    if (result.status === 0) continue;
    if (argumentsList[0] === "fetch" && NETWORK_FAILURE.test(result.stderr ?? "")) {
      return { networkFailure: (result.stderr ?? "").trim().split("\n").pop() };
    }
    assert.fail(`git ${argumentsList.join(" ")} failed in ${repository}:\n${output(result)}`);
  }
  return {};
}

function git(cwd, argumentsList) {
  const result = spawnSync("git", argumentsList, {
    cwd,
    encoding: "utf8",
    // Never hang on a credential prompt: every corpus URL must be public.
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
    maxBuffer: 50 * 1024 * 1024,
  });
  assert.equal(result.error, undefined, `git could not be spawned: ${result.error?.message}`);
  return result;
}

/** Runs the product launcher exactly as a user would, from the package directory. */
function runLauncher(argumentsList) {
  const result = spawnSync(process.execPath, [launcher, ...argumentsList], {
    cwd: packageDirectory,
    encoding: "utf8",
    env: { ...process.env, CI: "true", NO_COLOR: "1", FORCE_COLOR: undefined },
    maxBuffer: 50 * 1024 * 1024,
  });
  assert.equal(result.error, undefined, `the launcher could not be spawned: ${result.error?.message}`);
  return result;
}

/**
 * No line on either stream may look like a crash. Both streams are checked
 * because the launcher routes the Codemod child's stderr (where a native
 * panic or a JSSG runtime error would land) to our stdout; no guidance text
 * contains any of these words, so there is no false positive to allow for.
 */
function assertNoCrash(result, phase) {
  const crashes = `${result.stdout}\n${result.stderr}`
    .split("\n")
    .filter((line) => CRASH_SIGNATURE.test(line));
  assert.deepEqual(crashes, [], `${phase} logged a crash signature`);
}

/**
 * Counts analyzer findings per headline: the indented `file:line:column`
 * lines up to the Summary line plus the launcher's unindented manifest
 * findings. The Summary line's own total must agree with the indented
 * count, which guards the parser against a format drift; with zero
 * findings the workflow prints no Summary line at all.
 */
function parseAnalyzerOutput(stdout) {
  const counts = new Map();
  let indented = 0;
  let summaryTotal = null;
  for (const line of stdout.split("\n")) {
    const summary = SUMMARY_LINE.exec(line);
    if (summary) {
      summaryTotal = Number(summary[1]);
      break;
    }
    const finding = REPORT_LINE.exec(line);
    if (finding) {
      increment(counts, finding[4]);
      indented += 1;
      continue;
    }
    const launcherFinding = LAUNCHER_FINDING.exec(line);
    if (launcherFinding) increment(counts, launcherFinding[2]);
  }
  assert.equal(
    indented,
    summaryTotal ?? 0,
    "the parsed finding count disagrees with the analyzer's own Summary line",
  );
  return { counts, summaryTotal };
}

/** The transform's report lines (file, message) up to its Summary line. */
function parseReportLines(stdout) {
  const lines = [];
  for (const line of stdout.split("\n")) {
    if (SUMMARY_LINE.test(line)) break;
    const match = REPORT_LINE.exec(line);
    if (match) lines.push({ file: match[1], message: match[4] });
  }
  return lines;
}

/** The transform message without its trailing migration-guide link. */
function stripGuide(message) {
  return message.replace(/ Official migration guide: \S+$/, "");
}

/**
 * Syntactic diagnostics for a rewritten file. `transpileModule` parses a
 * single file in isolation, so it reports syntax errors but never missing
 * modules or type errors, which is exactly the "still parses" question.
 * Solid projects routinely keep JSX in `.js` files (solid-realworld does),
 * so a `.js` file that contains a JSX opener is handed to TypeScript under a
 * `.jsx` name: that selects the JSX script kind explicitly rather than
 * relying on how a given TypeScript version treats `.js`.
 */
function parseDiagnostics(file, source) {
  const fileName =
    file.endsWith(".js") && JSX_HINT.test(source) ? `${file.slice(0, -3)}.jsx` : file;
  const { diagnostics } = ts.transpileModule(source, {
    reportDiagnostics: true,
    fileName,
    compilerOptions: { jsx: ts.JsxEmit.Preserve, target: ts.ScriptTarget.ESNext },
  });
  return (diagnostics ?? []).map(
    (diagnostic) =>
      `${file}:${diagnostic.start ?? 0} ${ts.flattenDiagnosticMessageText(diagnostic.messageText, " ")}`,
  );
}

/** `treeSnapshot` minus the `.git` directory (it already skips node_modules). */
function snapshotWithoutGit(root) {
  return Object.fromEntries(
    Object.entries(treeSnapshot(root)).filter(
      ([key]) => !/^(?:directory|file):\.git(?:\/|$)/.test(key),
    ),
  );
}

/** Relative file paths (forward slashes) whose content changed, plus added and deleted entries. */
function diffSnapshots(before, after) {
  const changed = [];
  const added = [];
  const deleted = [];
  for (const [key, value] of Object.entries(after)) {
    if (!(key in before)) added.push(key);
    else if (before[key] !== value && key.startsWith("file:")) changed.push(key.slice("file:".length));
  }
  for (const key of Object.keys(before)) {
    if (!(key in after)) deleted.push(key);
  }
  return { changed: changed.sort(), added: added.sort(), deleted: deleted.sort() };
}

function increment(counts, key) {
  counts.set(key, (counts.get(key) ?? 0) + 1);
}

function total(counts) {
  let sum = 0;
  for (const count of counts.values()) sum += count;
  return sum;
}

function sortedObject(counts) {
  return Object.fromEntries([...counts].sort(([left], [right]) => left.localeCompare(right)));
}
