import type { Codemod } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import {
  runTransformFixtureCase,
  type TransformFixtureCase,
} from "../../../../shared/fixture-harness.ts";
import {
  CONTEXT_PROVIDER_MIGRATION_GUIDE,
  rewriteContextProvider,
} from "./context-provider-to-context.ts";

const FIXTURE_CASES: Record<string, TransformFixtureCase> = {
  "aliased-import": {
    reports: [
      "8:5 Rewrite <SettingsContext.Provider> to <SettingsContext>, keeping its value attribute and children unchanged.",
    ],
    transformed: "// fixture: aliased-import\nimport { createContext as makeContext } from \"solid-js\";\n\nconst SettingsContext = makeContext({ compact: false });\n\nexport function Settings(props: { children: unknown }) {\n  return (\n    <SettingsContext value={{ compact: true }}>\n      {props.children}\n    </SettingsContext>\n  );\n}\n",
    evidence: [
      ["aliased createContext import", "import { createContext as makeContext } from \"solid-js\";"],
      ["aliased call", "const SettingsContext = makeContext({ compact: false });"],
    ],
  },
  "attribute-shapes": {
    reports: [
    ],
    transformed: null,
    evidence: [
      ["missing value", "<ThemeContext.Provider>no value</ThemeContext.Provider>"],
      ["spread only", "<ThemeContext.Provider {...props}>"],
      ["spread beside value", "<ThemeContext.Provider value=\"dark\" {...props} />"],
      ["extra attribute", "<ThemeContext.Provider value=\"dark\" id=\"extra\" />"],
      ["shorthand value", "<ThemeContext.Provider value />"],
      ["empty container", "<ThemeContext.Provider value={} />"],
      ["comment-only container", "<ThemeContext.Provider value={/* only a comment */} />"],
      ["children attribute", "children=\"inline\""],
      ["namespaced value", "ns:value=\"dark\""],
    ],
  },
  "lowercase-names": {
    reports: [
    ],
    transformed: null,
    evidence: [
      ["lowercase context name", "const theme = createContext(\"light\");"],
      ["lowercase provider site", "<theme.Provider value=\"dark\">"],
    ],
  },
  "no-matches": {
    reports: [
    ],
    transformed: null,
    evidence: [
      ["already-migrated context", "<AlreadyMigrated value=\"done\">"],
      ["unrelated Provider component", "<Provider value=\"unrelated\" />"],
      ["string", "const text = \"<ThemeContext.Provider value=\";"],
      ["comment", "// <ThemeContext.Provider value=\"comment\">"],
    ],
  },
  "real-world-solid-context-spec": {
    reports: [
      "29:7 Rewrite <ThemeContext.Provider> to <ThemeContext>, keeping its value attribute and children unchanged.",
      "40:7 Rewrite <ThemeContext.Provider> to <ThemeContext>, keeping its value attribute and children unchanged.",
    ],
    transformed: "// fixture: real-world-solid-context-spec\n// Origin: solidjs/solid, packages/solid/web/test/context.spec.tsx at tag\n// v1.9.13 (commit 3be495cec52bf78d7cc61f054af00320ecf4058c), reduced to the\n// context declaration and the first two provider cases, with the test\n// framework calls and relative source imports replaced by package imports.\n// License: MIT, Copyright (c) 2016-2025 Ryan Carniato\n// (https://github.com/solidjs/solid/blob/v1.9.13/LICENSE).\nimport { createContext, useContext } from \"solid-js\";\nimport { render, Show } from \"solid-js/web\";\n\nconst ThemeContext = createContext(\"light\");\nconst Component = () => {\n  const theme = useContext(ThemeContext);\n  return <div>{theme}</div>;\n};\nconst CondComponent = () => {\n  const theme = useContext(ThemeContext);\n  return (\n    <Show when={true}>\n      <div>{theme}</div>\n    </Show>\n  );\n};\nconst div = document.createElement(\"div\");\n\nexport function singleProviderChild() {\n  render(\n    () => (\n      <ThemeContext value=\"dark\">\n        <Component />\n      </ThemeContext>\n    ),\n    div\n  );\n}\n\nexport function singleConditionalProviderChild() {\n  render(\n    () => (\n      <ThemeContext value=\"dark\">\n        <CondComponent />\n      </ThemeContext>\n    ),\n    div\n  );\n}\n",
    evidence: [
      ["origin", "Origin: solidjs/solid, packages/solid/web/test/context.spec.tsx"],
      ["license", "License: MIT"],
      ["provider site", "<ThemeContext.Provider value=\"dark\">"],
    ],
  },
  "rewrites": {
    reports: [
      "11:5 Rewrite <ThemeContext.Provider> to <ThemeContext>, keeping its value attribute and children unchanged.",
      "12:7 Rewrite <UserContext.Provider> to <UserContext>, keeping its value attribute and children unchanged.",
      "13:9 Rewrite <CounterContext.Provider> to <CounterContext>, keeping its value attribute and children unchanged.",
      "27:10 Rewrite <ThemeContext.Provider> to <ThemeContext>, keeping its value attribute and children unchanged.",
      "30:28 Rewrite <ThemeContext.Provider> to <ThemeContext>, keeping its value attribute and children unchanged.",
    ],
    transformed: "// fixture: rewrites\nimport { createContext, useContext } from \"solid-js\";\n\nconst ThemeContext = createContext<string>(\"light\");\nexport const UserContext = createContext<{ name: string }>();\nconst CounterContext = createContext<[() => number, () => void]>();\n\nexport function Provider(props: { children: unknown }) {\n  const theme = \"dark\";\n  return (\n    <ThemeContext value={theme}>\n      <UserContext value={{ name: \"Alice\" }}>\n        <CounterContext\n          value={\n            // A comment inside the container must survive byte-for-byte.\n            [() => 1, () => undefined]\n          }\n        >\n          {props.children}\n        </CounterContext>\n      </UserContext>\n    </ThemeContext>\n  );\n}\n\nexport function StringValue() {\n  return <ThemeContext value=\"dark\">{useContext(ThemeContext)}</ThemeContext>;\n}\n\nexport const selfClosing = <ThemeContext value=\"dark\" />;\n\n// A non-JSX member access is neither rewritten nor a reason to refuse the JSX sites.\nconst LegacyProvider = ThemeContext.Provider;\nvoid LegacyProvider;\n",
    evidence: [
      ["unaliased createContext import", "import { createContext, useContext } from \"solid-js\";"],
      ["expression value", "<ThemeContext.Provider value={theme}>"],
      ["object literal value", "<UserContext.Provider value={{ name: \"Alice\" }}>"],
      ["comment inside the container", "// A comment inside the container"],
      ["string value", "<ThemeContext.Provider value=\"dark\">{useContext(ThemeContext)}</ThemeContext.Provider>"],
      ["self-closing element", "<ThemeContext.Provider value=\"dark\" />"],
      ["non-JSX member access", "const LegacyProvider = ThemeContext.Provider;"],
    ],
  },
  "shadowed-bindings": {
    reports: [
      "11:10 Rewrite <ThemeContext.Provider> to <ThemeContext>, keeping its value attribute and children unchanged.",
    ],
    transformed: "// fixture: shadowed-bindings\nimport { createContext } from \"solid-js\";\n\nconst ThemeContext = createContext(\"light\");\nconst CounterContext = createContext(0);\nconst MenuContext = createContext(\"menu\");\nconst LoopContext = createContext(\"loop\");\nconst NamedContext = createContext(\"named\");\n\nexport function Theme(props: { children: unknown }) {\n  return <ThemeContext value=\"dark\">{props.children}</ThemeContext>;\n}\n\n// CounterContext is also a parameter name, so no site of it is proven.\nexport function Counter(CounterContext: { Provider: (props: unknown) => unknown }) {\n  return <CounterContext.Provider value={1} />;\n}\n\nexport function Outer() {\n  return <CounterContext.Provider value={2} />;\n}\n\n// MenuContext is declared twice, so neither declaration proves its sites.\nexport function Menu() {\n  const MenuContext = { Provider: (props: unknown) => props };\n  return <MenuContext.Provider value=\"inner\" />;\n}\n\nexport const outerMenu = <MenuContext.Provider value=\"outer\" />;\n\n// A for...of loop variable shadows LoopContext inside the loop body.\nexport function Loop(others: { Provider: (props: unknown) => unknown }[]) {\n  const out = [];\n  for (const LoopContext of others) {\n    out.push(<LoopContext.Provider value=\"inner\" />);\n  }\n  return out;\n}\n\nexport const outerLoop = <LoopContext.Provider value=\"outer\" />;\n\n// A named function expression binds NamedContext inside its own body.\nexport const named = function NamedContext() {\n  return <NamedContext.Provider value=\"inner\" />;\n};\n\nexport const outerNamed = <NamedContext.Provider value=\"outer\" />;\n",
    evidence: [
      ["parameter shadow", "export function Counter(CounterContext:"],
      ["duplicate declaration", "const MenuContext = { Provider:"],
      ["for-of loop shadow", "for (const LoopContext of others)"],
      ["named function expression shadow", "function NamedContext()"],
    ],
  },
  "shadowed-create-context": {
    reports: [
    ],
    transformed: null,
    evidence: [
      ["local createContext", "const createContext = () =>"],
      ["proven site left alone", "<ThemeContext.Provider value=\"dark\" />"],
    ],
  },
  "unproven-contexts": {
    reports: [
    ],
    transformed: null,
    evidence: [
      ["imported context", "<ImportedContext.Provider value=\"imported\">"],
      ["namespace import", "Solid.createContext("],
      ["other library", "from \"react\""],
      ["wrapper call", "const Wrapped = wrap(createContext("],
      ["let declaration", "let MutableContext = createContext("],
      ["var declaration", "var VarContext = createContext("],
    ],
  },
};

const testContextProvider: Codemod<TSX> = async (root) => {
  runTransformFixtureCase(root, {
    rule: rewriteContextProvider,
    guide: CONTEXT_PROVIDER_MIGRATION_GUIDE,
    cases: FIXTURE_CASES,
    settledError: (transformed, _marker, reports) => {
      // Every context named in a report is fully rewritten, so the settled text
      // holds no <Name.Provider> tag for it and a second run finds nothing.
      for (const report of reports) {
        const name = /Rewrite <([A-Za-z0-9_$]+)\.Provider>/.exec(report)?.[1];
        if (name !== undefined && transformed.includes(`<${name}.Provider`)) {
          return `transformed output still contains <${name}.Provider>`;
        }
      }
      return null;
    },
  });
  return null;
};

export default testContextProvider;
