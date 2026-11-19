// Specs for migrate mode's package.json and tsconfig.json edits.
import assert from "node:assert/strict";
import { test } from "node:test";
import { bumpManifest, bumpTsconfig, SOLID_RANGE } from "../shared/manifest.mjs";

const manifest = (dependencies, extra = {}) =>
  `${JSON.stringify({ name: "app", dependencies, ...extra }, null, 2)}\n`;
const bumped = (text) => JSON.parse(bumpManifest(text).text);

test("moves solid-js to the pinned version", () => {
  assert.equal(bumped(manifest({ "solid-js": "^1.9.5" })).dependencies["solid-js"], SOLID_RANGE);
});

test("adds @solidjs/web at the same version", () => {
  assert.equal(bumped(manifest({ "solid-js": "^1.9.5" })).dependencies["@solidjs/web"], SOLID_RANGE);
});

test("adds @solidjs/web when solid-js is not the last dependency", () => {
  assert.equal(bumped(manifest({ "solid-js": "^1.9.5", zod: "^3.0.0" })).dependencies["@solidjs/web"], SOLID_RANGE);
});

test("moves a dependency with a stable Solid 2 release to a caret range", () => {
  assert.equal(bumped(manifest({ "solid-js": "^1.9.5", "@solidjs/router": "^0.15.3" })).dependencies["@solidjs/router"], "^2.0.0");
});

test("keeps a dependency whose Solid 2 release is a prerelease exact", () => {
  assert.equal(bumped(manifest({ "solid-js": "^1.9.5", "@tanstack/solid-query": "^5.0.0" })).dependencies["@tanstack/solid-query"], "6.0.0-rc.6");
});

test("leaves a dependency that needs replacing as it is", () => {
  const text = manifest({ "solid-js": "^1.9.5", "@solidjs/start": "^1.1.0" });
  assert.equal(bumped(text).dependencies["@solidjs/start"], "^1.1.0");
});

test("swaps a renamed package for its successor in place", () => {
  const text = manifest({ "solid-js": "^1.9.5" }, { devDependencies: { "vite-plugin-solid": "^2.11.0", vite: "^8.0.0" } });
  const result = bumpManifest(text);
  assert.deepEqual(Object.entries(JSON.parse(result.text).devDependencies), [["@solidjs/vite-plugin", "^3.0.1"], ["vite", "^8.0.0"]]);
  assert.deepEqual(result.changes.find((change) => change.name === "vite-plugin-solid"), {
    name: "vite-plugin-solid", from: "^2.11.0", to: "^3.0.1", renamedTo: "@solidjs/vite-plugin", line: 7,
  });
});

test("swaps babel-preset-solid and solid-testing-library, keeping a prerelease exact", () => {
  const { devDependencies } = bumped(manifest({ "solid-js": "^1.9.5" }, { devDependencies: { "babel-preset-solid": "^1.9.0", "solid-testing-library": "^0.5.1" } }));
  assert.deepEqual(devDependencies, { "@solidjs/babel-plugin": "^2.0.2", "@solidjs/testing-library": "1.0.0-rc.2" });
});

test("reports a renamed package instead of swapping it when its successor is declared or its range isn't semver", () => {
  const result = bumpManifest(manifest({ "solid-js": "^1.9.5", "solid-testing-library": "^0.5.1", "@solidjs/testing-library": "^0.8.0", "vite-plugin-solid": "catalog:" }));
  assert.deepEqual(result.skipped.map((skip) => `${skip.name}: ${skip.reason}`), [
    "solid-testing-library: @solidjs/testing-library is declared too, so remove solid-testing-library",
    "vite-plugin-solid: it isn't a plain semver range; replace it with @solidjs/vite-plugin ^3.0.1",
  ]);
  assert.equal(JSON.parse(result.text).dependencies["solid-testing-library"], "^0.5.1");
});

test("reports a workspace or catalog range instead of editing it", () => {
  const result = bumpManifest(manifest({ "solid-js": "^1.9.5", "@solidjs/router": "catalog:" }));
  assert.deepEqual(result.skipped.map((skip) => skip.name), ["@solidjs/router"]);
});

test("reports a solid-js peer range instead of editing it", () => {
  const result = bumpManifest(manifest({ "solid-js": "^1.9.5" }, { peerDependencies: { "solid-js": "^1.6" } }));
  assert.equal(JSON.parse(result.text).peerDependencies["solid-js"], "^1.6");
  assert.deepEqual(result.skipped.map((skip) => `${skip.name} ${skip.range}`), ["solid-js ^1.6"]);
});

