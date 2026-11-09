/**
 * The only place findings and rewrites become text. Rules return data
 * (`shared/finding.ts`); the workflow's report step (`scripts/emit-report.ts`)
 * and the launcher (`shared/run-workflow.mjs`) both render it through these
 * functions, so the registry workflow and the CLI print the same report.
 */

/**
 * Severity tiers in fix order. Each finding names its tier explicitly:
 *
 * - `build`: the code will not build or run on Solid 2 as written. The
 *   import path or export no longer exists, the compiler rejects the syntax,
 *   or the call no longer matches the RC signature.
 * - `behavior`: the code still compiles but behaves differently, with no
 *   error to point at it.
 * - `deprecated`: the code keeps working but the RC discourages it.
 *
 * Fix `build` findings first: until they are gone the project cannot run, so
 * `behavior` findings cannot be observed.
 */
export const SEVERITY_TIERS = Object.freeze([
  Object.freeze({ id: "build", label: "Will not build or run on Solid 2" }),
  Object.freeze({ id: "behavior", label: "Builds but behaves differently" }),
  Object.freeze({ id: "deprecated", label: "Deprecated but still working" }),
]);

/** Marks the machine-readable report line `emit-report` prints for the launcher. */
export const REPORT_MARKER = "SMA-REPORT ";

const PREFIX = "[solid-migration-assistant]";
const TIER_ORDER = new Map(SEVERITY_TIERS.map((tier, index) => [tier.id, index]));

/** Findings or rewrites in file, line, then column order. */
export function byLocation(entries) {
  return [...entries].sort(
    (left, right) =>
      (left.file < right.file ? -1 : left.file > right.file ? 1 : 0) ||
      left.line - right.line ||
      left.column - right.column ||
      (left.rule < right.rule ? -1 : left.rule > right.rule ? 1 : 0),
  );
}

/** The eslint-plugin-solid rules that keep reporting a finding's site, as a sentence. */
export function lintSentence(rules) {
  if (rules.length === 0) return null;
  const names = rules.map((rule) => `solid/${rule}`);
  const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  return `eslint-plugin-solid's ${list} (v2 config) keeps reporting this site after migration.`;
}

/** One finding as a text block: a located headline, then indented details. */
export function renderFinding(finding) {
  const lint = lintSentence(finding.lint);
  return [
    `${finding.file}:${finding.line}:${finding.column} [${finding.severity}] ${finding.headline}`,
    `  Rule: ${finding.rule}`,
    `  Why: ${finding.why}`,
    `  Guidance: ${finding.guidance}`,
    ...(lint === null ? [] : [`  Lint: ${lint}`]),
    `  Guide: ${finding.guide}`,
  ].join("\n");
}

/** One rewrite as two lines: the located message, then its rule and guide. */
export function renderRewrite(rewrite) {
  return `${rewrite.file}:${rewrite.line}:${rewrite.column} ${rewrite.message}\n  Rule: ${rewrite.rule}  Guide: ${rewrite.guide}`;
}

/**
 * The full text report: a header, every finding (or rewrite) in location
 * order, and a summary that groups sites by headline under severity tiers,
 * so a long run can be surveyed without reading every block. Empty when
 * there is nothing to report.
 */
export function renderText({ findings = [], rewrites = [], solidVersion }) {
  const blocks = [];
  if (findings.length > 0) {
    blocks.push(
      `${PREFIX} ${count(findings.length, "finding")} for Solid ${solidVersion}. Each is a manual edit for you (or your agent) to make and validate; this analyzer never edits or runs the target project.`,
      ...byLocation(findings).map(renderFinding),
      summarize(findings, "finding", (finding) => finding.headline, true),
    );
  }
  if (rewrites.length > 0) {
    blocks.push(
      `${PREFIX} ${count(rewrites.length, "rewrite")} applied. Review the diff and run the project's own checks.`,
      byLocation(rewrites).map(renderRewrite).join("\n"),
      summarize(rewrites, "rewrite", (rewrite) => rewrite.message, false),
    );
  }
  return blocks.join("\n\n");
}

