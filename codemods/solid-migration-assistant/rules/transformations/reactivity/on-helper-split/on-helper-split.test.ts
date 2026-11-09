import type { Codemod } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import {
  runTransformFixtureCase,
  type TransformFixtureCase,
} from "../../../../shared/fixture-harness.ts";
import {
  ON_HELPER_MIGRATION_GUIDE,
  rewriteOnHelper,
} from "./on-helper-split.ts";

const FIXTURE_CASES: Record<string, TransformFixtureCase> = {
  "import-kept": {
    reports: [
      "7:1 Rewrite createEffect(on(dep, fn)) as createEffect(compute, apply), keeping the callback unchanged.",
    ],
    transformed: "// fixture: import-kept\nimport { createEffect, createSignal, on } from \"solid-js\";\n\nconst [count] = createSignal(0);\n\n// Rewritten.\ncreateEffect(() => count(), (value) => {\n  console.log(value);\n});\n\n// Refused (defer option), so the on import must stay.\ncreateEffect(on(count, (value) => {\n  console.log(value);\n}, { defer: true }));\n",
    evidence: [
      ["defer option keeps the import", "{ defer: true }"],
    ],
  },
  "no-matches": {
    reports: [
    ],
    transformed: null,
    evidence: [
      ["already split", "createEffect(() => count(), (value) => {"],
    ],
  },
  "refusals": {
    reports: [
    ],
    transformed: null,
    evidence: [
      ["array of dependencies", "on([count, other]"],
      ["unproven dependency", "createEffect(on(external,"],
      ["previous return value parameter", "(value, prev, prevResult)"],
      ["expression body", "createEffect(on(count, (value) => value * 2));"],
      ["value return", "return value;"],
      ["onCleanup", "onCleanup(() => console.log(value));"],
      ["useContext", "useContext(Ctx)"],
      ["async callback", "async (value) =>"],
      ["effect initial value", "}), 0);"],
      ["comment in arguments", "/* note */"],
      ["dependency reading its previous value", "on((prev: number) => count() + prev"],
    ],
  },
  "rewrites": {
    reports: [
      "2:50 Remove the on import from solid-js; every use is now a split createEffect.",
      "7:1 Rewrite createEffect(on(dep, fn)) as createEffect(compute, apply), keeping the callback unchanged.",
      "10:1 Rewrite createEffect(on(dep, fn)) as createEffect(compute, apply), keeping the callback unchanged.",
      "14:1 Rewrite createEffect(on(dep, fn)) as createEffect(compute, apply), keeping the callback unchanged.",
    ],
    transformed: "// fixture: rewrites\nimport { createEffect, createMemo, createSignal } from \"solid-js\";\n\nconst [count, setCount] = createSignal(0);\nconst doubled = createMemo(() => count() * 2);\n\ncreateEffect(() => count(), (value, prev) => {\n  console.log(value, prev);\n});\ncreateEffect(() => doubled(), (value) => {\n  // A comment inside the callback must survive byte-for-byte.\n  console.log(value);\n});\ncreateEffect(() => count() + 1, function (value) {\n  console.log(value);\n});\n\nvoid setCount;\n",
    evidence: [
      ["signal getter dependency", "createEffect(on(count, (value, prev) => {"],
      ["memo dependency", "createEffect(on(doubled, (value) => {"],
      ["comment inside the callback", "// A comment inside the callback"],
      ["arrow dependency and function expression", "createEffect(on(() => count() + 1, function (value) {"],
    ],
  },
  "shadowed": {
    reports: [
    ],
    transformed: null,
    evidence: [
      ["shadowed on parameter", "export function local(on:"],
    ],
  },
};

const testOnHelper: Codemod<TSX> = async (root) => {
  runTransformFixtureCase(root, {
    rule: rewriteOnHelper,
    guide: ON_HELPER_MIGRATION_GUIDE,
    cases: FIXTURE_CASES,
    settledError: (transformed, marker) =>
      // In the fully positive fixture every on() effect is split and the
      // import removed, so no on( call or on import remains.
      marker === "rewrites" && /\bon\(|[{,] on[,} ]/.test(transformed)
        ? "transformed output still references on"
        : null,
  });
  return null;
};

export default testOnHelper;
