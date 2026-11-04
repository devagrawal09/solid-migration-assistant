import type { Codemod } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import {
  CLASS_LIST_MIGRATION_GUIDE,
  rewriteClassListToClass,
} from "./class-list-to-class.ts";

type FixtureCase = {
  rewrites: ReadonlyArray<{
    location: string;
    element: string;
  }>;
  /** Elements whose literal class and object classList merge into the array form. */
  merges?: ReadonlyArray<{
    location: string;
    element: string;
  }>;
  /** Exact post-transform file text, or null when the file must stay unchanged. */
  transformed: string | null;
  /** Substrings the fixture must contain, proving the case it claims to cover. */
  evidence: ReadonlyArray<readonly [string, string]>;
};

const FIXTURE_CASES: Record<string, FixtureCase> = {
  "rewrites": {
    rewrites: [
      { location: "9:14", element: "section" },
      { location: "10:23", element: "div" },
      { location: "11:15", element: "span" },
      { location: "13:14", element: "input" },
      { location: "14:19", element: "my-element" },
      { location: "17:9", element: "li" },
      { location: "23:10", element: "p" },
      { location: "24:10", element: "b" },
      { location: "25:10", element: "i" },
      { location: "26:29", element: "em" },
      { location: "27:37", element: "u" },
      { location: "29:24", element: "foreignObject" },
    ],
    transformed: "// fixture: rewrites\nconst flags = { active: true };\nconst computedKey = \"computed\";\nconst condition = true;\nconst dynamicFlags = () => ({ ready: true });\n\nexport function View() {\n  return (\n    <section class={{ active: true, hidden: false }}>\n      <div id=\"first\" class={flags}>\n        <span class={{ nested: true }}>nested</span>\n      </div>\n      <input class={dynamicFlags()} />\n      <my-element class={flags} />\n      <li\n        data-index=\"1\"\n        class={\n          // A comment inside the container must survive byte-for-byte.\n          flags\n        }\n        style={{ color: \"red\" }}\n      />\n      <p class={condition ? flags : { fallback: true }} />\n      <b class={flags as Record<string, boolean>} />\n      <i class={{ \"spaced key\": true, [computedKey]: false }} />\n      <em style:color=\"red\" class={flags} />\n      <u on:click={() => undefined} class={flags} />\n      <svg>\n        <foreignObject class={flags} />\n      </svg>\n    </section>\n  );\n}\n",
    evidence: [
      ["object literal value", "<section classList={{ active: true, hidden: false }}>"],
      ["identifier value", "<div id=\"first\" classList={flags}>"],
      ["call value", "<input classList={dynamicFlags()} />"],
      ["custom element", "<my-element classList={flags} />"],
      ["comment inside the container", "// A comment inside the container"],
      ["conditional value", "<p classList={condition ? flags : { fallback: true }} />"],
      ["type assertion value", "<b classList={flags as Record<string, boolean>} />"],
      ["computed and spaced keys", "[computedKey]: false"],
      ["unrelated style namespace", "<em style:color=\"red\" classList={flags} />"],
      ["unrelated event namespace", "<u on:click={() => undefined} classList={flags} />"],
      ["camel-cased SVG element", "<foreignObject classList={flags} />"],
    ],
  },
  "non-intrinsic-elements": {
    rewrites: [],
    transformed: null,
    evidence: [
      ["component", "<Widget classList={flags} />"],
      ["member component", "<Components.Widget classList={flags} />"],
      ["namespaced element", "<svg:circle classList={flags} />"],
      ["component with children", "<Widget classList={flags}>child</Widget>"],
    ],
  },
  "class-merges": {
    rewrites: [],
    merges: [
      { location: "9:12", element: "div" },
      { location: "10:15", element: "button" },
      { location: "14:9", element: "span" },
      { location: "21:49", element: "my-element" },
    ],
    transformed: "// fixture: class-merges\nconst isActive = () => true;\nconst isOpen = () => false;\nconst active = true;\n\nexport function View() {\n  return (\n    <section>\n      <div class={[\"card\", { active: isActive(), hidden: !isActive() }]} />\n      <button class={[\"btn btn-primary\", { \"is-open\": isOpen(), active }]}>\n        merged\n      </button>\n      <span\n        class={[\"px-2 hover:bg-red-500\", {\n          // A comment inside the object literal must survive byte-for-byte.\n          \"ring-2 ring-offset-1\": isActive(),\n        }]}\n        id=\"first\"\n      />\n      <my-element class={[\"host\", { ready: active }]} />\n    </section>\n  );\n}\n",
    evidence: [
      ["call values", '<div class="card" classList={{ active: isActive(), hidden: !isActive() }} />'],
      ["string key and shorthand", '<button class="btn btn-primary" classList={{ "is-open": isOpen(), active }}>'],
      ["comment inside the object literal", "// A comment inside the object literal"],
      ["other attribute after classList", 'id="first"'],
      ["classList before class", '<my-element classList={{ ready: active }} class="host" />'],
    ],
  },
  "class-merge-refusals": {
    rewrites: [],
    transformed: null,
    evidence: [
      ["colliding key", '<div class="a b" classList={{ b: active }} />'],
      ["colliding token inside a key", '<div class="a" classList={{ "a b": active }} />'],
      ["computed key", "classList={{ [key]: active }}"],
      ["spread property", "classList={{ ...flags }}"],
      ["getter", "get hidden()"],
      ["numeric key", "classList={{ 1: active }}"],
      ["undefined key", "classList={{ undefined: active }}"],
      ["identifier value", '<div class="card" classList={flags} />'],
      ["non-object expression", "classList={{ ...{} } && flags}"],
      ["entity in the static string", 'class="a &amp; b"'],
      ["single-quoted static string", "class='quoted'"],
      ["line break in the static string", 'class="line\nbreak"'],
      ["expression class", 'class={"expression"}'],
      ["duplicate class attribute", 'class="twice"'],
    ],
  },
  "class-conflicts": {
    rewrites: [],
    transformed: null,
    evidence: [
      ["literal class", "<div class=\"card\" classList={flags} />"],
      ["expression class", "<div classList={flags} class={other} />"],
      ["className", "<div className=\"card\" classList={flags} />"],
      ["class namespace toggle", "<div classList={flags} class:active={toggle} />"],
      ["attr namespace", "<div attr:class=\"card\" classList={flags} />"],
      ["prop namespace", "<div prop:className=\"card\" classList={flags} />"],
      ["bool namespace", "<div bool:class={toggle} classList={flags} />"],
      ["duplicate classList", "<div classList={flags} classList={other} />"],
    ],
  },
  "spread-attributes": {
    rewrites: [],
    transformed: null,
    evidence: [
      ["leading spread", "<div {...props} classList={flags} />"],
      ["trailing spread", "<div classList={flags} {...props} />"],
      ["enclosed spread", "<div id=\"first\" {...props} classList={flags} data-index=\"1\" />"],
      ["classList inside a spread", "<div {...{ classList: flags }} />"],
    ],
  },
  "attribute-values": {
    rewrites: [],
    transformed: null,
    evidence: [
      ["shorthand", "<div classList />"],
      ["empty container", "<div classList={} />"],
      ["comment-only container", "<div classList={/* only a comment */} />"],
      ["string value", "<div classList=\"active\" />"],
      ["element value", "<div classList=<span /> />"],
      ["namespaced attribute name", "<div ns:classList={flags} />"],
      ["hyphenated near miss", "<div class-list={flags} />"],
      ["lowercase near miss", "<div classlist={flags} />"],
      ["uppercase near miss", "<div CLASSLIST={flags} />"],
      ["data attribute near miss", "<div data-classList={flags} />"],
    ],
  },
  "no-matches": {
    rewrites: [],
    transformed: null,
    evidence: [
      ["ordinary identifier", "const classList = { active: true };"],
      ["string", "const text = \"<div classList="],
      ["comment", "// <div classList="],
      ["already-migrated class", "<div class={classList} />"],
      ["DOM classList property", "element.classList.add(\"active\");"],
    ],
  },
};

