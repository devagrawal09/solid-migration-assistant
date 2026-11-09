import type { Codemod } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { analyzeEcosystemImports } from "./ecosystem-apis.ts";

const testEcosystemImportsRule: Codemod<TSX> = async (root) => {
  const filename = root.relativeFilename().replaceAll("\\", "/");
  const guidance = analyzeEcosystemImports(root.root(), { filename });
  const expected = [
    ["1:10", "migrate this A import from @solidjs/router"],
    ["1:13", "migrate this Route import from @solidjs/router"],
    ["1:20", "migrate this Router import from @solidjs/router"],
    ["1:28", "replace this deprecated action import from @solidjs/router"],
    ["1:36", "migrate this cache import from @solidjs/router"],
    ["1:43", "migrate this createAsync import from @solidjs/router"],
    ["1:56", "review this revalidate import from @solidjs/router"],
    ["2:10", "migrate this MetaProvider import from @solidjs/meta"],
    ["2:31", "migrate this useHead import from @solidjs/meta"],
    ["3:10", "migrate this clientOnly import from @solidjs/start"],
    ["4:10", "migrate this FileRoutes import from @solidjs/start/router"],
    ["5:33", "migrate this @solidjs/start/server import, which has no Solid 2 release"],
    ["6:10", "migrate this getCookie import from vinxi/http"],
    ["6:38", "migrate this vinxi/http import, which has no Solid 2 release"],
  ];
  const actual = guidance.map((entry) => [
    /^[^:]*:(\d+:\d+) /.exec(entry)?.[1] ?? "?",
    /^[^:]*:\d+:\d+ Manual review required: (.*?)(?:, which Solid 2 removes or moves|, whose Solid 2 behavior changed)?\.\n/.exec(entry)?.[1] ?? entry.split("\n")[0],
  ]);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`unexpected ecosystem findings:\n${JSON.stringify(actual, null, 1)}`);
  }
  if (!guidance.find((entry) => entry.startsWith(`${filename}:6:38 `))?.includes("(setCookie)")) {
    throw new Error("the generic vinxi finding must name the unlisted setCookie import");
  }
  if (guidance.some((entry) => !/Official migration guide: https:\/\/(?:www\.npmjs\.com\/package\/@solidjs\/(?:router|meta|vite-plugin)\/v\/|github\.com\/solidjs\/solid\/blob\/2105ffb8ca2fced55f5fac0763177fc93f97c2c2\/)/.test(entry))) {
    throw new Error("every finding must link a pinned reference");
  }
  return null;
};

export default testEcosystemImportsRule;
