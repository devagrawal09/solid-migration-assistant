import type { Codemod } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import {
  runTransformFixtureCase,
  type TransformFixtureCase,
} from "../../../../shared/fixture-harness.ts";
import {
  STORE_SETTER_MIGRATION_GUIDE,
  rewriteStoreSetterLiteralPaths,
} from "./setter-literal-paths.ts";

const FIXTURE_CASES: Record<string, TransformFixtureCase> = {
  "aliased-with-store-type": {
    reports: [
      "2:54 Relocate solid-js/store to solid-js for createStore: every setter call in this file is now a draft write.",
      "5:1 Rewrite this path-style store setter call with a literal value as a draft write.",
    ],
    transformed: "// fixture: aliased-with-store-type\nimport { createStore as makeStore, type Store } from \"solid-js\";\n\nconst [items, setItems] = makeStore([1, 2, 3]);\nsetItems((draft) => { draft[0] = 10; });\n\nexport const view: Store<number[]> = items;\n",
    evidence: [
      ["aliased createStore with Store type", "import { createStore as makeStore, type Store } from \"solid-js/store\";"],
      ["array store", "makeStore([1, 2, 3])"],
    ],
  },
  "import-stays": {
    reports: [
      "7:1 Rewrite this path-style store setter call with a literal value as a draft write.",
    ],
    transformed: "// fixture: import-stays\nimport { createStore, produce } from \"solid-js/store\";\n\n// produce shares the statement, so the import cannot move even though the\n// only setter call is rewritten.\nconst [state, setState] = createStore({ count: 0 });\nsetState((draft) => { draft.count = 1; });\n\nvoid state;\nvoid produce;\n",
    evidence: [
      ["produce in the same statement", "import { createStore, produce } from \"solid-js/store\";"],
    ],
  },
  "no-matches": {
    reports: [
    ],
    transformed: null,
    evidence: [
      ["already migrated", "setState((draft) => {"],
    ],
  },
  "partial": {
    reports: [
      "8:1 Rewrite this path-style store setter call with a literal value as a draft write.",
      "9:1 Rewrite this path-style store setter call with a literal value as a draft write.",
    ],
    transformed: "// fixture: partial\nimport { createStore } from \"solid-js/store\";\n\nconst [state, setState] = createStore({ user: { name: \"a\" }, list: [1], count: 0 });\nconst nextName = \"dynamic\";\n\n// Rewritten: literal path and literal value.\nsetState((draft) => { draft.count = 1; });\nsetState((draft) => { draft.count = 1.5e3; });\n\n// Refused: the value is not a literal (1.x merged objects and called\n// functions), the path is not literal, or the call's result is used.\nsetState(\"user\", { name: \"merged\" });\nsetState(\"count\", (count) => count + 1);\nsetState(\"user\", \"name\", nextName);\nsetState(\"list\", [0, 1], 5);\nsetState(\"list\", { from: 0, to: 0 }, 5);\nsetState((current) => ({ ...current, count: 2 }));\nconst result = setState(\"count\", 3);\nsetState(\"count\", /* why */ 4);\nsetState(\"__proto__\", \"x\");\n\nvoid state;\nvoid result;\n",
    evidence: [
      ["object value merged in 1.x", "setState(\"user\", { name: \"merged\" });"],
      ["function value", "setState(\"count\", (count) => count + 1);"],
      ["variable value", "setState(\"user\", \"name\", nextName);"],
      ["array of keys", "setState(\"list\", [0, 1], 5);"],
      ["range", "setState(\"list\", { from: 0, to: 0 }, 5);"],
      ["result used", "const result = setState(\"count\", 3);"],
      ["comment in arguments", "setState(\"count\", /* why */ 4);"],
      ["unsafe key", "setState(\"__proto__\", \"x\");"],
    ],
  },
  "rewrites": {
    reports: [
      "2:29 Relocate solid-js/store to solid-js for createStore: every setter call in this file is now a draft write.",
      "6:1 Rewrite this path-style store setter call with a literal value as a draft write.",
      "7:1 Rewrite this path-style store setter call with a literal value as a draft write.",
      "8:1 Rewrite this path-style store setter call with a literal value as a draft write.",
      "9:1 Rewrite this path-style store setter call with a literal value as a draft write.",
      "10:1 Rewrite this path-style store setter call with a literal value as a draft write.",
      "11:1 Rewrite this path-style store setter call with a literal value as a draft write.",
      "12:1 Rewrite this path-style store setter call with a literal value as a draft write.",
      "13:1 Rewrite this path-style store setter call with a literal value as a draft write.",
      "14:1 Rewrite this path-style store setter call with a literal value as a draft write.",
    ],
    transformed: "// fixture: rewrites\nimport { createStore } from \"solid-js\";\n\nconst [state, setState] = createStore({ user: { name: \"a\", tags: [\"x\"] }, count: 0, \"odd key\": 1 });\n\nsetState((draft) => { draft.count = 5; });\nsetState((draft) => { draft.user.name = \"Ann\"; });\nsetState((draft) => { draft.user.tags[0] = \"z\"; });\nsetState((draft) => { delete draft.user.nick; });\nsetState((draft) => { draft.count = -1; });\nsetState((draft) => { draft.user.active = true; });\nsetState((draft) => { draft.user.name = null; });\nsetState((draft) => { draft[\"odd key\"] = 2; });\nsetState((draft) => { draft.user.name = 'single'; });\n\nvoid state;\n",
    evidence: [
      ["single-key path", "setState(\"count\", 5);"],
      ["nested path", "setState(\"user\", \"name\", \"Ann\");"],
      ["array index", "setState(\"user\", \"tags\", 0, \"z\");"],
      ["undefined deletes", "setState(\"user\", \"nick\", undefined);"],
      ["negative number", "setState(\"count\", -1);"],
      ["boolean and null", "setState(\"user\", \"name\", null);"],
      ["key needing brackets", "setState(\"odd key\", 2);"],
      ["single quotes", "setState('user', 'name', 'single');"],
    ],
  },
  "store-not-literal": {
    reports: [
      "8:1 Rewrite this path-style store setter call with a literal value as a draft write.",
    ],
    transformed: "// fixture: store-not-literal\nimport { createStore } from \"solid-js/store\";\n\ndeclare const initial: { count: number };\n// The initial value is not a literal, so the import does not move; the\n// literal setter call is still rewritten.\nconst [state, setState] = createStore(initial);\nsetState((draft) => { draft.count = 1; });\n\nvoid state;\n",
    evidence: [
      ["non-literal initial value", "createStore(initial)"],
    ],
  },
  "unproven-setters": {
    reports: [
    ],
    transformed: null,
    evidence: [
      ["let declaration", "let [mutableState, setMutable] = createStore"],
      ["other module", "import { createStore as otherStore } from \"./other-store\";"],
      ["shadowed setter", "export function shadowed(setState:"],
      ["setter passed as value", "export const handler = setState;"],
    ],
  },
  "unused-or-passed": {
    reports: [
    ],
    transformed: null,
    evidence: [
      ["createStore passed as a value", "export const factory = createStore;"],
    ],
  },
};

const testStoreSetterLiteralPaths: Codemod<TSX> = async (root) => {
  runTransformFixtureCase(root, {
    rule: rewriteStoreSetterLiteralPaths,
    guide: STORE_SETTER_MIGRATION_GUIDE,
    cases: FIXTURE_CASES,
    settledError: (transformed, marker) =>
      // In the fully positive fixtures every setter call is rewritten, so no
      // path-style call or solid-js/store import is left.
      ["rewrites", "aliased-with-store-type"].includes(marker) &&
      /set\w+\(["'0-9]|solid-js\/store/.test(transformed)
        ? "transformed output still has a path-style setter call or a solid-js/store import"
        : null,
  });
  return null;
};

export default testStoreSetterLiteralPaths;
