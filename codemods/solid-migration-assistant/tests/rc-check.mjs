// How a migrated project fares against the pinned Solid 2 RC, for the corpus
// check: type errors against the RC's types, files the RC compiler rejects,
// and a server render of chosen components. The project's own dependencies
// are never installed, so imports of anything but the RC resolve to nothing
// and those errors are not counted.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import ts from "typescript";
import { SOLID_VERSION } from "../shared/manifest.mjs";

// The babel plugin releases only when it changes, so it has its own version: Solid 2.0.3
// shipped with @solidjs/babel-plugin 2.0.2. Keep it in step with tests/rc-compat.test.mjs.
export const RC_PACKAGES = [
  `solid-js@${SOLID_VERSION}`,
  `@solidjs/web@${SOLID_VERSION}`,
  "@solidjs/babel-plugin@2.0.2",
  "@babel/core@7.29.7",
  "@babel/preset-typescript@7.29.7",
];

// Unresolved modules and their knock-on effects: the project's own
// dependencies (Vite's client types among them) are not installed, so these
// say nothing about the migration.
const UNRESOLVED = new Set([2307, 2792, 7016, 2688, 2875, 2882, 2664, 6053, 1259, 2732, 5097]);
const IMPORT_META_ENV = /Property 'env' does not exist on type 'ImportMeta'/;
const SKIPPED_DIRECTORIES = /^(node_modules|\.git|dist|build|\.output|\.vinxi|\.solid|\.nitro)$/;
const JSX_HINT = /<(?:[A-Za-z]|>)/;

/** Installs the RC packages into `directory`; returns the spawn result. */
export function installRc(directory) {
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, "package.json"), '{ "name": "rc-check", "private": true, "type": "module" }\n');
  writeFileSync(join(directory, "compile.mjs"), COMPILE_SCRIPT);
  writeFileSync(join(directory, "render-hooks.mjs"), RENDER_HOOKS);
  writeFileSync(join(directory, "render-loader.mjs"), RENDER_LOADER);
  writeFileSync(join(directory, "render.mjs"), RENDER_SCRIPT);
  return spawnSync("npm", ["install", "--no-audit", "--no-fund", "--package-lock=false", "--save-exact", ...RC_PACKAGES], {
    cwd: directory,
    encoding: "utf8",
    env: { ...process.env, CI: "true", NO_COLOR: "1" },
  });
}

/** Points `root/node_modules` at the RC install, unless the project has its own. */
export function linkRc(root, rcDirectory) {
  const link = join(root, "node_modules");
  if (!existsSync(link)) symlinkSync(join(rcDirectory, "node_modules"), link, "dir");
}

/** Type errors in the project's own .ts and .tsx files against the RC types. */
export function countTypeErrors(root) {
  const files = sourceFiles(root, /\.(ts|tsx)$/).filter((file) => !/\.d\.ts$|\.(test|spec)\./.test(file));
  const program = ts.createProgram(files, {
    noEmit: true,
    strict: true,
    noImplicitAny: false,
    skipLibCheck: true,
    jsx: ts.JsxEmit.Preserve,
    jsxImportSource: "@solidjs/web",
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    target: ts.ScriptTarget.ES2022,
    lib: ["lib.es2023.d.ts", "lib.dom.d.ts", "lib.dom.iterable.d.ts"],
    paths: pathAliases(root),
    types: [],
    resolveJsonModule: true,
    allowImportingTsExtensions: true,
    esModuleInterop: true,
  });
  return ts
    .getPreEmitDiagnostics(program)
    .filter(
      (diagnostic) =>
        diagnostic.file &&
        !UNRESOLVED.has(diagnostic.code) &&
        !IMPORT_META_ENV.test(ts.flattenDiagnosticMessageText(diagnostic.messageText, " ")) &&
        !relative(root, diagnostic.file.fileName).startsWith(".."),
    )
    .length;
}

