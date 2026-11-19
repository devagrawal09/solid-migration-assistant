// Turns an ESLint JSON report into one JSON line on stdout, which the
// workflow parses from the lint step's output. `sites` lists each file and
// rule pair once ("<file>\t<rule>"), all the workflow compares findings
// against, so the line stays small on a large project. A human summary goes
// to stderr.
import { readFileSync } from "node:fs";
import { relative } from "node:path";

const [report, target] = process.argv.slice(2);
const messages = JSON.parse(readFileSync(report, "utf8")).flatMap((file) =>
  file.messages.map((m) => ({ file: relative(target, file.filePath).replaceAll("\\", "/"), rule: m.ruleId ?? "parse-error" })),
);
const byRule = {};
for (const m of messages) byRule[m.rule] = (byRule[m.rule] ?? 0) + 1;
const sorted = Object.fromEntries(Object.entries(byRule).sort((a, b) => b[1] - a[1]));
const sites = [...new Set(messages.map((m) => `${m.file}\t${m.rule}`))].sort();
console.error(`${messages.length} eslint-plugin-solid v2 messages`);
for (const [rule, count] of Object.entries(sorted)) console.error(`  ${count}  ${rule}`);
console.log(JSON.stringify({ total: messages.length, byRule: sorted, sites }));