test("never moves a dependency already on its Solid 2 line back", () => {
  const { dependencies } = bumped(manifest({ "solid-js": "^1.9.5", "@solidjs/web": "^2.1.0", "@solidjs/router": "^2.3.0" }));
  assert.deepEqual([dependencies["@solidjs/web"], dependencies["@solidjs/router"]], ["^2.1.0", "^2.3.0"]);
});

test("edits only the top-level dependencies, not a nested object of the same name", () => {
  const extensions = { packageExtensions: { "old-lib@1": { dependencies: { "solid-js": "^1.9.5" } } } };
  const result = bumped(manifest({ "solid-js": "^1.9.5" }, { pnpm: extensions }));
  assert.deepEqual([result.dependencies["solid-js"], result.pnpm.packageExtensions["old-lib@1"].dependencies["solid-js"]], [SOLID_RANGE, "^1.9.5"]);
});

for (const range of [">=1.8.0 <2.0.0", "^1.9.0 || ^2.0.0-rc.1"]) {
  test(`moves a solid-js range that still admits Solid 1: ${range}`, () => {
    assert.equal(bumped(manifest({ "solid-js": range })).dependencies["solid-js"], SOLID_RANGE);
  });
}

test("changes nothing else in the file", () => {
  const text = '{\n\t"name": "app",\n\t"dependencies": { "solid-js": "~1.8.0", "zod": "^3.0.0" }\n}\n';
  assert.equal(
    bumpManifest(text).text,
    `{\n\t"name": "app",\n\t"dependencies": { "solid-js": "${SOLID_RANGE}", "@solidjs/web": "${SOLID_RANGE}", "zod": "^3.0.0" }\n}\n`,
  );
});

for (const range of ["^2.1.0", "2.0.0"]) {
  test(`skips a manifest already on Solid 2: ${range}`, () => {
    assert.equal(bumpManifest(manifest({ "solid-js": range })), null);
  });
}

test("points tsconfig's jsxImportSource at @solidjs/web", () => {
  assert.equal(
    bumpTsconfig('{\n  // JSX\n  "compilerOptions": { "jsxImportSource": "solid-js" }\n}\n').text,
    '{\n  // JSX\n  "compilerOptions": { "jsxImportSource": "@solidjs/web" }\n}\n',
  );
});

test("reports a catalog range as one to move in the workspace catalog", () => {
  const result = bumpManifest(manifest({ "solid-js": "catalog:" }));
  assert.match(result.skipped[0].reason, /workspace catalog/);
});

test("takes @solidjs/web from the catalog solid-js comes from, when that catalog holds it", () => {
  const text = manifest({ "solid-js": "catalog:legacy" });
  assert.equal(JSON.parse(bumpManifest(text, { web: ["legacy"], renames: [] }).text).dependencies["@solidjs/web"], "catalog:legacy");
});

test("adds no @solidjs/web from a catalog migrate couldn't edit, and says so", () => {
  // codeimage: the app's pnpm-workspace.yaml is above the target.
  const result = bumpManifest(manifest({ "solid-js": "catalog:next" }));
  assert.equal(JSON.parse(result.text).dependencies["@solidjs/web"], undefined);
  assert.deepEqual(result.skipped.map((skip) => `${skip.name} ${skip.range}`), ["solid-js catalog:next", "@solidjs/web catalog:next"]);
});

test("renames a package taken from a catalog only when that catalog swaps it", () => {
  const text = manifest({ "solid-js": "catalog:next" }, { devDependencies: { "vite-plugin-solid": "catalog:next" } });
  const swapped = bumpManifest(text, { web: ["next"], renames: [["next", "vite-plugin-solid", "@solidjs/vite-plugin"]] });
  assert.deepEqual(JSON.parse(swapped.text).devDependencies, { "@solidjs/vite-plugin": "catalog:next" });
  assert.deepEqual(swapped.changes.find((change) => change.renamedTo !== undefined), {
    name: "vite-plugin-solid", from: "catalog:next", to: "catalog:next", renamedTo: "@solidjs/vite-plugin", line: 7,
  });
  const kept = bumpManifest(text);
  assert.deepEqual(JSON.parse(kept.text).devDependencies, { "vite-plugin-solid": "catalog:next" });
  assert.equal(kept.changes.some((change) => change.renamedTo !== undefined), false);
});

test("adds no @solidjs/web beside a solid-js it left alone", () => {
  assert.equal(bumped(manifest({ "solid-js": "link:../solid" })).dependencies["@solidjs/web"], undefined);
});
