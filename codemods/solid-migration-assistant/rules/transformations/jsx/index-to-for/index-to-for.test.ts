import type { Codemod } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import {
  INDEX_MIGRATION_GUIDE,
  rewriteIndexToFor,
} from "./index-to-for.ts";

type FixtureCase = {
  /** Expected report lines (location plus message) without the guide link. */
  reports: ReadonlyArray<string>;
  /** Exact post-transform file text, or null when the file must stay unchanged. */
  transformed: string | null;
  /** Substrings the fixture must contain, proving the case it claims to cover. */
  evidence: ReadonlyArray<readonly [string, string]>;
};

const FIXTURE_CASES: Record<string, FixtureCase> = {
  "attribute-shapes": {
    reports: [
    ],
    transformed: null,
    evidence: [
      ["spread", "<Index {...listProps}>"],
      ["keyed attribute", "<Index each={items()} keyed={false}>"],
      ["missing each", "<Index fallback={<li>missing each</li>}>"],
      ["ref attribute", "<Index each={items()} ref={container}>"],
      ["duplicate each", "<Index each={items()} each={items()}>"],
      ["string each", "<Index each=\"literal\">"],
    ],
  },
  "for-conflicts": {
    reports: [
    ],
    transformed: null,
    evidence: [
      ["local For declaration", "function For(props: { each: string[] })"],
    ],
  },
  "for-imported-after": {
    reports: [
      "2:24 Remove the Index import from solid-js; For is already imported.",
      "9:7 Rewrite <Index> to <For keyed={false}>, keeping its each, fallback, and child callback unchanged.",
    ],
    transformed: "// fixture: for-imported-after\nimport { createSignal, For } from \"solid-js\";\n\nconst [items] = createSignal([\"a\", \"b\"]);\n\nexport function Lists() {\n  return (\n    <>\n      <For keyed={false} each={items()}>{(item) => <i>{item()}</i>}</For>\n      <For each={items()}>{(item) => <b>{item}</b>}</For>\n    </>\n  );\n}\n",
    evidence: [
      ["Index before For", "import { createSignal, Index, For } from \"solid-js\";"],
    ],
  },
  "for-imported-before": {
    reports: [
      "2:15 Remove the Index import from solid-js; For is already imported.",
      "10:7 Rewrite <Index> to <For keyed={false}>, keeping its each, fallback, and child callback unchanged.",
    ],
    transformed: "// fixture: for-imported-before\nimport { For, createSignal } from \"solid-js\";\n\nconst [items] = createSignal([\"a\", \"b\"]);\n\nexport function Lists() {\n  return (\n    <>\n      <For each={items()}>{(item) => <b>{item}</b>}</For>\n      <For keyed={false} each={items()}>{(item) => <i>{item()}</i>}</For>\n    </>\n  );\n}\n",
    evidence: [
      ["For before Index", "import { For, Index, createSignal } from \"solid-js\";"],
    ],
  },
  "import-shapes": {
    reports: [
    ],
    transformed: null,
    evidence: [
      ["aliased import", "import { Index as List } from \"solid-js\";"],
    ],
  },
  "no-matches": {
    reports: [
    ],
    transformed: null,
    evidence: [
      ["local Index component", "import { Index } from \"./list\";"],
      ["already-migrated For", "<For keyed={false} each={items}>"],
      ["string", "const text = \"<Index each=\";"],
    ],
  },
  "real-world-solid-primitives-active-element": {
    reports: [
      "7:40 Rewrite the Index import from solid-js to For.",
      "21:7 Rewrite <Index> to <For keyed={false}>, keeping its each, fallback, and child callback unchanged.",
    ],
    transformed: "// fixture: real-world-solid-primitives-active-element\n// Origin: solidjs-community/solid-primitives, packages/active-element/dev/index.tsx\n// at commit 9c81cd0d64591e80afafd30e9facf7dccfb0f4ab, reduced to the Client\n// component's list and shuffle button, with the local primitive imports\n// replaced by inline stubs. License: MIT\n// (https://github.com/solidjs-community/solid-primitives/blob/9c81cd0d64591e80afafd30e9facf7dccfb0f4ab/LICENSE).\nimport { type Component, createSignal, For } from \"solid-js\";\n\ntype NodeData = { id: number; x: number; y: number; size: number };\nconst genNodeList = (): NodeData[] => [{ id: 1, x: 0, y: 0, size: 1 }];\nconst Node: Component<{ x: number; y: number; size: number; children: unknown }> = (props) => (\n  <button>{props.children}</button>\n);\n\nconst Client: Component = () => {\n  const [list, setList] = createSignal(genNodeList());\n  const shuffle = () => setList(genNodeList());\n\n  return (\n    <div class=\"box-border h-screen w-full overflow-hidden bg-gray-900 text-white\">\n      <For keyed={false} each={list()}>\n        {item => (\n          <Node x={item().x} y={item().y} size={item().size}>\n            {item().id}\n          </Node>\n        )}\n      </For>\n      <button\n        class=\"fixed left-1/2 top-1/2 -ml-32 -mt-8 h-16 w-64 cursor-pointer rounded-lg border-none bg-transparent text-5xl font-extrabold text-white hover:text-yellow-200\"\n        onclick={shuffle}\n      >\n        Shuffle!\n      </button>\n    </div>\n  );\n};\n\nexport default Client;\n",
    evidence: [
      ["origin", "Origin: solidjs-community/solid-primitives, packages/active-element/dev/index.tsx"],
      ["license", "License: MIT"],
      ["list site", "<Index each={list()}>"],
      ["lowercase handler left for its own rule", "onclick={shuffle}"],
    ],
  },
  "rewrites": {
    reports: [
      "2:24 Rewrite the Index import from solid-js to For.",
      "10:7 Rewrite <Index> to <For keyed={false}>, keeping its each, fallback, and child callback unchanged.",
      "14:13 Rewrite <Index> to <For keyed={false}>, keeping its each, fallback, and child callback unchanged.",
      "18:7 Rewrite <Index> to <For keyed={false}>, keeping its each, fallback, and child callback unchanged.",
      "26:7 Rewrite <Index> to <For keyed={false}>, keeping its each, fallback, and child callback unchanged.",
    ],
    transformed: "// fixture: rewrites\nimport { createSignal, For } from \"solid-js\";\n\nconst [items] = createSignal([\"a\", \"b\"]);\nconst [rows] = createSignal([[1, 2], [3]]);\n\nexport function List() {\n  return (\n    <ul>\n      <For keyed={false} each={items()} fallback={<li>empty</li>}>\n        {(item, index) => (\n          <li data-index={index}>\n            {item()}\n            <For keyed={false} each={rows()[index]}>{(cell) => <b>{cell()}</b>}</For>\n          </li>\n        )}\n      </For>\n      <For keyed={false}\n        each={\n          // A comment inside the container must survive byte-for-byte.\n          items()\n        }\n      >\n        {(item) => <i>{item()}</i>}\n      </For>\n      <For keyed={false} each={items()} />\n    </ul>\n  );\n}\n",
    evidence: [
      ["unaliased Index import", "import { createSignal, Index } from \"solid-js\";"],
      ["fallback attribute", "<Index each={items()} fallback={<li>empty</li>}>"],
      ["nested element", "<Index each={rows()[index]}>"],
      ["comment inside the container", "// A comment inside the container"],
      ["self-closing element", "<Index each={items()} />"],
    ],
  },
  "separate-for-import": {
    reports: [
    ],
    transformed: null,
    evidence: [
      ["separate For statement", "import { For } from \"solid-js\";\nimport { Index } from \"solid-js\";"],
    ],
  },
  "shadowed-bindings": {
    reports: [
    ],
    transformed: null,
    evidence: [
      ["parameter shadow", "export function Scoped(Index:"],
    ],
  },
  "unsupported-references": {
    reports: [
    ],
    transformed: null,
    evidence: [
      ["value reference", "const ListComponent = Index;"],
    ],
  },
  "web-import": {
    reports: [
    ],
    transformed: null,
    evidence: [
      ["web import", "import { Index } from \"solid-js/web\";"],
    ],
  },
};