/** Files the RC compiler rejects, as `file: first line of the error`. */
export function compileErrors(root, rcDirectory) {
  const files = sourceFiles(root, /\.(jsx|tsx|js)$/).filter(
    (file) => !file.endsWith(".js") || JSX_HINT.test(readFileSync(file, "utf8")),
  );
  const result = spawnSync(process.execPath, ["compile.mjs"], {
    cwd: rcDirectory,
    input: JSON.stringify(files),
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status !== 0) throw new Error(`the RC compiler check failed to run: ${result.stderr}`);
  return JSON.parse(result.stdout).map(({ file, error }) => `${relative(root, file)}: ${error}`);
}

/**
 * Server-renders the default export of `entry` with the RC; styles and
 * images are stubbed. Returns the HTML, or throws with the render's error.
 */
export function renderOnServer(entry, rcDirectory) {
  const result = spawnSync(process.execPath, ["--import", "./render-hooks.mjs", "render.mjs", entry], {
    cwd: rcDirectory,
    encoding: "utf8",
    timeout: 60_000,
  });
  if (result.status !== 0) throw new Error(`${relative(rcDirectory, entry)} did not render: ${result.stderr.trim().split("\n").slice(0, 6).join("\n")}`);
  return result.stdout;
}

function sourceFiles(root, extension) {
  const files = [];
  const walk = (directory) => {
    for (const name of readdirSync(directory)) {
      if (SKIPPED_DIRECTORIES.test(name)) continue;
      const path = join(directory, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (extension.test(name)) files.push(path);
    }
  };
  walk(root);
  return files;
}

/** `compilerOptions.paths` from every tsconfig, first declaration wins. */
function pathAliases(root) {
  const paths = {};
  for (const file of sourceFiles(root, /^tsconfig.*\.json$/)) {
    const options = ts.readConfigFile(file, ts.sys.readFile).config?.compilerOptions;
    if (!options?.paths) continue;
    const base = join(dirname(file), options.baseUrl ?? ".");
    for (const [alias, targets] of Object.entries(options.paths)) {
      paths[alias] ??= targets.map((target) => join(base, target));
    }
  }
  return paths;
}

const COMPILE_SCRIPT = `import { transformAsync } from "@babel/core";
import { readFileSync } from "node:fs";

let input = "";
for await (const chunk of process.stdin) input += chunk;
const errors = [];
for (const file of JSON.parse(input)) {
  const typescript = /\\.tsx$/.test(file);
  try {
    await transformAsync(readFileSync(file, "utf8"), {
      filename: file,
      babelrc: false,
      configFile: false,
      presets: typescript ? [["@babel/preset-typescript", { isTSX: true, allExtensions: true }]] : [],
      plugins: [["@solidjs/babel-plugin", { generate: "dom", hydratable: false }]],
    });
  } catch (error) {
    errors.push({ file, error: String(error.message).split("\\n")[0].replace(file, "").replace(/^: /, "").slice(0, 200) });
  }
}
console.log(JSON.stringify(errors));
`;

const RENDER_HOOKS = `import { register } from "node:module";
register("./render-loader.mjs", import.meta.url);
`;

const RENDER_SCRIPT = `import { renderToString } from "@solidjs/web";
import { pathToFileURL } from "node:url";

const { default: Component } = await import(pathToFileURL(process.argv[2]).href);
const html = renderToString(() => Component({}));
console.log(html.replace(/ data-hk="[^"]*"/g, ""));
process.exit(0);
`;

const RENDER_LOADER = `import { transformAsync } from "@babel/core";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SOURCE = /\\.(tsx|jsx|ts|js)$/;
const STUB = /\\.(css|scss|sass|less|svg|png|jpe?g|gif|webp)$/;

export async function resolve(specifier, context, next) {
  if ((specifier.startsWith(".") || specifier.startsWith("/")) && context.parentURL?.startsWith("file:")) {
    const base = new URL(specifier, context.parentURL);
    if (!existsSync(fileURLToPath(base))) {
      for (const extension of [".tsx", ".ts", ".jsx", ".js", "/index.tsx", "/index.ts", "/index.jsx", "/index.js"]) {
        const candidate = new URL(base.href + extension);
        if (existsSync(fileURLToPath(candidate))) return { url: candidate.href, shortCircuit: true };
      }
    }
  }
  return next(specifier, context);
}

export async function load(url, context, next) {
  if (STUB.test(url)) {
    const source = /\\.module\\.\\w+$/.test(url)
      ? "export default new Proxy({}, { get: (_, key) => String(key) });"
      : \`export default \${JSON.stringify(url.split("/").pop())};\`;
    return { format: "module", source, shortCircuit: true };
  }
  if (url.startsWith("file:") && SOURCE.test(url) && !url.includes("/node_modules/")) {
    const file = fileURLToPath(url);
    const result = await transformAsync(readFileSync(file, "utf8"), {
      filename: file,
      babelrc: false,
      configFile: false,
      presets: [["@babel/preset-typescript", { isTSX: true, allExtensions: true, onlyRemoveTypeImports: false }]],
      plugins: [["@solidjs/babel-plugin", { generate: "ssr", hydratable: false }]],
    });
    return { format: "module", source: result.code, shortCircuit: true };
  }
  return next(url, context);
}
`;
