// Specs for the package.json and tsconfig checks the launcher and the
// registry workflow share (shared/project.mjs).
import assert from "node:assert/strict";
import { test } from "node:test";
import { configFindings, manifestFindings } from "../shared/project.mjs";

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
