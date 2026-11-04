import type { Codemod } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { analyzeJsxClassListAttributes } from "./class-list.ts";

const MIGRATION_GUIDE =
  "https://github.com/solidjs/solid/blob/2105ffb8ca2fced55f5fac0763177fc93f97c2c2/documentation/solid-2.0/MIGRATION.md#classlist--class-objectarray-forms";

const testJsxClassListAttributes: Codemod<TSX> = async (root) => {
  const filename = "analyzed/class-list-fixture.tsx";
  const guidance = analyzeJsxClassListAttributes(root.root(), { filename });
  const expected = ["8:14", "10:23", "11:15", "13:14"].map(
    (location) =>
      `${filename}:${location} Manual review required: migrate this intrinsic JSX classList attribute to class.
Why: Solid 2.0.0-rc.21 removes the JSX classList attribute in favor of the class attribute's object and array forms; on a native element the compiler now rejects classList with an error that names the replacement.
Guidance: Read this complete intrinsic element, its classList value, and every class source. Move the classList value into the class attribute's object or array form, preserve static classes and conditional truthiness, and deliberately merge any existing class attribute on the same element. Make and validate this migration yourself; this analyzer never edits or runs the target project. Stop without proposing a rewrite when the value or another class source is spread or forwarded, duplicate class sources have unclear precedence, getters or side effects could change evaluation order or frequency, or a focused rendering test does not prove the resulting static and conditional class tokens. Ask for the smallest focused rendering test or runtime observation that exposes the rendered class attribute across relevant states. Official migration guide: ${MIGRATION_GUIDE}`,
  );

  if (guidance.join("\n---finding---\n") !== expected.join("\n---finding---\n")) {
    throw new Error(
      `unexpected JSX classList guidance:\n${guidance.join("\n---finding---\n")}`,
    );
  }
  if (guidance.some((entry) => entry.includes("[S2-JSX-CLASSLIST-001]"))) {
    throw new Error("JSX classList guidance must not expose the old rule ID");
  }
  if (guidance.some((entry) => !entry.includes("Manual review required"))) {
    throw new Error("every JSX classList finding must require manual review");
  }

  const source = root.source();
  const negativeEvidence = [
    ["component", "<Widget classList="],
    ["member component", "<Components.Widget classList="],
    ["string", 'const text = "<div classList='],
    ["comment", "// <div classList="],
    ["class", '<div class="already-new"'],
    ["className", "<div className="],
    ["class-list", "<div class-list="],
    ["data-classList", "<div data-classList="],
    ["spread attribute", "<div {...{ classList: flags }}"],
  ] as const;
  for (const [label, text] of negativeEvidence) {
    if (!source.includes(text)) {
      throw new Error(`fixture must prove the ${label} negative`);
    }
  }

  return null;
};

export default testJsxClassListAttributes;
