// Turns an ESLint JSON report into one STATE_OUTPUTS line: key=<summary json>.
import { readFileSync } from "node:fs";
import { relative } from "node:path";

const [report, target, key] = process.argv.slice(2);
const messages = JSON.parse(readFileSync(report, "utf8")).flatMap((file) =>
  file.messages.map((m) => ({ file: relative(target, file.filePath), line: m.line, rule: m.ruleId ?? "parse-error" })),
);
const byRule = {};
for (const m of messages) byRule[m.rule] = (byRule[m.rule] ?? 0) + 1;
const sorted = Object.fromEntries(Object.entries(byRule).sort((a, b) => b[1] - a[1]));
console.log(`${key}=${JSON.stringify({ total: messages.length, byRule: sorted, messages })}`);
