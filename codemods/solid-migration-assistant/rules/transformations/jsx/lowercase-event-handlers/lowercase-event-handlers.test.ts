import type { Codemod } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import {
  EVENT_HANDLER_MIGRATION_GUIDE,
  rewriteLowercaseEventHandlers,
} from "./lowercase-event-handlers.ts";

type FixtureCase = {
  /** Expected report lines (location plus message) without the guide link. */
  reports: ReadonlyArray<string>;
  /** Exact post-transform file text, or null when the file must stay unchanged. */
  transformed: string | null;
  /** Substrings the fixture must contain, proving the case it claims to cover. */
  evidence: ReadonlyArray<readonly [string, string]>;
};

const FIXTURE_CASES: Record<string, FixtureCase> = {
  "attribute-values": {
    reports: [
    ],
    transformed: null,
    evidence: [
      ["string value", "onload=\"this.rel='stylesheet'\""],
      ["shorthand", "<button onclick />"],
      ["empty container", "<button onclick={} />"],
      ["comment-only container", "<button onclick={/* only a comment */} />"],
      ["spread inside the container", "<button onclick={...[]} />"],
    ],
  },
  "conflicts": {
    reports: [
      "7:51 Rewrite the oninput event handler attribute on <button> to onInput, preserving its value expression.",
    ],
    transformed: "// fixture: conflicts\nconst handler = () => undefined;\n\nexport function View() {\n  return (\n    <section>\n      <button onclick={handler} onClick={handler} onInput={handler} />\n      <button onclick={handler} onclick={handler} />\n      <button on:click={handler} onclick={handler} />\n      <button oncapture:click={handler} onclick={handler} />\n      <button onCLICK={handler} onclick={handler} />\n    </section>\n  );\n}\n",
    evidence: [
      ["camelCase twin", "<button onclick={handler} onClick={handler} oninput={handler} />"],
      ["duplicate lowercase", "<button onclick={handler} onclick={handler} />"],
      ["on: twin", "<button on:click={handler} onclick={handler} />"],
      ["oncapture: twin", "<button oncapture:click={handler} onclick={handler} />"],
      ["mixed-case twin", "<button onCLICK={handler} onclick={handler} />"],
    ],
  },
  "no-matches": {
    reports: [
    ],
    transformed: null,
    evidence: [
      ["ordinary identifier", "const onclick = () => undefined;"],
      ["string", "const text = \"<button onclick=\";"],
      ["DOM property", "element.onclick = onclick;"],
      ["already-migrated handler", "<button onClick={onclick} />"],
    ],
  },
  "non-intrinsic-elements": {
    reports: [
    ],
    transformed: null,
    evidence: [
      ["component", "<Button onclick={handler} />"],
      ["member component", "<Components.Button onclick={handler} />"],
      ["namespaced element", "<svg:rect onclick={handler} />"],
    ],
  },
  "real-world-solid-primitives-memo-lazy": {
    reports: [
      "15:27 Rewrite the onclick event handler attribute on <button> to onClick, preserving its value expression.",
      "18:27 Rewrite the onclick event handler attribute on <button> to onClick, preserving its value expression.",
      "21:27 Rewrite the onclick event handler attribute on <button> to onClick, preserving its value expression.",
    ],
    transformed: "// fixture: real-world-solid-primitives-memo-lazy\n// Origin: solidjs-community/solid-primitives, packages/memo/dev/lazy.tsx at\n// commit 9c81cd0d64591e80afafd30e9facf7dccfb0f4ab, reduced to the toggle\n// buttons of the dev component. License: MIT\n// (https://github.com/solidjs-community/solid-primitives/blob/9c81cd0d64591e80afafd30e9facf7dccfb0f4ab/LICENSE).\nimport { createSignal } from \"solid-js\";\n\nexport default function App() {\n  const [showComp, setShowComp] = createSignal(true);\n  const [showEffect, setShowEffect] = createSignal(true);\n  const [count, setCount] = createSignal(0);\n\n  return (\n    <>\n      <button class=\"btn\" onClick={() => setShowComp(p => !p)}>\n        component: {showComp() ? \"ON\" : \"OFF\"}\n      </button>\n      <button class=\"btn\" onClick={() => setShowEffect(p => !p)}>\n        effect: {showEffect() ? \"ON\" : \"OFF\"}\n      </button>\n      <button class=\"btn\" onClick={() => setCount(p => p + 1)}>\n        increase\n      </button>\n      <p>count: {count()};</p>\n    </>\n  );\n}\n",
    evidence: [
      ["origin", "Origin: solidjs-community/solid-primitives, packages/memo/dev/lazy.tsx"],
      ["license", "License: MIT"],
      ["handler site", "<button class=\"btn\" onclick={() => setShowComp(p => !p)}>"],
    ],
  },
  "rewrites": {
    reports: [
      "10:15 Rewrite the onclick event handler attribute on <button> to onClick, preserving its value expression.",
      "11:14 Rewrite the oninput event handler attribute on <input> to onInput, preserving its value expression.",
      "12:12 Rewrite the ondblclick event handler attribute on <div> to onDblClick, preserving its value expression.",
      "12:41 Rewrite the onpointerdown event handler attribute on <div> to onPointerDown, preserving its value expression.",
      "12:67 Rewrite the onkeydown event handler attribute on <div> to onKeyDown, preserving its value expression.",
      "13:19 Rewrite the onfocusin event handler attribute on <my-element> to onFocusIn, preserving its value expression.",
      "15:9 Rewrite the onchange event handler attribute on <textarea> to onChange, preserving its value expression.",
      "22:15 Rewrite the onmouseenter event handler attribute on <rect> to onMouseEnter, preserving its value expression.",
      "24:19 Rewrite the onclick event handler attribute on <a> to onClick, preserving its value expression.",
    ],
    transformed: "// fixture: rewrites\nimport { createSignal } from \"solid-js\";\n\nconst [count, setCount] = createSignal(0);\nconst increment = () => setCount(count() + 1);\n\nexport function View() {\n  return (\n    <section>\n      <button onClick={increment}>{count()}</button>\n      <input onInput={(event) => setCount(event.currentTarget.value.length)} />\n      <div onDblClick={() => undefined} onPointerDown={increment} onKeyDown={[increment, 1]} />\n      <my-element onFocusIn={() => undefined} />\n      <textarea\n        onChange={\n          // A comment inside the container must survive byte-for-byte.\n          increment\n        }\n        rows=\"3\"\n      />\n      <svg>\n        <rect onMouseEnter={increment} on:custom={increment} />\n      </svg>\n      <a href=\"#\" onClick={increment} onClick:unrelated=\"x\" />\n    </section>\n  );\n}\n",
    evidence: [
      ["onclick", "<button onclick={increment}>"],
      ["oninput", "<input oninput={(event) =>"],
      ["several handlers on one element", "ondblclick={() => undefined} onpointerdown={increment} onkeydown={[increment, 1]}"],
      ["custom element", "<my-element onfocusin={() => undefined} />"],
      ["comment inside the container", "// A comment inside the container"],
      ["SVG element with an unrelated namespace", "<rect onmouseenter={increment} on:custom={increment} />"],
      ["unrelated namespace prefix", "onClick:unrelated=\"x\""],
    ],
  },
  "spread-attributes": {
    reports: [
    ],
    transformed: null,
    evidence: [
      ["leading spread", "<button {...props} onclick={handler} />"],
      ["trailing spread", "<button onclick={handler} {...props} />"],
      ["handler inside a spread", "<button {...{ onclick: handler }} />"],
    ],
  },
  "unknown-events": {
    reports: [
    ],
    transformed: null,
    evidence: [
      ["custom event", "<my-element onmycustomevent={handler} />"],
      ["unknown event", "<button onfoo={handler} />"],
      ["already camelCase", "<button onClick={handler} />"],
      ["hyphenated near miss", "<button onclick-extra={handler} />"],
      ["data attribute near miss", "<button data-onclick={handler} />"],
      ["bare on", "<button on={handler} />"],
    ],
  },
};

const testLowercaseEventHandlers: Codemod<TSX> = async (root) => {
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

  const rewrites = rewriteLowercaseEventHandlers(rootNode, filename);

  const expected = fixtureCase.reports.map(
    (report) => `${filename}:${report} Official migration guide: ${EVENT_HANDLER_MIGRATION_GUIDE}`,
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

  // Every lowercase handler in a fully positive fixture is rewritable, so its
  // settled text proves a second run has nothing left to find; the conflicts
  // fixture deliberately keeps refused sites beside one rewritten attribute.
  if (fixtureCase.transformed !== null && marker !== "conflicts" && /\bon[a-z]+=\{/.test(transformed)) {
    throw new Error(
      `transformed output for ${marker} still contains a lowercase event handler attribute`,
    );
  }

  return null;
};

export default testLowercaseEventHandlers;
