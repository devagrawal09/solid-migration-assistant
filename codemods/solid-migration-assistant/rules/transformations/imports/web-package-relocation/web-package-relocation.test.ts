import type { Codemod } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import {
  DYNAMIC_DEPRECATION_NOTE,
  relocateWebPackage,
  WEB_MIGRATION_GUIDE,
} from "./web-package-relocation.ts";

type FixtureCase = {
  /** Every statement this rule may relocate, with the bindings that proved it. */
  relocations: ReadonlyArray<{
    location: string;
    bindings: string;
  }>;
  /** Exact post-transform file text, or null when the file must stay unchanged. */
  transformed: string | null;
};

const FIXTURE_CASES: Record<string, FixtureCase> = {
  "coexistence": {
    relocations: [
      { location: "2:24", bindings: "render" },
      { location: "7:25", bindings: "hydrate" },
    ],
    transformed: "// fixture: coexistence\nimport { render } from \"@solidjs/web\";\nimport h from \"solid-js/h\";\nimport html from \"solid-js/html\";\nimport { createRenderer } from \"solid-js/universal\";\nimport { jsx } from \"solid-js/jsx-runtime\";\nexport { hydrate } from \"@solidjs/web\";\nexport { jsxDEV } from \"solid-js/jsx-dev-runtime\";\nimport { Portal } from \"solid-js/web\";\nconst dynamicHtml = import(\"solid-js/html\");\n\nvoid render;\nvoid h;\nvoid html;\nvoid createRenderer;\nvoid jsx;\nvoid Portal;\nvoid dynamicHtml;\n",
  },
  "escaped-specifiers": {
    relocations: [
      { location: "2:38", bindings: "render" },
      { location: "3:43", bindings: "hydrate" },
      { location: "4:46", bindings: "isServer" },
      { location: "5:46", bindings: "isServer" },
    ],
    transformed: "// fixture: escaped-specifiers\nimport { render as escapedHex } from \"@solidjs/web\";\nimport { hydrate as escapedUnicode } from \"@solidjs/web\";\nimport { isServer as escapedCodePoint } from \"@solidjs/web\";\nexport { isServer as escapedContinued } from \"@solidjs/web\";\nimport { render as escapedBackslash } from \"solid-js\\\\x2fweb\";\nimport { Portal as escapedVeto } from \"solid-js\\x2fweb\";\n\nvoid escapedHex;\nvoid escapedUnicode;\nvoid escapedCodePoint;\nvoid escapedBackslash;\nvoid escapedVeto;\n",
  },
  "local-exports": {
    relocations: [],
    transformed: null,
  },
  "mixed-bindings": {
    relocations: [
      { location: "8:70", bindings: "render, Dynamic" },
      { location: "9:65", bindings: "render, isServer" },
      { location: "10:67", bindings: "hydrate, isServer" },
    ],
    transformed: "// fixture: mixed-bindings\nimport { render, Portal } from \"solid-js/web\";\nimport { Portal as PortalAliased, hydrate as hydrateAliased } from \"solid-js/web\";\nimport { isServer, isDev } from \"solid-js/web\";\nimport { type Dynamic as DynamicMixed, Suspense } from \"solid-js/web\";\nexport { Dynamic, createDynamic } from \"solid-js/web\";\nexport { render as renderOut, Portal as portalOut } from \"solid-js/web\";\nimport { render as mixedWithDynamic, Dynamic as provenDynamic } from \"@solidjs/web\";\nimport { render as provenAlone, isServer as provenServer } from \"@solidjs/web\";\nexport { hydrate as provenOut, isServer as provenServerOut } from \"@solidjs/web\";\n\nvoid render;\nvoid Portal;\nvoid PortalAliased;\nvoid hydrateAliased;\nvoid isServer;\nvoid isDev;\nvoid Suspense;\nvoid mixedWithDynamic;\nvoid provenDynamic;\nvoid provenAlone;\nvoid provenServer;\ntype _DynamicMixed = DynamicMixed;\n",
  },
  "dynamic-bindings": {
    relocations: [
      { location: "5:25", bindings: "Dynamic" },
      { location: "6:43", bindings: "Dynamic" },
      { location: "7:75", bindings: "Dynamic, render" },
      { location: "8:39", bindings: "Dynamic" },
      { location: "9:79", bindings: "Dynamic, isServer" },
    ],
    transformed: "// fixture: dynamic-bindings\n// Dynamic is exported by @solidjs/web at the pinned rc.21 commit and keeps its\n// 1.9 user-facing contract, so it relocates; every report line that carries it\n// also records that <Dynamic> is deprecated in favor of dynamic().\nimport { Dynamic } from \"@solidjs/web\";\nimport { Dynamic as DynamicAliased } from \"@solidjs/web\";\nimport { Dynamic as DynamicWithRender, render as renderWithDynamic } from \"@solidjs/web\";\nexport { Dynamic as DynamicOut } from \"@solidjs/web\";\nexport { Dynamic as DynamicWithProven, isServer as isServerWithDynamic } from \"@solidjs/web\";\nimport { Dynamic as DynamicWithPortal, Portal } from \"solid-js/web\";\n\nvoid Dynamic;\nvoid DynamicAliased;\nvoid DynamicWithRender;\nvoid renderWithDynamic;\nvoid DynamicWithPortal;\nvoid Portal;\n",
  },
  "named-imports": {
    relocations: [
      { location: "2:24", bindings: "render" },
      { location: "3:46", bindings: "hydrate, render" },
      { location: "4:41", bindings: "hydrate" },
      { location: "5:26", bindings: "isServer" },
      { location: "6:43", bindings: "render" },
      { location: "7:70", bindings: "isServer, hydrate" },
      { location: "11:8", bindings: "isServer, render" },
      { location: "12:64", bindings: "render" },
    ],
    transformed: "// fixture: named-imports\nimport { render } from \"@solidjs/web\";\nimport { hydrate, render as renderApp } from \"@solidjs/web\";\nimport { hydrate as singleQuoted } from '@solidjs/web';\nimport { isServer } from \"@solidjs/web\";\nimport type { render as RenderType } from \"@solidjs/web\";\nimport { type isServer as IsServerType, hydrate as hydrateApp } from \"@solidjs/web\";\nimport {\n  isServer as onServer,\n  render as renderIndented,\n} from \"@solidjs/web\";\nimport { render as duplicateOne, render as duplicateTwo } from \"@solidjs/web\";\n\nvoid render;\nvoid hydrate;\nvoid renderApp;\nvoid singleQuoted;\nvoid isServer;\nvoid hydrateApp;\nvoid onServer;\nvoid renderIndented;\nvoid duplicateOne;\nvoid duplicateTwo;\ntype _RenderType = typeof RenderType;\ntype _IsServerType = IsServerType;\n",
  },
  "named-re-exports": {
    relocations: [
      { location: "2:24", bindings: "render" },
      { location: "3:39", bindings: "hydrate" },
      { location: "4:52", bindings: "hydrate, isServer" },
      { location: "5:43", bindings: "render" },
      { location: "6:74", bindings: "isServer, render" },
      { location: "9:8", bindings: "hydrate" },
    ],
    transformed: "// fixture: named-re-exports\nexport { render } from \"@solidjs/web\";\nexport { hydrate as hydrateApp } from \"@solidjs/web\";\nexport { hydrate as hydrateSingle, isServer } from '@solidjs/web';\nexport type { render as RenderType } from \"@solidjs/web\";\nexport { type isServer as IsServerType, render as renderComponent } from \"@solidjs/web\";\nexport {\n  hydrate,\n} from \"@solidjs/web\";\n",
  },
  "near-miss-modules": {
    relocations: [],
    transformed: null,
  },
  "no-matches": {
    relocations: [],
    transformed: null,
  },
  "non-named-forms": {
    relocations: [],
    transformed: null,
  },
  "runtime-forms": {
    relocations: [],
    transformed: null,
  },
  "unsupported-shapes": {
    relocations: [
      { location: "5:42", bindings: "render" },
    ],
    transformed: "// fixture: unsupported-shapes\nimport { render } from \"solid-js/web\" with { type: \"js\" };\nexport { render as attributedOut } from \"solid-js/web\" with { type: \"js\" };\nexport { \"render\" as stringNamedOut } from \"solid-js/web\";\nexport { render as stringAliasOut } from \"@solidjs/web\";\n\nvoid render;\n",
  },
  "vetoed-bindings": {
    relocations: [],
    transformed: null,
  },
};

