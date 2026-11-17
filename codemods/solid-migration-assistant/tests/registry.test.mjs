// Specs for settling unknown Solid libraries against the npm registry.
import assert from "node:assert/strict";
import { test } from "node:test";
import { settleUnknownDependencies } from "../shared/registry.mjs";

const unknown = { package: "solid-thing", rule: "project/dependencies", headline: "Check that solid-thing supports Solid 2.", why: "", guidance: "" };
const registry = (tags, versions) => async () => ({
  ok: true,
  json: async () => ({ "dist-tags": tags, versions: Object.fromEntries(Object.entries(versions).map(([version, peer]) => [version, peer === null ? {} : { peerDependencies: { "solid-js": peer } }])) }),
});
const headlines = async (fetchImpl, options = {}) =>
  (await settleUnknownDependencies([unknown], { fetchImpl, ...options })).map((finding) => finding.headline);

test("names the latest release when it allows Solid 2", async () => {
  assert.deepEqual(await headlines(registry({ latest: "2.0.0" }, { "1.0.0": "^1.6.0", "2.0.0": "^2.0.0" })), [
    "Move solid-thing to 2.0.0 (npm latest), which supports Solid 2.",
  ]);
});

test("names a prerelease tag when only it allows Solid 2", async () => {
  assert.deepEqual(await headlines(registry({ latest: "1.0.0", next: "2.0.0-next.3" }, { "1.0.0": "^1.6.0", "2.0.0-next.3": "^2.0.0-rc.1" })), [
    "Move solid-thing to 2.0.0-next.3 (npm tag next), which supports Solid 2.",
  ]);
});

test("says there is no release when every version is on Solid 1", async () => {
  assert.deepEqual(await headlines(registry({ latest: "0.3.3" }, { "0.3.3": "^1.6.0" })), ["solid-thing has no release for Solid 2."]);
});

test("drops a package that never names solid-js", async () => {
  assert.deepEqual(await headlines(registry({ latest: "1.0.0" }, { "1.0.0": null })), []);
});

test("keeps the finding as it was when the registry can't be read", async () => {
  assert.deepEqual(await headlines(async () => ({ ok: false })), ["Check that solid-thing supports Solid 2."]);
});

test("asks the registry nothing offline", async () => {
  let asked = false;
  await settleUnknownDependencies([unknown], { offline: true, fetchImpl: async () => { asked = true; } });
  assert.equal(asked, false);
});

test("strips the package marker from every finding", async () => {
  const [finding] = await settleUnknownDependencies([unknown], { offline: true });
  assert.equal("package" in finding, false);
});
