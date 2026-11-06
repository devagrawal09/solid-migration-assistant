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
  "jsx-element-conflicts": {
    reports: [
    ],
    transformed: null,
    evidence: [
      ["file already binds JSX", "import type { JSX } from \"./local-jsx\";"],
    ],
  },
  "jsx-element-mixed": {
    reports: [
      "3:26 Replace the JSXElement type import from solid-js with JSX from @solidjs/web and rewrite its 1 type reference(s) to JSX.Element.",
    ],
    transformed: "// fixture: jsx-element-mixed\n// prettier-ignore\nimport { type Component, createMemo } from 'solid-js'\nimport type { JSX } from '@solidjs/web'\n\nexport const Layout: Component<{ aside: JSX.Element }> = (props) => {\n  const aside = createMemo(() => props.aside);\n  return <main>{aside()}</main>;\n};\n",
    evidence: [
      ["inline type specifier beside values, single quotes, no semicolon", "import { type Component, type JSXElement, createMemo } from 'solid-js'"],
    ],
  },
  "jsx-element-value-use": {
    reports: [
    ],
    transformed: null,
    evidence: [
      ["value-position re-export", "export type { JSXElement };"],
    ],
  },
  "jsx-element": {
    reports: [
      "2:15 Replace the JSXElement type import from solid-js with JSX from @solidjs/web and rewrite its 5 type reference(s) to JSX.Element.",
    ],
    transformed: "// fixture: jsx-element\nimport type { JSX } from \"@solidjs/web\";\nimport { createSignal } from \"solid-js\";\n\ntype Slot = { header?: JSX.Element; items: JSX.Element[]; render: (value: number) => JSX.Element };\n\nexport function Card(props: { children: JSX.Element | string }): JSX.Element {\n  const [count] = createSignal(0);\n  return <div data-count={count()}>{props.children}</div>;\n}\n\nexport type { Slot };\n",
    evidence: [
      ["sole JSXElement type import", "import type { JSXElement } from \"solid-js\";"],
      ["array, function return, and union references", "items: JSXElement[]; render: (value: number) => JSXElement"],
      ["return type reference", "}): JSXElement {"],
    ],
  },
  "mixed-statements": {
    reports: [
      "2:15 Move the JSX type specifier out of this solid-js import into a separate @solidjs/web type import.",
      "3:10 Move the JSX type specifier out of this solid-js import into a separate @solidjs/web type import.",
    ],
    transformed: "// fixture: mixed-statements\nimport type { Component } from \"solid-js\";\nimport type { JSX } from \"@solidjs/web\";\nimport { createSignal } from \"solid-js\";\nimport type { JSX as J } from \"@solidjs/web\";\nimport { JSX as ValueImport } from \"solid-js\";\nimport type { JSXElement } from \"solid-js\";\nimport type * as Solid from \"solid-js\";\nimport type { JSX as Attributed } from \"solid-js\" with { type: \"ts\" };\n\nexport const element: JSX.Element = <div />;\nexport const component: Component = () => <span />;\nexport const j: J.Element = <b />;\nexport const legacy: JSXElement = <i />;\nexport const namespace: Solid.JSX.Element = <u />;\nexport const attributed: Attributed.Element = <s />;\nvoid createSignal;\nvoid ValueImport;\n",
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
  "split-refusals": {
    reports: [
    ],
    transformed: null,
    evidence: [
      ["comment inside the list", "import type { /* keep */ JSX, Component }"],
      ["value JSX import beside values", "import { JSX as ValueJSX, createSignal } from \"solid-js\";"],
      ["aliased JSXElement", "JSXElement as Element"],
      ["value JSXElement import", "import { JSXElement, createMemo } from \"solid-js\";"],
    ],
  },
};

const testrelocateJsxTypes: Codemod<TSX> = async (root) => {
  runTransformFixtureCase(root, {
    rule: relocateJsxTypes,
    guide: JSX_TYPE_MIGRATION_GUIDE,
    cases: FIXTURE_CASES,
    settledError: (transformed, marker) =>
      // In the fully positive fixtures every JSX type import, JSXElement
      // reference, and pragma is rewritable, so the settled text has none left;
      // mixed-statements deliberately keeps refused forms beside its splits.
      ["relocations", "pragma-forms", "jsx-element", "jsx-element-mixed"].includes(marker) &&
      (/\bJSX\b[^;\n]*from ["']solid-js["']|@jsxImportSource solid-js\b|\bJSXElement\b/.test(transformed))
        ? "transformed output still has a solid-js JSX type import, a JSXElement reference, or a solid-js pragma"
        : null,
  });
  return null;
};

export default testrelocateJsxTypes;