const testWebPackageRelocation: Codemod<TSX> = async (root) => {
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

  const relocations = relocateWebPackage(rootNode, filename);

  const expected = fixtureCase.relocations.map(
    ({ location, bindings }) =>
      `${filename}:${location} Relocate solid-js/web to @solidjs/web for proven bindings ${bindings}.${bindings.split(", ").includes("Dynamic") ? ` ${DYNAMIC_DEPRECATION_NOTE}` : ""} Official migration guide: ${WEB_MIGRATION_GUIDE}`,
  );

  // Compared in emitted order, not sorted: the rule promises source order.
  const actual = relocations.map(({ report }) => report);
  if (actual.join("\n") !== expected.join("\n")) {
    throw new Error(
      `unexpected relocation report for ${marker}:\n${actual.join("\n")}\nExpected:\n${expected.join("\n")}`,
    );
  }

  const transformed = rootNode.commitEdits(relocations.map(({ edit }) => edit));
  const expectedTransformed = fixtureCase.transformed ?? source;
  if (transformed !== expectedTransformed) {
    throw new Error(
      `unexpected transformed output for ${marker}:\n${transformed}\nExpected:\n${expectedTransformed}`,
    );
  }

  // Idempotency at the rule level: every relocation writes one plain
  // `@solidjs/web` specifier, which this rule never matches again. Counting
  // the gain works even for escaped sources such as "solid-js\x2fweb", whose
  // pre-transform text does not contain the decoded module name at all.
  const gained =
    occurrences(transformed, "@solidjs/web") -
    occurrences(source, "@solidjs/web");
  if (gained !== relocations.length) {
    throw new Error(
      `expected ${relocations.length} new @solidjs/web specifiers in ${marker}, found ${gained}`,
    );
  }

  return null;
};

function occurrences(text: string, needle: string): number {
  return text.split(needle).length - 1;
}

export default testWebPackageRelocation;
