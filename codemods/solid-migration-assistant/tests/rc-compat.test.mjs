import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { output, treeSnapshot } from "./helpers.mjs";

/**
 * Opt-in (`pnpm test:rc-compat`): proves the transform's output against the
 * pinned Solid 2 RC itself rather than against text snapshots alone. It needs
 * network access to install the exact packages below and a Node version the
 * RC supports, so it is not part of `pnpm verify`.
 *
 * The transformed fixture must typecheck against the RC types, compile under
 * the RC Babel plugin in both DOM and SSR mode, and server-render the expected
 * markup, while the untransformed Solid 1.9 input must be rejected by the RC
 * compiler at its `classList` attribute and must have no `Context.Provider`
 * at runtime: that is the evidence that each rewrite is both required and
 * correct for this target.
 */
const packageDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const codemodLauncher = resolve(packageDirectory, "node_modules/codemod/codemod");
const workflowPath = resolve(packageDirectory, "transform.yaml");
const projectDirectory = resolve(packageDirectory, "tests/rc-compat/project");
const expectedDirectory = resolve(packageDirectory, "tests/rc-compat/expected");

/** Exact versions: the newest published Solid 2 RC and the tooling that builds it. */
const PINNED_PACKAGES = [
  "solid-js@2.0.0-rc.21",
  "@solidjs/web@2.0.0-rc.21",
  "@solidjs/h@2.0.0-rc.21",
  "@solidjs/babel-plugin@2.0.0-rc.21",
  "@tsrx/core@0.1.63",
  "@babel/core@7.29.7",
  "@babel/preset-typescript@7.29.7",
  "typescript@6.0.3",
];
const MINIMUM_NODE = [22, 12, 0];

test(
  "transformed fixture typechecks, compiles, and server-renders on the pinned Solid 2 RC while the 1.9 input does not",
  async (t) => {
    const [major, minor] = process.versions.node.split(".").map(Number);
    if (
      major < MINIMUM_NODE[0] ||
      (major === MINIMUM_NODE[0] && minor < MINIMUM_NODE[1])
    ) {
      t.skip(`solid-js@2.0.0-rc.21 requires Node ${MINIMUM_NODE.join(".")} or newer; running ${process.versions.node}`);
      return;
    }

    const temporaryRoot = mkdtempSync(join(tmpdir(), "solid-migration-assistant-rc-"));
    try {
      const target = join(temporaryRoot, "project");
      cpSync(projectDirectory, target, { recursive: true });
      const legacySource = readFileSync(join(target, "src/app.tsx"), "utf8");

      // 1. The transform produces exactly the checked-in expected tree.
      const transform = run(
        process.execPath,
        [
          codemodLauncher,
          "--disable-analytics",
          "workflow",
          "run",
          "-w",
          workflowPath,
          "-t",
          target,
          "--allow-dirty",
          "--no-interactive",
          "--no-color",
        ],
        packageDirectory,
      );
      assert.equal(transform.status, 0, output(transform));
      assert.deepEqual(treeSnapshot(target), treeSnapshot(expectedDirectory));

      // 2. Install the pinned RC and its tooling into the transformed project.
      const install = run(
        "npm",
        [
          "install",
          "--no-audit",
          "--no-fund",
          "--package-lock=false",
          "--save-exact",
          "--save-dev",
          ...PINNED_PACKAGES,
        ],
        target,
      );
      assert.equal(install.status, 0, output(install));
      for (const spec of PINNED_PACKAGES) {
        const at = spec.lastIndexOf("@");
        const name = spec.slice(0, at);
        const version = spec.slice(at + 1);
        const installed = JSON.parse(
          readFileSync(join(target, "node_modules", name, "package.json"), "utf8"),
        );
        assert.equal(installed.version, version, `${name} resolved to ${installed.version}`);
      }

      // 3. The transformed source typechecks against the RC types.
      const typecheck = run(
        process.execPath,
        [join(target, "node_modules/typescript/bin/tsc"), "--noEmit", "-p", "tsconfig.json"],
        target,
      );
      assert.equal(typecheck.status, 0, output(typecheck));

      // 4. The RC compiler accepts the transformed source in DOM and SSR mode
      //    and rejects the untransformed input at its classList attribute.
      writeFileSync(join(target, "legacy.tsx"), legacySource);
      writeFileSync(join(target, "compile.mjs"), COMPILE_SCRIPT);
      const compile = run(process.execPath, ["compile.mjs"], target);
      assert.equal(compile.status, 0, output(compile));
      const compiled = JSON.parse(compile.stdout);
      assert.equal(compiled.dom.error, null, compiled.dom.error);
      assert.equal(compiled.ssr.error, null, compiled.ssr.error);
      assert.match(compiled.legacy.error ?? "", /`classList` on <(?:li|b)> was removed in Solid 2\.0/);
      // The DOM build binds the renamed handler as a Solid event and never
      // emits an `onclick` attribute write.
      assert.match(compiled.dom.code, /_\$\$click|"click"/);
      assert.doesNotMatch(compiled.dom.code, /"onclick"/);

      // 5. The server build renders the context value, the keyed={false}
      //    rows with numeric indexes, the Dynamic child, and the object class.
      writeFileSync(join(target, "render.mjs"), RENDER_SCRIPT);
      const render = run(process.execPath, ["render.mjs"], target);
      assert.equal(render.status, 0, output(render));
      const rendered = JSON.parse(render.stdout);
      assert.equal(rendered.legacyProviderType, "undefined");
      assert.equal(rendered.html, EXPECTED_HTML);
    } finally {
      rmSync(temporaryRoot, { recursive: true, force: true });
    }
  },
  { timeout: 600_000 },
);

const EXPECTED_HTML =
  '<ul data-server="true"><li data-index="0" data-theme="dark" class="themed"><b class="badge">a</b></li><li data-index="1" data-theme="dark" class="themed"><b class="badge">b</b></li></ul>';

const COMPILE_SCRIPT = `import { transformAsync } from "@babel/core";
import { readFileSync, writeFileSync } from "node:fs";

async function compile(file, generate) {
  try {
    const result = await transformAsync(readFileSync(file, "utf8"), {
      filename: file,
      babelrc: false,
      configFile: false,
      presets: [["@babel/preset-typescript", { isTSX: true, allExtensions: true }]],
      plugins: [["@solidjs/babel-plugin", { generate, hydratable: false }]],
    });
    return { code: result.code, error: null };
  } catch (error) {
    return { code: null, error: error.message.split("\\n")[0] };
  }
}

const dom = await compile("src/app.tsx", "dom");
const ssr = await compile("src/app.tsx", "ssr");
const legacy = await compile("legacy.tsx", "dom");
if (ssr.code) writeFileSync("app.ssr.mjs", ssr.code);
console.log(JSON.stringify({ dom, ssr, legacy }));
`;

const RENDER_SCRIPT = `import { createContext } from "solid-js";
import { renderToString } from "@solidjs/web";
import { App } from "./app.ssr.mjs";

const html = renderToString(() => App({ items: ["a", "b"] }));
console.log(
  JSON.stringify({
    html: html.replace(/ data-hk="[^"]*"/g, ""),
    legacyProviderType: typeof createContext("x").Provider,
  }),
);
`;

function run(executable, argumentsList, cwd) {
  return spawnSync(executable, argumentsList, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, CI: "true", NO_COLOR: "1", FORCE_COLOR: undefined },
    maxBuffer: 50 * 1024 * 1024,
  });
}
