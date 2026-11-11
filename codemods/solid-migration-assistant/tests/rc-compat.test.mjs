import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { output, skipOrFail, treeSnapshot } from "./helpers.mjs";

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
 *
 * Two behavioral scenarios run on both runtimes: each untransformed 1.x
 * scenario on `solid-js@1.9.13`, and its transformed output on the pinned RC.
 * `store-scenario.js` must record identical store snapshots after every
 * literal path-setter call. `on-scenario.js` must record, for every effect,
 * the identical sequence of values, previous values, and untracked reads;
 * the interleaving of different effects inside one flush follows Solid 2's
 * scheduler for any effect and is not compared.
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
const LEGACY_SOLID = "solid-js@1.9.13";
const SCENARIO_RUNNER = `const [scenario, mode] = process.argv.slice(2);
const flush = mode === "rc" ? (await import("solid-js")).flush : () => {};
const { run } = await import(new URL(\`./src/\${scenario}.js\`, import.meta.url));
console.log(JSON.stringify(run(() => flush())));
`;

/**
 * The pinned target, read from the single source every rule imports, so the
 * drift check below cannot disagree with what the guidance cites.
 */
const targetSource = readFileSync(resolve(packageDirectory, "shared/target.ts"), "utf8");
const PINNED_VERSION = /SOLID_TARGET_VERSION = "([^"]+)"/.exec(targetSource)?.[1];
const PINNED_COMMIT = /SOLID_SOURCE_COMMIT =\n\s+"([0-9a-f]{40})"/.exec(targetSource)?.[1];

test("the pinned Solid RC is still the newest published one and matches its source commit", (t) => {
  assert.ok(PINNED_VERSION && PINNED_COMMIT, "shared/target.ts must declare the pinned version and commit");
  const lookup = (spec, field) =>
    spawnSync("npm", ["view", spec, field, "--json"], {
      encoding: "utf8",
      env: { ...process.env, CI: "true", NO_COLOR: "1" },
    });
  const tags = lookup("solid-js", "dist-tags");
  if (tags.status !== 0) {
    skipOrFail(t, `npm registry unavailable: ${(tags.stderr || tags.stdout).trim().split("\n")[0]}`);
    return;
  }
  // `latest` still resolves to Solid 1, so `next` is the Solid 2 line.
  const next = JSON.parse(tags.stdout).next;
  assert.equal(
    next,
    PINNED_VERSION,
    `npm solid-js@next is ${next} but the assistant pins ${PINNED_VERSION}; run tools/bump-target.mjs, re-audit the guidance against the new migration guide, and refresh both baselines`,
  );
  for (const name of ["solid-js", "@solidjs/web"]) {
    const head = lookup(`${name}@${PINNED_VERSION}`, "gitHead");
    assert.equal(head.status, 0, output(head));
    assert.equal(
      JSON.parse(head.stdout),
      PINNED_COMMIT,
      `${name}@${PINNED_VERSION} was published from a different commit than the one every guidance link cites`,
    );
  }
});

test(
  "transformed fixture typechecks, compiles, and server-renders on the pinned Solid 2 RC while the 1.9 input does not",
  async (t) => {
    const [major, minor] = process.versions.node.split(".").map(Number);
    if (
      major < MINIMUM_NODE[0] ||
      (major === MINIMUM_NODE[0] && minor < MINIMUM_NODE[1])
    ) {
      skipOrFail(t, `solid-js@2.0.0-rc.21 requires Node ${MINIMUM_NODE.join(".")} or newer; running ${process.versions.node}`);
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

      // 6. Behavioral equivalence of the store and on() rewrites: the 1.x
      //    originals on Solid 1.9.13, the transformed files on the RC, both
      //    through the browser builds so effects and stores are reactive.
      const legacy = join(temporaryRoot, "legacy");
      cpSync(projectDirectory, legacy, { recursive: true });
      const legacyInstall = run(
        "npm",
        ["install", "--no-audit", "--no-fund", "--package-lock=false", "--save-exact", LEGACY_SOLID],
        legacy,
      );
      assert.equal(legacyInstall.status, 0, output(legacyInstall));
      for (const directory of [legacy, target]) writeFileSync(join(directory, "scenario.mjs"), SCENARIO_RUNNER);
      const observe = (directory, scenario, mode) => {
        const result = run(process.execPath, ["--conditions=browser", "scenario.mjs", scenario, mode], directory);
        assert.equal(result.status, 0, output(result));
        return JSON.parse(result.stdout);
      };
      assert.deepEqual(
        observe(target, "store-scenario", "rc"),
        observe(legacy, "store-scenario", "legacy"),
        "literal path-setter rewrites changed the resulting store state",
      );
      const byEffect = (log) => {
        const groups = {};
        for (const [label, ...rest] of log) if (label !== "--") (groups[label] ??= []).push(rest);
        return groups;
      };
      const onLegacy = observe(legacy, "on-scenario", "legacy");
      const onRc = observe(target, "on-scenario", "rc");
      assert.deepEqual(byEffect(onRc), byEffect(onLegacy), "on() rewrites changed what an effect observes");
      assert.ok(Object.keys(byEffect(onLegacy)).length === 3 && onLegacy.length > 10, "the on() scenario must exercise all three effects");
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