const testClassListToClass: Codemod<TSX> = async (root) => {
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

  const rewrites = rewriteClassListToClass(rootNode, filename);

  const expected = [
    ...fixtureCase.rewrites.map(
      ({ location, element }) =>
        `${filename}:${location} Rewrite the classList attribute on <${element}> to class, preserving its value expression. Official migration guide: ${CLASS_LIST_MIGRATION_GUIDE}`,
    ),
    ...(fixtureCase.merges ?? []).map(
      ({ location, element }) =>
        `${filename}:${location} Merge the class and classList attributes on <${element}> into the class array form, preserving the static string and the object literal. Official migration guide: ${CLASS_LIST_MIGRATION_GUIDE}`,
    ),
  ];

  // A merge produces two edits that share one report line; the workflow
  // deduplicates them exactly, so reports are compared as a unique list.
  const actual = [...new Set(rewrites.map(({ report }) => report))];
  if (actual.join("\n") !== expected.join("\n")) {
    throw new Error(
      `unexpected classList rewrite report for ${marker}:\n${actual.join("\n")}\nExpected:\n${expected.join("\n")}`,
    );
  }

  const transformed = rootNode.commitEdits(rewrites.map(({ edit }) => edit));
  const expectedTransformed = fixtureCase.transformed ?? source;
  if (transformed !== expectedTransformed) {
    throw new Error(
      `unexpected transformed output for ${marker}:\n${transformed}\nExpected:\n${expectedTransformed}`,
    );
  }

  // Every classList attribute in the positive fixture is rewritable, so its
  // settled text proves a second run has nothing left to find.
  if (fixtureCase.transformed !== null && transformed.includes("classList=")) {
    throw new Error(
      `transformed output for ${marker} still contains a classList attribute`,
    );
  }

  return null;
};

export default testClassListToClass;