const testIndexToFor: Codemod<TSX> = async (root) => {
  const rootNode = root.root();
  const filename = root.relativeFilename().replaceAll("\\", "/");
  const source = root.source();
  const marker = /\/\/ fixture: ([a-z0-9-]+)/.exec(source)?.[1];
  if (!marker) {
    throw new Error(
      "fixture is missing a `// fixture: <name>` marker on its first line",
    );
  }

  const fixtureCase = FIXTURE_CASES[marker];
  if (!fixtureCase) {
    throw new Error(`unknown fixture marker: ${marker}`);
  }

  for (const [label, text] of fixtureCase.evidence) {
    if (!source.includes(text)) {
      throw new Error(`fixture ${marker} must prove the ${label} case`);
    }
  }

  const rewrites = rewriteIndexToFor(rootNode, filename);

  const expected = fixtureCase.reports.map(
    (report) => `${filename}:${report} Official migration guide: ${INDEX_MIGRATION_GUIDE}`,
  );
  // Several edits may share one report line (an opening and closing tag, or
  // an import and its elements); the workflow deduplicates them exactly.
  const actual = [...new Set(rewrites.map(({ report }) => report))];
  if (actual.join("\n") !== expected.join("\n")) {
    throw new Error(
      `unexpected rewrite report for ${marker}:\n${actual.join("\n")}\nExpected:\n${expected.join("\n")}`,
    );
  }

  const transformed = rootNode.commitEdits(rewrites.map(({ edit }) => edit));
  const expectedTransformed = fixtureCase.transformed ?? source;
  if (transformed !== expectedTransformed) {
    throw new Error(
      `unexpected transformed output for ${marker}:\n${transformed}\nExpected:\n${expectedTransformed}`,
    );
  }

  // Every Index site in a positive fixture is rewritable, so its settled text
  // proves a second run has nothing left to find.
  if (fixtureCase.transformed !== null && /<\/?Index[\s>]|\bIndex\b.*from "solid-js"/.test(transformed)) {
    throw new Error(`transformed output for ${marker} still references Index`);
  }

  return null;
};

export default testIndexToFor;
