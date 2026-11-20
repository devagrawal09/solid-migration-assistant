// Specs for the package.json, tsconfig and JSON Babel config checks the
// launcher and the registry workflow share (shared/project.mjs), and the
// JSON Babel config edit migrate makes (shared/babel.mjs).
import assert from "node:assert/strict";
import { test } from "node:test";
import { bumpBabelConfig } from "../shared/babel.mjs";
import { babelConfigFindings, configFindings, manifestFindings } from "../shared/project.mjs";

const manifest = (fields) => `${JSON.stringify({ name: "app", ...fields }, null, 2)}\n`;
const headlines = (findings) => findings.map((finding) => `${finding.line}:${finding.column} ${finding.rule} ${finding.headline}`);

test("reports create-vite's Solid template: solid-js, @solidjs/web and vite-plugin-solid", () => {
  const text = manifest({
    dependencies: { "solid-js": "^1.9.18" },
    devDependencies: { "@types/node": "^24.19.2", typescript: "~7.0.2", vite: "^8.3.6", "vite-plugin-solid": "^2.11.15" },
  });
  assert.deepEqual(headlines(manifestFindings("package.json", text, "")), [
    "1:1 project/solid-version Move this project's Solid dependencies to solid-js@2.0.3.",
    "10:5 project/dependencies Replace vite-plugin-solid with its Solid 2 successor.",
  ]);
});

test("reports a vite older than 8 beside the Solid Vite plugin", () => {
  const findings = manifestFindings("package.json", manifest({ dependencies: { "solid-js": "^2.0.3", "@solidjs/web": "^2.0.3" }, devDependencies: { vite: "^5.4.0", "@solidjs/vite-plugin": "^3.0.1" } }), "");
  assert.deepEqual(headlines(findings), ["8:5 project/dependencies Move vite to 8 or 9 for @solidjs/vite-plugin."]);
  assert.match(findings[0].why, /vite "\^5\.4\.0".*Node 22\.12/);
});

test("accepts vite 8, 9 or an open lower bound, and skips vite without the Solid plugin", () => {
  for (const vite of ["^8.0.0", "~9.1.0", ">=6", "^7.0.0 || ^8.0.0"]) {
    assert.deepEqual(manifestFindings("package.json", manifest({ devDependencies: { vite, "@solidjs/vite-plugin": "^3.0.1" } }), ""), [], vite);
  }
  assert.deepEqual(manifestFindings("package.json", manifest({ devDependencies: { vite: "^5.0.0" } }), ""), []);
});

test("asks a library that peers on solid-js to peer on @solidjs/web too", () => {
  const library = { exports: { ".": "./dist/index.js" }, peerDependencies: { "solid-js": "^2.0.0" }, devDependencies: { "solid-js": "^2.0.3", "@solidjs/web": "^2.0.3" } };
  assert.deepEqual(headlines(manifestFindings("package.json", manifest(library), "")), [
    "6:3 project/dependencies Declare @solidjs/web as a peer dependency of this library.",
  ]);
  assert.deepEqual(manifestFindings("package.json", manifest({ ...library, peerDependencies: { "solid-js": "^2.0.0", "@solidjs/web": "^2.0.0" } }), ""), []);
  // An app (no exports, main or module) has no peers to publish.
  assert.deepEqual(manifestFindings("package.json", manifest({ ...library, exports: undefined }), ""), []);
});

test("reports a moduleResolution that ignores package exports, at its line", () => {
  const text = '{\n  // comment\n  "compilerOptions": {\n    "moduleResolution": "Node",\n    "jsx": "preserve",\n  },\n}\n';
  const findings = configFindings("tsconfig.json", text);
  assert.deepEqual(headlines(findings), ['4:5 project/module-resolution Change moduleResolution from "Node" to "bundler" (or "nodenext").']);
  for (const resolution of ["bundler", "nodenext", "node16"]) {
    assert.deepEqual(configFindings("tsconfig.json", JSON.stringify({ compilerOptions: { moduleResolution: resolution } })), [], resolution);
  }
});

test("a file that doesn't parse has no findings", () => {
  assert.deepEqual(manifestFindings("package.json", "{ not json", ""), []);
  assert.deepEqual(configFindings("tsconfig.json", "also not json"), []);
});

