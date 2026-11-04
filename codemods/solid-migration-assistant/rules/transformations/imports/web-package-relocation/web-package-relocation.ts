import type { Edit, SgNode } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { stringLiteralValue } from "../../../../shared/analysis.ts";

/**
 * The upstream Solid commit whose worktree was read to build the allowlist
 * below: the `gitHead` published with `@solidjs/web@2.0.0-rc.21` and
 * `solid-js@2.0.0-rc.21` on npm, where `packages/web/package.json` is
 * `@solidjs/web` `2.0.0-rc.21`. The `v1.9.13` tag in the same repository and
 * the published `solid-js@1.9.13` build supply the legacy `solid-js/web` side
 * of every comparison.
 */
export const SOLID_WEB_SOURCE_COMMIT =
  "2105ffb8ca2fced55f5fac0763177fc93f97c2c2";

export const WEB_MIGRATION_GUIDE = `https://github.com/solidjs/solid/blob/${SOLID_WEB_SOURCE_COMMIT}/documentation/solid-2.0/MIGRATION.md#imports-where-things-live-now`;

export const LEGACY_WEB_MODULE = "solid-js/web";
export const WEB_RELOCATION_TARGET = "@solidjs/web";

/**
 * `solid-js/web` is *not* a pure package relocation. Unlike the five subpaths
 * handled by legacy-subpath-relocation, the web entry's export surface changed
 * between Solid 1.9.13 and 2.0.0-rc.21. Comparing the published client builds
 * (`solid-js/web/dist/web.js` at 1.9.13 against `@solidjs/web/dist/web.js` at
 * rc.21), these 1.9 exports are gone: `createDynamic`, `Index`, `Hydration`,
 * `NoHydration`, `renderToStringAsync`, `ssrClassList`, `ssrSpread`,
 * `classList`, `addEventListener`, `clearDelegatedEvents`, `setBoolAttribute`,
 * `innerHTML`, `use`, `Aliases`, `Properties`, `SVGNamespace`, `getPropAlias`,
 * `Assets`, `getAssets`, and `useAssets` (and `pipeToNodeWritable` /
 * `pipeToWritable` on the server build); `Suspense`, `ErrorBoundary`,
 * `SuspenseList`, and `mergeProps` are no longer re-exported for application
 * code (`Loading`, `Errored`, `Reveal`, and `merge` replace them; the
 * `mergeProps` that rc.21 still exports is a compiler-emitted helper marked
 * `@internal`); `Portal` lost `useShadow`, `isSVG`, and `ref` and renders
 * nothing on the server; and `isDev` is no longer pinned to `false` on the
 * server entry.
 *
 * So the module string alone never justifies a rewrite. This rule is
 * default-deny: it moves a statement only when *every* name that statement
 * imports from the module is on this allowlist, and each entry here is a name
 * that upstream proves is the same API before and after the move:
 *
 * - `render`, `hydrate` — `documentation/solid-2.0/MIGRATION.md` opens the
 *   "Imports: where things live now" section by relocating exactly this pair
 *   from `solid-js/web` to `@solidjs/web` with the import unchanged.
 *   Both are declared in `packages/web/src/client.ts` at rc.21 and re-exported
 *   from the web entry, keeping their 1.9 shapes:
 *   `render(code, element, init?, options?) => () => void` and
 *   `hydrate(code, element, options?) => () => void`.
 * - `isServer` — declared identically on all four entries: `false` in
 *   `packages/(solid/)web/src/index.ts` and `true` in the server entry, on
 *   both 1.9.13 and rc.21 (`packages/web/src/index.server.ts`).
 * - `Dynamic` is on this list because rc.21 exports it: `packages/web/src/
 *   index.ts` declares `export function Dynamic<T extends ValidComponent>(
 *   props: DynamicProps<T>): JSX.Element`, implemented as
 *   `createComponent(dynamic(() => props.component), omit(props,
 *   "component"))`, and both published rc.21 builds (`dist/web.js` and
 *   `dist/server.js`) export the name. Its user-facing contract is the 1.9.13
 *   one (`packages/solid/web/src/index.ts` at `v1.9.13`: render
 *   `props.component`, a component or native tag name, with the remaining
 *   props forwarded and the tag reactive), and the migration guide's
 *   "Dynamic components" section states that existing `<Dynamic>` code keeps
 *   working in 2.0. The same section marks `<Dynamic>` **deprecated** (no
 *   runtime warning) in favor of the `dynamic(source)` factory, so the report
 *   line for a relocation that carries `Dynamic` says so; a deprecated but
 *   exported binding is a valid relocation target, which an unexported name
 *   never was. Until rc.21 was published the identifier did not exist under
 *   `packages/` (it was absent at rc.7), and this list refused it on exactly
 *   that ground; an allowlist that promises proven bindings admits a name only
 *   against a located export site.
 *
 * Everything else — including `Portal`, `isDev`, `renderToString`,
 * `renderToStream`, `generateHydrationScript`, `getRequestEvent`, `For`,
 * `Show`, `Switch`, `Match`, `NoHydration`, `template`, `insert`, `spread`,
 * `mergeProps`, and `default` — is vetoed. Some of those names are genuinely
 * gone or changed; the rest are simply not proven here, and an unproven name
 * must block the move rather than ride along with a proven one. The read-only
 * web-import analyzer (`rules/analysis/imports/web-import/`) is unchanged and
 * still reports every statement this rule refuses.
 */
