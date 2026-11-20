import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { guideAnchors, output, skipOrFail, treeSnapshot } from "./helpers.mjs";

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
 * The renamed build packages are proven the same way: the migrated
 * vite.config.ts builds the fixture with @solidjs/vite-plugin on Vite 8, and
 * the migrated babel.config.json (babel-preset-solid moved to plugins as
 * @solidjs/babel-plugin) compiles it to exactly what the plugin configured
 * by hand produces.
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
const projectDirectory = resolve(packageDirectory, "tests/rc-compat/project");
const expectedDirectory = resolve(packageDirectory, "tests/rc-compat/expected");

/** Exact versions: the pinned Solid 2 release and the tooling that builds it. */
const PINNED_PACKAGES = [
  "solid-js@2.0.3",
  "@solidjs/web@2.0.3",
  "@solidjs/h@2.0.2",
  "@solidjs/babel-plugin@2.0.2",
  "@solidjs/vite-plugin@3.0.1",
  "vite@8.3.8",
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

test("the pinned Solid version is still npm latest and matches its source commit", (t) => {
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
  const latest = JSON.parse(tags.stdout).latest;
  assert.equal(
    latest,
    PINNED_VERSION,
    `npm solid-js@latest is ${latest} but the assistant pins ${PINNED_VERSION}; run tools/bump-target.mjs, re-audit the guidance against the new migration guide, and refresh both baselines`,
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

test("the guide coverage map lists exactly the pinned migration guide's sections", (t) => {
  const guide = spawnSync(
    "curl",
    ["-sSfL", `https://raw.githubusercontent.com/solidjs/solid/${PINNED_COMMIT}/documentation/solid-2.0/MIGRATION.md`],
    { encoding: "utf8" },
  );
  if (guide.status !== 0) {
    skipOrFail(t, `the pinned guide is unavailable: ${guide.stderr.trim().split("\n")[0]}`);
    return;
  }
  const coverage = JSON.parse(readFileSync(resolve(packageDirectory, "tests/guide-coverage.json"), "utf8"));
  assert.deepEqual(
    coverage.sections.map((section) => section.anchor),
    guideAnchors(guide.stdout),
    "tests/guide-coverage.json must map every section of the pinned guide, in order",
  );
});

test(
  "transformed fixture typechecks, compiles, and server-renders on the pinned Solid 2 release while the 1.9 input does not",
  async (t) => {
    const [major, minor] = process.versions.node.split(".").map(Number);
    if (
      major < MINIMUM_NODE[0] ||
      (major === MINIMUM_NODE[0] && minor < MINIMUM_NODE[1])
    ) {
      skipOrFail(t, `solid-js@2.0.3 requires Node ${MINIMUM_NODE.join(".")} or newer; running ${process.versions.node}`);
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
          packageDirectory,
          "-t",
          target,
          "--allow-dirty",
          "--no-interactive",
          "--no-color",
          "--param",
          "mode=migrate",
          "--param",
          "verify=false",
          "--param",
          "install=false",
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
      writeFileSync(join(target, "legacy.babel.config.json"), readFileSync(join(projectDirectory, "babel.config.json"), "utf8"));
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
      // The migrated babel.config.json compiles exactly as the plugin
      // configured by hand for SSR; the 1.9 config names a preset that
      // isn't installed.
      assert.equal(compiled.configured.error, null, compiled.configured.error);
      assert.equal(compiled.configured.code, compiled.ssr.code);
      assert.match(compiled.legacyConfig.error ?? "", /Cannot find (?:module|package) 'babel-preset-solid'/);

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
      // Only the runtime: the build tooling isn't part of the scenarios.
      const legacyManifest = JSON.parse(readFileSync(join(legacy, "package.json"), "utf8"));
      delete legacyManifest.devDependencies;
      writeFileSync(join(legacy, "package.json"), `${JSON.stringify(legacyManifest, null, 2)}\n`);
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

      // 7. The migrated vite.config.ts loads @solidjs/vite-plugin, whose
      //    default export is still the plugin factory, and Vite 8 builds the
      //    fixture with it, compiling JSX for @solidjs/web.
      writeFileSync(join(target, "vite-build.mjs"), VITE_BUILD_SCRIPT);
      const vite = run(process.execPath, ["vite-build.mjs"], target);
      assert.equal(vite.status, 0, output(vite));
      const built = JSON.parse(vite.stdout.trim().split("\n").pop());
      assert.ok(built.plugins.some((name) => /solid/i.test(name)), `no Solid plugin among ${built.plugins.join(", ")}`);
      assert.match(built.code, /from "@solidjs\/web"/);
      assert.match(built.code, /template\(/);
      assert.doesNotMatch(built.code, /solid-js\/web/);
    } finally {
      rmSync(temporaryRoot, { recursive: true, force: true });
    }
  },
  { timeout: 600_000 },
);

const EXPECTED_HTML =
  '<ul data-server="true" aria-busy="false" data-empty="false"><li data-index="0" data-theme="dark" class="themed"><b class="badge">a</b></li><li data-index="1" data-theme="dark" class="themed"><b class="badge">b</b></li><li><input tabindex="0" readonly spellcheck="false"></li></ul>';

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

// With a project Babel config instead of options.
async function configured(configFile) {
  try {
    const result = await transformAsync(readFileSync("src/app.tsx", "utf8"), { filename: "src/app.tsx", babelrc: false, configFile });
    return { code: result.code, error: null };
  } catch (error) {
    return { code: null, error: error.message.split("\\n")[0] };
  }
}

const dom = await compile("src/app.tsx", "dom");
const ssr = await compile("src/app.tsx", "ssr");
const legacy = await compile("legacy.tsx", "dom");
const configuredSsr = await configured("./babel.config.json");
const legacyConfig = await configured("./legacy.babel.config.json");
if (ssr.code) writeFileSync("app.ssr.mjs", ssr.code);
console.log(JSON.stringify({ dom, ssr, legacy, configured: configuredSsr, legacyConfig }));
`;

const VITE_BUILD_SCRIPT = `import { build, loadConfigFromFile } from "vite";

const loaded = await loadConfigFromFile({ command: "build", mode: "production" }, "vite.config.ts");
const plugins = (loaded?.config.plugins ?? []).flat(Infinity).filter(Boolean).map((plugin) => plugin.name);
const result = await build({
  configFile: "vite.config.ts",
  logLevel: "silent",
  build: {
    write: false,
    minify: false,
    lib: { entry: "src/app.tsx", formats: ["es"], fileName: "app" },
    rollupOptions: { external: [/^solid-js/, /^@solidjs\\/web/] },
  },
});
const outputs = (Array.isArray(result) ? result : [result]).flatMap((entry) => entry.output);
console.log(JSON.stringify({ plugins, code: outputs.filter((chunk) => chunk.type === "chunk").map((chunk) => chunk.code).join("\\n") }));
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