test("moves babel-preset-solid to plugins in a .babelrc, keeping comments and layout", () => {
  const text = `{
  // Solid's JSX
  "presets": ["solid"],
}
`;
  const bumped = bumpBabelConfig(text);
  assert.equal(bumped.text, text.replace('"presets": ["solid"]', '"plugins": ["@solidjs/babel-plugin"]'));
  assert.deepEqual(bumped.moved, [{ line: 3, column: 15 }]);
  assert.deepEqual(bumped.left, []);
});

test("moves the preset with its options into an existing plugins list, in env and overrides", () => {
  const text = `{
  "presets": ["@babel/preset-env", ["babel-preset-solid", { "generate": "ssr", "hydratable": true, "moduleName": "solid-js/web" }], "@babel/preset-typescript"],
  "plugins": [
    "@babel/plugin-syntax-decorators"
  ],
  "env": { "test": { "presets": ["solid", "@babel/preset-typescript"] } },
  "overrides": [{ "test": "*.jsx", "presets": ["solid"], "plugins": ["@solidjs/babel-plugin"] }]
}
`;
  assert.equal(bumpBabelConfig(text).text, `{
  "presets": ["@babel/preset-env", "@babel/preset-typescript"],
  "plugins": [
    "@babel/plugin-syntax-decorators",
    ["@solidjs/babel-plugin", { "generate": "ssr", "hydratable": true, "moduleName": "@solidjs/web" }]
  ],
  "env": { "test": { "presets": ["@babel/preset-typescript"], "plugins": ["@solidjs/babel-plugin"] } },
  "overrides": [{ "test": "*.jsx", "plugins": ["@solidjs/babel-plugin"] }]
}
`);
  // A second run has nothing left to move.
  assert.equal(bumpBabelConfig(bumpBabelConfig(text).text), null);
});

test("leaves a Babel preset whose options changed or that a later preset ran before, with the reason", () => {
  const left = (presets, extra = "") => bumpBabelConfig(`{ "presets": ${presets}${extra} }`).left.map((entry) => entry.reason);
  assert.match(left('[["solid", { "builtIns": ["For"] }]]')[0], /^builtIns lists Solid 1 components/);
  assert.match(left('[["solid", { "omitServerOnlyTemplates": true }]]')[0], /no omitServerOnlyTemplates option/);
  assert.match(left('[["solid", { "staticMarker": "@once" }]]')[0], /static marker changed/);
  assert.match(left('[["solid", { "moduleName": "solid-three" }]]')[0], /custom renderer/);
  assert.match(left('[["solid", { "dev": true }]]')[0], /^dev isn't a babel-preset-solid option/);
  assert.match(left('[["solid", "ssr"]]')[0], /aren't an object literal/);
  assert.match(left('["solid", "@babel/preset-env"]')[0], /^@babel\/preset-env ran before it/);
  assert.match(left('["solid"]', ', "plugins": "macros"')[0], /isn't an array literal/);
  assert.match(left('[["solid", { "generate": "ssr" }]]', ', "plugins": ["@solidjs/babel-plugin"]')[0], /already names/);
  assert.deepEqual(left('["solid", "babel-preset-solid"]').length, 2);
  // Nothing to move, or not JSON: no edit.
  assert.equal(bumpBabelConfig('{ "presets": ["@babel/preset-env"] }'), null);
  assert.equal(bumpBabelConfig("module.exports = {}"), null);
});

test("reports a JSON Babel config's Solid preset with what migrate does about it", () => {
  const findings = babelConfigFindings("babel.config.json", '{\n  "presets": ["solid", "@babel/preset-env"],\n  "env": { "test": { "presets": ["solid"] } }\n}\n');
  assert.deepEqual(headlines(findings), [
    "3:34 tooling/build-config Replace the babel-preset-solid preset with the @solidjs/babel-plugin plugin.",
    "2:15 tooling/build-config Replace the babel-preset-solid preset with the @solidjs/babel-plugin plugin.",
  ]);
  assert.match(findings[0].guidance, /migrate makes both edits/);
  assert.match(findings[1].guidance, /leaves this config, because @babel\/preset-env ran before it/);
  assert.deepEqual(babelConfigFindings(".babelrc", '{ "presets": ["@babel/preset-env"] }'), []);
});
