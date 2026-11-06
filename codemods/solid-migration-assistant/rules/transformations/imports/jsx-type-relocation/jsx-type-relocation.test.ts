import type { Codemod } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import {
  runTransformFixtureCase,
  type TransformFixtureCase,
} from "../../../../shared/fixture-harness.ts";
import {
  JSX_TYPE_MIGRATION_GUIDE,
  relocateJsxTypes,
} from "./jsx-type-relocation.ts";

const FIXTURE_CASES: Record<string, TransformFixtureCase> = {
  "mixed-statements": {
    reports: [
    ],
    transformed: null,
    evidence: [
      ["mixed type statement", "import type { JSX, Component } from \"solid-js\";"],
      ["mixed inline statement", "import { type JSX as J, createSignal } from \"solid-js\";"],
      ["value import", "import { JSX as ValueImport } from \"solid-js\";"],
      ["JSXElement alias", "import type { JSXElement } from \"solid-js\";"],
      ["namespace import", "import type * as Solid from \"solid-js\";"],
      ["import attributes", "with { type: \"ts\" }"],
    ],
  },
  "no-matches": {
    reports: [
    ],
    transformed: null,
    evidence: [
      ["already migrated pragma", "/** @jsxImportSource @solidjs/web */"],
      ["already migrated import", "import type { JSX } from \"@solidjs/web\";"],
      ["hyperscript source", "from \"@solidjs/h\""],
      ["near-miss pragma", "// @jsxImportSource solid-js-compat"],
      ["string", "const text = 'import type { JSX } from \"solid-js\"';"],
    ],
  },
  "pragma-forms": {
    reports: [
      "2:1 Rewrite the @jsxImportSource pragma from solid-js to @solidjs/web.",
      "7:1 Rewrite the @jsxImportSource pragma from solid-js to @solidjs/web.",
    ],
    transformed: "// fixture: pragma-forms\n/**\n * @jsxImportSource @solidjs/web\n * @vitest-environment jsdom\n */\nexport const a = <div />;\n/* @jsxImportSource @solidjs/web */\nexport const b = <span />;\n",
    evidence: [
      ["multi-line doc comment", " * @jsxImportSource solid-js\n * @vitest-environment jsdom"],
      ["block comment", "/* @jsxImportSource solid-js */"],
    ],
  },
  "relocations": {
    reports: [
      "2:1 Rewrite the @jsxImportSource pragma from solid-js to @solidjs/web.",
      "3:26 Relocate the JSX type import from solid-js to @solidjs/web.",
      "4:38 Relocate the JSX type import from solid-js to @solidjs/web.",
      "6:42 Relocate the JSX type import from solid-js to @solidjs/web.",
      "9:8 Relocate the JSX type import from solid-js to @solidjs/web.",
    ],
    transformed: "// fixture: relocations\n/** @jsxImportSource @solidjs/web */\nimport type { JSX } from \"@solidjs/web\";\nimport { type JSX as SolidJSX } from \"@solidjs/web\";\n// prettier-ignore\nimport type { JSX as SingleQuoted } from '@solidjs/web';\nimport type {\n  JSX as Indented,\n} from \"@solidjs/web\";\n\nexport const element: JSX.Element = <div />;\nexport const alias: SolidJSX.Element = <span />;\nexport const single: SingleQuoted.Element = <b />;\nexport const indented: Indented.Element = <i />;\n",
    evidence: [
      ["pragma", "/** @jsxImportSource solid-js */"],
      ["type-only statement", "import type { JSX } from \"solid-js\";"],
      ["inline type specifier with alias", "import { type JSX as SolidJSX } from \"solid-js\";"],
      ["single quotes", "import type { JSX as SingleQuoted } from 'solid-js';"],
      ["multi-line statement", "import type {\n  JSX as Indented,\n} from \"solid-js\";"],
    ],
  },
};

const testrelocateJsxTypes: Codemod<TSX> = async (root) => {
  runTransformFixtureCase(root, {
    rule: relocateJsxTypes,
    guide: JSX_TYPE_MIGRATION_GUIDE,
    cases: FIXTURE_CASES,
    settledError: (transformed) =>
      // Every solid-js JSX type source and pragma in a positive fixture is
      // rewritable, so the settled text names solid-js nowhere.
      /from ["']solid-js["']|@jsxImportSource solid-js\b/.test(transformed)
        ? "transformed output still cites solid-js"
        : null,
  });
  return null;
};

export default testrelocateJsxTypes;
