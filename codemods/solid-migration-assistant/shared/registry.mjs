import { allowsSolid2 } from "./peers.mjs";

const REGISTRY = "https://registry.npmjs.org";
const PREFERRED_TAGS = ["latest", "next", "rc", "beta", "alpha"];

/**
 * What the public npm registry says about `name` and Solid 2:
 * - `{ status: "release", version, tag }`: a published version whose
 *   solid-js peer (or dependency) range allows Solid 2. Dist-tags are tried
 *   first in the order latest, next, rc, beta, alpha, then any other tag,
 *   then every version newest first (tag is null then).
 * - `{ status: "none", latest }`: some version names solid-js, none allows 2.
 * - `{ status: "not-solid" }`: no version names solid-js at all.
 * - `null`: the registry could not be read.
 */
export async function solid2Release(name, { fetchImpl = fetch, timeoutMs = 5000 } = {}) {
  let metadata;
  try {
    const response = await fetchImpl(`${REGISTRY}/${name.replace("/", "%2f")}`, {
      headers: { accept: "application/vnd.npm.install-v1+json" },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) return null;
    metadata = await response.json();
  } catch {
    return null;
  }
  const versions = metadata?.versions ?? {};
  const solidRange = (version) => versions[version]?.peerDependencies?.["solid-js"] ?? versions[version]?.dependencies?.["solid-js"];
  const tags = Object.entries(metadata?.["dist-tags"] ?? {}).sort(
    ([left], [right]) => rank(left) - rank(right),
  );
  for (const [tag, version] of tags) {
    if (allowsSolid2(solidRange(version))) return { status: "release", version, tag };
  }
  const newestFirst = Object.keys(versions).reverse();
  const supporting = newestFirst.find((version) => allowsSolid2(solidRange(version)));
  if (supporting !== undefined) return { status: "release", version: supporting, tag: null };
  if (!newestFirst.some((version) => solidRange(version) !== undefined)) return { status: "not-solid" };
  return { status: "none", latest: metadata["dist-tags"]?.latest ?? newestFirst[0] ?? null };
}

function rank(tag) {
  const index = PREFERRED_TAGS.indexOf(tag);
  return index === -1 ? PREFERRED_TAGS.length : index;
}

/**
 * Settles each "Check that X supports Solid 2" finding against the npm
 * registry: a library with a Solid 2 release gets that version, one with
 * none says so, one that never names solid-js is dropped, and one the
 * registry can't answer for keeps its original wording. The `package`
 * field that marks these findings is removed either way.
 */
export async function settleUnknownDependencies(findings, { fetchImpl = fetch, offline = false } = {}) {
  const lookups = new Map();
  if (!offline) {
    for (const finding of findings) {
      if (finding.package !== undefined && !lookups.has(finding.package)) {
        lookups.set(finding.package, solid2Release(finding.package, { fetchImpl }));
      }
    }
  }
  const settled = [];
  for (const { package: name, ...finding } of findings) {
    const answer = name === undefined ? null : await lookups.get(name);
    if (answer?.status === "not-solid") continue;
    if (answer?.status === "release") {
      const where = answer.tag === null ? "" : answer.tag === "latest" ? " (npm latest)" : ` (npm tag ${answer.tag})`;
      settled.push({
        ...finding,
        headline: `Move ${name} to ${answer.version}${where}, which supports Solid 2.`,
        why: `${name} isn't in this analyzer's dependency table. On npm, ${name}@${answer.version}${where} declares a solid-js range that allows Solid 2; the version this project has installed doesn't, or wasn't installed to check.`,
        guidance: `Move ${name} to ${answer.version}${answer.tag !== null && answer.tag !== "latest" ? " (a prerelease line, so pin it exactly)" : ""} and read its changelog for API changes before running the build.`,
      });
      continue;
    }
    if (answer?.status === "none") {
      settled.push({
        ...finding,
        headline: `${name} has no release for Solid 2.`,
        why: `No published version of ${name}${answer.latest ? ` (latest ${answer.latest})` : ""} declares a solid-js range that allows Solid 2, so its Solid 1 build is what installs.`,
        guidance: `Replace ${name}, vendor and port it, or keep this project on Solid 1 until it ships a Solid 2 build. A Solid 1 build of it that imports solid-js/web or solid-js/store fails the Solid 2 build inside node_modules.`,
      });
      continue;
    }
    settled.push(finding);
  }
  return settled;
}