export const PROVEN_WEB_BINDINGS: ReadonlySet<string> = new Set([
  "Dynamic",
  "hydrate",
  "isServer",
  "render",
]);

/**
 * Appended to the report line of every relocation that carries `Dynamic`, so
 * a user who moves the import is also told that the component is deprecated.
 */
export const DYNAMIC_DEPRECATION_NOTE =
  "Note: Dynamic is deprecated in Solid 2 in favor of the dynamic(source) factory; it keeps working without a runtime warning.";

export type WebPackageRelocation = {
  edit: Edit;
  report: string;
};

/**
 * The only child kinds a relocatable statement may contain. Anything else —
 * `import_attribute` (`with { type: "json" }`), the `*` of `export *`, a
 * `namespace_export`, the `default` keyword of `export default "solid-js/web"`
 * — means the statement is a shape this rule has not reasoned about, so it is
 * left alone. `comment` is allowed because an interleaved comment cannot
 * change which bindings a statement introduces.
 */
const ALLOWED_IMPORT_CHILD_KINDS = new Set([
  "import",
  "type",
  "import_clause",
  "from",
  "string",
  ";",
  "comment",
]);

const ALLOWED_EXPORT_CHILD_KINDS = new Set([
  "export",
  "type",
  "export_clause",
  "from",
  "string",
  ";",
  "comment",
]);

/**
 * Returns the `named_imports` node of a statement whose entire import clause
 * is a single braced name list. Default imports (`import def, { ... }`),
 * namespace imports (`import * as web`), and side-effect imports
 * (`import "solid-js/web"`, which has no clause at all) all return null: none
 * of them names the bindings it introduces, so none can be proven safe.
 */
function namedImportsOf(statement: SgNode<TSX>): SgNode<TSX> | null {
  let clause: SgNode<TSX> | null = null;
  for (const child of statement.children()) {
    if (!ALLOWED_IMPORT_CHILD_KINDS.has(child.kind())) return null;
    if (child.kind() !== "import_clause") continue;
    if (clause !== null) return null;
    clause = child;
  }
  if (clause === null) return null;

  let named: SgNode<TSX> | null = null;
  for (const child of clause.children()) {
    if (!child.isNamed() || child.kind() === "comment") continue;
    if (child.kind() !== "named_imports") return null;
    if (named !== null) return null;
    named = child;
  }
  return named;
}

/**
 * Returns the `export_clause` of a braced re-export. A statement without a
 * `from` keyword is a local export whose string child, if any, is a value
 * rather than a module reference, and `export * from` / `export * as ns from`
 * re-export names this rule cannot enumerate.
 */
function exportClauseOf(statement: SgNode<TSX>): SgNode<TSX> | null {
  let clause: SgNode<TSX> | null = null;
  let hasFrom = false;
  for (const child of statement.children()) {
    if (!ALLOWED_EXPORT_CHILD_KINDS.has(child.kind())) return null;
    if (child.kind() === "from") hasFrom = true;
    if (child.kind() !== "export_clause") continue;
    if (clause !== null) return null;
    clause = child;
  }
  return hasFrom ? clause : null;
}

