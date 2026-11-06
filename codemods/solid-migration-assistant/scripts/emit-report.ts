import type { Codemod } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { acquireLock, getState, setState } from "codemod:workflow";
import { ANALYSIS_STATE_KEY } from "../shared/analysis.ts";
import { TRANSFORM_REPORT_STATE_KEY } from "../shared/transform.ts";
import { SEVERITY_TIERS, severityOf } from "../shared/severity.mjs";

const EMITTED_STATE_KEY = "solid-migration-assistant-report-emitted";

const emitReport: Codemod<TSX> = async () => {
  const release = acquireLock(EMITTED_STATE_KEY);
  try {
    if (getState<boolean>(EMITTED_STATE_KEY)) return null;

    const guidance = [
      ...new Set(getState<string[]>(ANALYSIS_STATE_KEY) ?? []),
    ];
    const report = [
      ...new Set(getState<string[]>(TRANSFORM_REPORT_STATE_KEY) ?? []),
    ];
    setState(EMITTED_STATE_KEY, true, false);

    const blocks = [
      ...(guidance.length > 0 ? [guidance.sort().join("\n\n")] : []),
      ...(report.length > 0 ? [report.sort().join("\n")] : []),
      ...(guidance.length > 0 ? [summarize("findings", guidance, true)] : []),
      ...(report.length > 0 ? [summarize("rewrites", report, false)] : []),
    ];
    if (blocks.length > 0) {
      console.log(blocks.join("\n\n"));
    }
  } finally {
    release();
  }

  return null;
};

/**
 * A compact tail for the full guidance above it: the total, the number of
 * files, then one line per distinct headline with its count and a sorted
 * `file:line:column` list, so a long run can be surveyed without reading
 * every paragraph. Analyzer findings are grouped under severity tiers
 * (`shared/severity.mjs`) in fix order: what will not build first, then
 * silent behavior changes, then deprecations. Rewrites are listed flat.
 * Every list is sorted, so the summary is as deterministic as the findings.
 */
function summarize(noun: string, entries: readonly string[], tiered: boolean): string {
  const files = new Set<string>();
  const byHeadline = new Map<string, string[]>();
  for (const entry of entries) {
    const [location, headline] = split(entry);
    files.add(location.slice(0, location.indexOf(":")));
    const sites = byHeadline.get(headline) ?? [];
    sites.push(location);
    byHeadline.set(headline, sites);
  }

  const lines = [
    `[solid-migration-assistant] Summary: ${entries.length} ${noun} in ${files.size} file(s)`,
  ];
  const sorted = [...byHeadline.entries()].sort(([left], [right]) =>
    left < right ? -1 : left > right ? 1 : 0,
  );
  const groups = tiered
    ? SEVERITY_TIERS.map((tier) => ({
        label: tier.label,
        rows: sorted.filter(([headline]) => severityOf(headline) === tier.id),
      })).filter(({ rows }) => rows.length > 0)
    : [{ label: null, rows: sorted }];
  for (const { label, rows } of groups) {
    if (label !== null) {
      const count = rows.reduce((sum, [, sites]) => sum + sites.length, 0);
      lines.push(`${label}: ${count} ${noun}`);
    }
    for (const [headline, sites] of rows) {
      lines.push(`${String(sites.length).padStart(4)}  ${headline}`);
      lines.push(`      sites: ${[...sites].sort().join(", ")}`);
    }
  }
  return lines.join("\n");
}

/**
 * `["src/a.tsx:3:1", "Manual review required: …"]` for one entry: the
 * location and the headline, with a trailing guide link (which rewrite
 * report lines carry on their only line) left out of the headline.
 */
function split(entry: string): [string, string] {
  const firstLine = (entry.split("\n")[0] ?? entry).replace(
    / Official migration guide: \S+$/,
    "",
  );
  const match = /^(\S+:\d+:\d+) (.*)$/.exec(firstLine);
  if (match === null) return ["", firstLine];
  return [match[1]!, match[2]!];
}

export default emitReport;
