// Specs for migrate mode's pnpm-workspace.yaml catalog edits.
import assert from "node:assert/strict";
import { test } from "node:test";
import { bumpCatalogs, catalogPlan } from "../shared/catalog.mjs";
import { SOLID_RANGE } from "../shared/manifest.mjs";

const workspace = (catalog) => `packages:\n  - packages/*\n${catalog}onlyBuiltDependencies:\n  - esbuild\n`;

test("moves solid-js in the default catalog and adds @solidjs/web after it", () => {
  assert.equal(
    bumpCatalogs(workspace("catalog:\n  solid-js: ^1.9.5\n  zod: ^3.0.0\n")).text,
    workspace(`catalog:\n  solid-js: ${SOLID_RANGE}\n  "@solidjs/web": ${SOLID_RANGE}\n  zod: ^3.0.0\n`),
  );
});

test("moves solid-js in a named catalog", () => {
  const result = bumpCatalogs(workspace("catalogs:\n  legacy:\n    solid-js: 1.9.3\n    \"@solidjs/web\": 1.9.3\n"));
  assert.deepEqual(result.changes.map(({ catalog, name, to }) => [catalog, name, to]), [
    ["legacy", "solid-js", SOLID_RANGE],
    ["legacy", "@solidjs/web", SOLID_RANGE],
  ]);
});

test("moves a dependency with a Solid 2 release in the same catalog, keeping its quotes and comment", () => {
  const result = bumpCatalogs(workspace('catalog:\n  solid-js: ^1.9.5\n  "@solidjs/router": "^0.15.1" # router\n'));
  assert.match(result.text, /"@solidjs\/router": "\^2\.0\.0" # router/);
});

test("leaves a catalog already on Solid 2 alone", () => {
  assert.equal(bumpCatalogs(workspace(`catalog:\n  solid-js: ${SOLID_RANGE}\n  "@solidjs/web": ${SOLID_RANGE}\n`)), null);
});

test("never moves a catalog dependency already on its Solid 2 line back", () => {
  const result = bumpCatalogs(workspace('catalog:\n  solid-js: ^1.9.5\n  "@solidjs/router": ^2.3.0\n'));
  assert.deepEqual(result.changes.map(({ name }) => name), ["solid-js", "@solidjs/web"]);
});

test("swaps a renamed package for its successor in place, quoting the scoped key", () => {
  // codeimage's catalogs.next, reduced.
  const text = workspace("catalogs:\n  next:\n    solid-js: ^1.9.12\n    vite: ^8.0.3\n    vite-plugin-solid: ^2.11.11 # plugin\n    'solid-testing-library': '^0.5.1'\n");
  const result = bumpCatalogs(text);
  assert.equal(
    result.text,
    workspace(`catalogs:\n  next:\n    solid-js: ${SOLID_RANGE}\n    "@solidjs/web": ${SOLID_RANGE}\n    vite: ^8.0.3\n    "@solidjs/vite-plugin": ^3.0.1 # plugin\n    '@solidjs/testing-library': '1.0.0-rc.2'\n`),
  );
  assert.deepEqual(catalogPlan(text), {
    web: ["next"],
    renames: [["next", "vite-plugin-solid", "@solidjs/vite-plugin"], ["next", "solid-testing-library", "@solidjs/testing-library"]],
  });
});

test("leaves a renamed package whose successor is in the catalog too, and plans nothing without a workspace file", () => {
  const result = bumpCatalogs(workspace('catalog:\n  vite-plugin-solid: ^2.11.0\n  "@solidjs/vite-plugin": ^3.0.1\n'));
  assert.deepEqual(result.skipped.map((skip) => skip.name), ["vite-plugin-solid"]);
  assert.deepEqual(catalogPlan(""), { web: [], renames: [] });
});
