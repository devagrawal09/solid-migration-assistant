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
  assert.equal(bumped(manifest({ "solid-js": "^1.9.5", "@tanstack/solid-query": "^5.0.0" })).dependencies["@tanstack/solid-query"], "6.0.0-rc.5");
});

test("leaves a dependency that needs replacing as it is", () => {
  const text = manifest({ "solid-js": "^1.9.5" }, { devDependencies: { "vite-plugin-solid": "^2.11.0" } });
  assert.equal(bumped(text).devDependencies["vite-plugin-solid"], "^2.11.0");
});

test("reports a workspace or catalog range instead of editing it", () => {
  const result = bumpManifest(manifest({ "solid-js": "^1.9.5", "@solidjs/router": "catalog:" }));
  assert.deepEqual(result.skipped.map((skip) => skip.name), ["@solidjs/router"]);
});

test("reports a solid-js peer range instead of editing it", () => {
  const result = bumpManifest(manifest({ "solid-js": "^1.9.5" }, { peerDependencies: { "solid-js": "^1.6" } }));
  assert.equal(JSON.parse(result.text).peerDependencies["solid-js"], "^1.6");
});

test("changes nothing else in the file", () => {
  const text = '{\n\t"name": "app",\n\t"dependencies": { "solid-js": "~1.8.0", "zod": "^3.0.0" }\n}\n';
  assert.equal(
    bumpManifest(text).text,
    `{\n\t"name": "app",\n\t"dependencies": { "solid-js": "${SOLID_RANGE}", "@solidjs/web": "${SOLID_RANGE}", "zod": "^3.0.0" }\n}\n`,
  );
});

test("skips a manifest already on Solid 2", () => {
  assert.equal(bumpManifest(manifest({ "solid-js": "^2.1.0" })), null);
});

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

test("adds no @solidjs/web beside a solid-js it left alone", () => {
  assert.equal(bumped(manifest({ "solid-js": "catalog:" })).dependencies["@solidjs/web"], undefined);
});