function summarize(entries, noun, headlineOf, tiered) {
  const files = new Set(entries.map((entry) => entry.file));
  const lines = [`${PREFIX} Summary: ${count(entries.length, noun)} in ${count(files.size, "file")}`];
  const groups = tiered
    ? SEVERITY_TIERS.map((tier) => ({ label: tier.label, entries: entries.filter((entry) => entry.severity === tier.id) }))
    : [{ label: null, entries }];
  for (const group of groups) {
    if (group.entries.length === 0) continue;
    if (group.label !== null) lines.push(`${group.label}: ${count(group.entries.length, noun)}`);
    const byHeadline = new Map();
    for (const entry of byLocation(group.entries)) {
      const headline = headlineOf(entry);
      byHeadline.set(headline, [...(byHeadline.get(headline) ?? []), `${entry.file}:${entry.line}:${entry.column}`]);
    }
    const rows = [...byHeadline].sort(([left, leftSites], [right, rightSites]) =>
      rightSites.length - leftSites.length || (left < right ? -1 : left > right ? 1 : 0),
    );
    for (const [headline, sites] of rows) {
      lines.push(`${String(sites.length).padStart(4)}  ${headline}`);
      lines.push(`      sites: ${sites.join(", ")}`);
    }
  }
  return lines.join("\n");
}

function count(value, noun) {
  return `${value} ${noun}${value === 1 ? "" : "s"}`;
}

/** Totals for a JSON report: findings per tier, or rewrites. */
export function summaryOf({ findings, rewrites }) {
  if (findings !== undefined) {
    const bySeverity = Object.fromEntries(SEVERITY_TIERS.map((tier) => [tier.id, 0]));
    for (const finding of findings) bySeverity[finding.severity] += 1;
    return { findings: findings.length, files: new Set(findings.map((finding) => finding.file)).size, bySeverity };
  }
  return { rewrites: rewrites.length, files: new Set(rewrites.map((rewrite) => rewrite.file)).size };
}

/**
 * The analyzer's findings as one Markdown work list for a coding agent (or a
 * person): grouped by file, each file's tasks in fix order (severity tier,
 * then location), every task carrying its full guidance and guide link,
 * followed by the command that re-verifies the result. The analyzer stays
 * the source of truth: the list tells the reader to re-run it rather than to
 * trust its own edits.
 */
export function renderAgentReport(report) {
  const tierLabel = new Map(SEVERITY_TIERS.map((tier) => [tier.id, tier.label]));
  const byFile = new Map();
  for (const finding of report.findings) {
    byFile.set(finding.file, [...(byFile.get(finding.file) ?? []), finding]);
  }
  const worst = (file) => Math.min(...byFile.get(file).map((finding) => TIER_ORDER.get(finding.severity)));
  const files = [...byFile.keys()].sort(
    (left, right) => worst(left) - worst(right) || (left < right ? -1 : left > right ? 1 : 0),
  );
  const lines = [
    `# Solid 2 migration tasks`,
    "",
    `Target: ${report.solid.target} (source commit ${report.solid.sourceCommit}). Generated by ${report.tool}@${report.version} for \`${report.target}\`.`,
    "",
    `${count(report.summary.findings, "finding")} in ${count(report.summary.files, "file")}: ${SEVERITY_TIERS.map((tier) => `${report.summary.bySeverity[tier.id]} ${tier.label[0].toLowerCase()}${tier.label.slice(1)}`).join(", ")}.`,
    "",
    "How to work through this list:",
    "",
    "1. Fix every \"will not build or run\" task first; until they are gone the app cannot run, so behavior changes cannot be observed.",
    "2. Follow each task's guidance, including its stop conditions: when a task says to stop and ask, do not guess.",
    "3. Keep each edit to the cited site and keep the project's tests green.",
    `4. Re-run \`npx solid-migration-assistant --format agent --target ${report.target}\` to verify. Fixed tasks disappear; the analyzer, not this list, decides what is done.`,
    "",
  ];
  if (report.findings.length === 0) {
    lines.push("No supported migration sites were found. This is not proof that the project is ready for Solid 2; run its own type, build, and test checks.");
    return lines.join("\n");
  }
  for (const file of files) {
    lines.push(`## \`${file}\``, "");
    const tasks = [...byFile.get(file)].sort(
      (left, right) =>
        TIER_ORDER.get(left.severity) - TIER_ORDER.get(right.severity) ||
        left.line - right.line ||
        left.column - right.column,
    );
    for (const task of tasks) {
      const lint = lintSentence(task.lint);
      lines.push(`- [ ] \`${task.file}:${task.line}:${task.column}\` ${task.headline} *(${tierLabel.get(task.severity)}; ${task.rule})*`);
      lines.push(`  Why: ${task.why}`, `  Guidance: ${task.guidance}`);
      if (lint !== null) lines.push(`  Lint: ${lint}`);
      lines.push(`  Guide: ${task.guide}`);
    }
    lines.push("");
  }
  return lines.join("\n").trimEnd();
}