/**
 * Collects the source names a braced clause pulls out of the module, in
 * source order and deduplicated, or null when the clause names anything that
 * is not a proven binding. A specifier whose source name is a string literal
 * (`export { "render" as r } from ...`) is rejected rather than decoded: this
 * rule proves identifiers, and an arbitrary-string export name is a shape it
 * has not reasoned about.
 */
function provenBindings(
  clause: SgNode<TSX>,
  specifierKind: "import_specifier" | "export_specifier",
): string[] | null {
  const names: string[] = [];
  for (const child of clause.children()) {
    if (!child.isNamed() || child.kind() === "comment") continue;
    if (child.kind() !== specifierKind) return null;
    const name = child.field("name");
    if (name === null || name.kind() !== "identifier") return null;
    const text = name.text();
    if (!PROVEN_WEB_BINDINGS.has(text)) return null;
    if (!names.includes(text)) names.push(text);
  }
  return names.length > 0 ? names : null;
}

/**
 * Returns the statement's module source when it resolves to exactly
 * `solid-js/web`. The comparison is on the decoded string value, so
 * `"solid-js\x2fweb"` is the same specifier as `"solid-js/web"` and is
 * eligible, while `"solid-js/web/storage"` and `"vendor/solid-js/web"` are
 * different modules and are not.
 */
function legacyWebSource(statement: SgNode<TSX>): SgNode<TSX> | null {
  const source = statement.children().find((child) => child.is("string"));
  if (!source) return null;
  if (stringLiteralValue(source) !== LEGACY_WEB_MODULE) return null;
  return source;
}

function relocation(
  source: SgNode<TSX>,
  names: readonly string[],
  filename: string,
): WebPackageRelocation {
  const start = source.range().start;
  const quote = source.text()[0];
  const note = names.includes("Dynamic") ? ` ${DYNAMIC_DEPRECATION_NOTE}` : "";
  return {
    edit: source.replace(`${quote}${WEB_RELOCATION_TARGET}${quote}`),
    report: `${filename}:${start.line + 1}:${start.column + 1} Relocate ${LEGACY_WEB_MODULE} to ${WEB_RELOCATION_TARGET} for proven bindings ${names.join(", ")}.${note} Official migration guide: ${WEB_MIGRATION_GUIDE}`,
  };
}

/**
 * Maps every `solid-js/web` statement in `rootNode` whose complete named
 * binding set is proven compatible to a deterministic edit plus a
 * human-readable per-edit report. Only the module string is rewritten, so
 * aliases, inline `type` modifiers, and quote style survive untouched, and a
 * second run finds nothing because `@solidjs/web` is not the legacy
 * specifier. The caller commits the edits; this rule performs no I/O.
 */
export function relocateWebPackage(
  rootNode: SgNode<TSX>,
  filename: string,
): WebPackageRelocation[] {
  const relocations: { source: SgNode<TSX>; entry: WebPackageRelocation }[] = [];

  for (const statement of rootNode.findAll({
    rule: { kind: "import_statement" },
  })) {
    const clause = namedImportsOf(statement);
    if (clause === null) continue;
    const source = legacyWebSource(statement);
    if (source === null) continue;
    const names = provenBindings(clause, "import_specifier");
    if (names === null) continue;
    relocations.push({ source, entry: relocation(source, names, filename) });
  }

  for (const statement of rootNode.findAll({
    rule: { kind: "export_statement" },
  })) {
    const clause = exportClauseOf(statement);
    if (clause === null) continue;
    const source = legacyWebSource(statement);
    if (source === null) continue;
    const names = provenBindings(clause, "export_specifier");
    if (names === null) continue;
    relocations.push({ source, entry: relocation(source, names, filename) });
  }

  // Imports and re-exports are collected in separate passes, so sort the
  // combined result back into source order to keep edits and report lines
  // deterministic regardless of how the two forms interleave in the file.
  return relocations
    .sort((left, right) => left.source.range().start.index - right.source.range().start.index)
    .map(({ entry }) => entry);
}
