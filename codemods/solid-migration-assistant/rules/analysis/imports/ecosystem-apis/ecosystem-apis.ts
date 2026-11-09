import type { SgNode } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { stringLiteralValue } from "../../../../shared/analysis.ts";
import { SOLID_SOURCE_COMMIT } from "../../../../shared/target.ts";

/**
 * Import-level findings for the Solid 1 ecosystem packages that change most
 * with Solid 2: `@solidjs/router` (0.x / 1.x to 2.0.0-next.44),
 * `@solidjs/meta` (0.29 to 1.0.0-next.2 and core `useHead`), and
 * `@solidjs/start` / `vinxi` (no Solid 2 release; replaced by
 * `@solidjs/vite-plugin` start mode plus core runtimes). The table was
 * audited on 2026-11-09 by comparing the published Solid 1 and Solid 2
 * tarballs' exports and their READMEs and changelogs; each guidance string
 * names the replacement, and each link points at the exact version read.
 *
 * Only names whose change requires action are listed. Names that still
 * exist and only changed in edge cases (`useNavigate` and `useResolvedPath`
 * under a `base`, `useParams` now decoding) are not reported, to keep the
 * output actionable; the router guide linked from every router finding
 * covers them. Every other import from `@solidjs/start` or `vinxi` gets one
 * generic finding, because neither package has a Solid 2 release.
 */
type Tier = "build" | "behavior" | "deprecated";
type Entry = { tier: Tier; replacement: string; guidance: string };

const ROUTER_GUIDE = "https://www.npmjs.com/package/@solidjs/router/v/2.0.0-next.44";
const META_GUIDE = "https://www.npmjs.com/package/@solidjs/meta/v/1.0.0-next.2";
const START_GUIDE = "https://www.npmjs.com/package/@solidjs/vite-plugin/v/3.0.0-next.57";
const SSR_GUIDE = `https://github.com/solidjs/solid/blob/${SOLID_SOURCE_COMMIT}/documentation/solid-2.0/12-ssr-http.md#migration--replacement`;

const build = (replacement: string, guidance: string): Entry => ({ tier: "build", replacement, guidance });
const behavior = (replacement: string, guidance: string): Entry => ({ tier: "behavior", replacement, guidance });
const deprecated = (replacement: string, guidance: string): Entry => ({ tier: "deprecated", replacement, guidance });

const ROUTER: Record<string, Entry> = {
  Router: build("a createRouter({ routes }) instance rendered as <Router>{(props) => ...}</Router>", "Create the router outside JSX from route config objects; the root prop becomes the render-prop child and rootPreload becomes the config preload option."),
  HashRouter: build("createRouter({ routes, history: hashHistory() })", "Pass the hashHistory adapter from @solidjs/router as the history option."),
  MemoryRouter: build("createRouter({ routes, history: memoryHistory(initialPath) })", "Pass the memoryHistory adapter, which also drives navigation in tests."),
  StaticRouter: build("the router instance, whose server location comes from the request event or the <Router url> prop", "Remove StaticRouter; outside a request scope pass url to the router instance."),
  Route: build("route config objects { path, component, preload, matchFilters, info, children }", "Convert each <Route> to a config object passed to createRouter({ routes }); nesting becomes children arrays, and defineRoutes keeps paths typed."),
  createMemoryHistory: build("memoryHistory(initialPath)", "Replace it with the memoryHistory adapter passed to createRouter as history."),
  A: build("a plain <a href> with replace, noscroll, and state attributes; active styling through [data-active] or [aria-current=\"page\"]", "Replace <A> with <a>, move activeClass, inactiveClass, and end to CSS attribute selectors, and check relative hrefs, which now resolve with browser URL semantics."),
  Navigate: build("useNavigate() called during component setup, or a redirect from a route preload", "Call navigate in the component body or throw a redirect in preload; a function href must be rewritten by hand."),
  useCurrentMatches: build("useRouteMatches", "Rename the import and calls; the behavior is the same."),
  cache: build("query", "cache was a deprecated alias of query in 1.x and is gone in 2.x; import query instead."),
  createAsync: build("createMemo(() => queryFn(args)) from solid-js inside a Loading boundary", "Read query results with an async createMemo; initialValue, deferStream, and .latest need manual mapping."),
  createAsyncStore: build("createProjection(() => queryFn(args), seed) from solid-js", "Use createProjection or function-form createStore for deep reactive data; review any reconcile options."),
  useSubmission: build("useSubmissions(action).at(-1) for settled results, and createOptimistic or createOptimisticStore with formAction(...).onSubmit for pending UI", "Submissions are now settled history with no pending flag, so move in-flight UI to Solid's optimistic primitives."),
  redirect: build("redirect from @solidjs/web", "Change the import to @solidjs/web; a leading-slash path is now a full path and is not prefixed with the router base."),
  reload: build("reload from @solidjs/web", "Change the import to @solidjs/web."),
  json: build("respond(data, init) from @solidjs/web", "Replace json with respond imported from @solidjs/web."),
  createRouter: build("createRouter(config), now the app factory that returns the router instance", "The 1.x export was a low-level integration factory with get, set, and init; custom integrations become history adapters."),
  CustomResponse: build("ResponseHelperInit and the response helpers from @solidjs/web", "CustomResponse and RouterResponseInit are gone; use the @solidjs/web response helper types."),
  RouteLoadFunc: build("RoutePreloadFunc and the route preload key", "The deprecated load key and the RouteLoadFunc types are removed; use preload."),
  RouteProps: build("RouteProps<PathOrPattern, Data>, which now types a route component's props", "The name now types route component props rather than <Route> element props, so update its uses."),
  RouterProps: build("RouterProps of the router instance", "The name now describes the router instance's props; update its uses."),
  action: deprecated("formAction (type FormAction)", "action remains a deprecated alias with a dev warning; rename it, and replace the removed onComplete option with .onSettled(hook)."),
  useAction: deprecated("a direct call of the server function or core action", "useAction is deprecated with a dev warning; the router applies revalidation and redirects on any server function call."),
  useSubmissions: behavior("useSubmissions without .pending", "Neither the array nor a submission has .pending any more, and retry() now returns a Promise; reads of .pending silently become undefined."),
  revalidate: behavior("revalidate, which now returns void", "Awaiting revalidate() no longer waits for the refetch to finish."),
  RouterContext: behavior("useIsRouting(), useLocation(), and isPending or latest from solid-js", "RouterContext no longer carries isRouting or pendingTarget and is documented as opaque."),
};

const META: Record<string, Entry> = {
  MetaProvider: build("nothing: delete the provider", "The head registry is ambient in Solid 2, so remove MetaProvider and any server tags plumbing."),
  MetaContext: build("useHead from @solidjs/web", "Code that read MetaContext must use the core head registry instead."),
  useHead: build("useHead from @solidjs/web, taking { tag, props, key? }, an array, or a function", "Move the import to @solidjs/web; the descriptor shape changed, and id, setting, and ref are gone."),
  Meta: behavior("Meta from @solidjs/meta@1.0.0-next.2", "Meta tags now deduplicate by name, property, or http-equiv with the last one winning; use Head or distinct key props for deliberate sets."),
  Base: behavior("Base from @solidjs/meta@1.0.0-next.2 (server shell only)", "Base and Meta charset are ignored with a warning on the client, and the ref, escape, and event props are gone from every head tag."),
};

const START: Record<string, Record<string, Entry>> = {
  "@solidjs/start": {
    clientOnly: build("clientOnly from @solidjs/web", "Default-export loaders move directly; a loader resolving to a named component needs clientOnly(() => import(m), { export: \"Name\" })."),
    GET: build("GET from @solidjs/web/server-functions", "Router query() already declares GET for server functions, so a GET wrapper inside query is redundant."),
    HttpStatusCode: build("httpStatus(code, text?) from @solidjs/web", "Core ships a function, not a component; call it in the component body or a route preload."),
    HttpHeader: build("httpHeader(name, value, { append? }) from @solidjs/web", "Replace the component with a function call in the owning reactive scope."),
    getServerFunctionMeta: build("no verified equivalent", "getServerFunctionMetadata(fn) in @solidjs/web reads a reference's declaration, not the currently executing function, so it is not a drop-in."),
  },
  "@solidjs/start/config": {
    defineConfig: build("solid({ start: {...}, ssr: true, serverFunctions: true }) from @solidjs/vite-plugin in vite.config.ts, plus fileRoutes() from filesystem-routing/vite", "Delete app.config.ts and configure Vite directly; presets, islands, and data-only rendering have no verified equivalent."),
  },
  "@solidjs/start/server": {
    createHandler: build("the generated server entry of @solidjs/vite-plugin start mode, or an authored render() using renderToStream from @solidjs/web", "Delete src/entry-server.tsx to use the generated entry; if it stays it must export render(request, context). Handler mode async maps to start.renderMode; mode sync has no equivalent."),
    StartServer: build("src/Document.tsx rendering props.children and <HydrationScript />", "The document no longer receives assets or scripts props, because the plugin injects the client entry."),
    APIEvent: build("APIEvent / APIHandler from filesystem-routing/api", "Enable fileRoutes({ httpMethods: true }) and add createAPIHandler(routes) to start.middleware; the event carries request and params."),
    FetchEvent: build("StartRequestEvent from @solidjs/vite-plugin or RequestEvent from @solidjs/web", "Field shapes differ from the h3-based FetchEvent, so check nativeEvent, locals, and response usage."),
  },
  "@solidjs/start/server/spa": {
    createHandler: build("@solidjs/vite-plugin start mode with ssr: false", "Client mode is marked experimental and prerenders a static shell."),
  },
  "@solidjs/start/client": {
    mount: build("the generated client entry, which calls hydrate from @solidjs/web", "Delete src/entry-client.tsx together with src/entry-server.tsx (entries come in pairs) and put pre-hydration setup in start.clientSetup."),
    StartClient: build("the generated client entry", "No component is needed, because the plugin hydrates Document and App itself."),
  },
  "@solidjs/start/client/spa": {
    mount: build("start mode with ssr: false", "The generated client-mode entry calls render from @solidjs/web."),
  },
  "@solidjs/start/router": {
    FileRoutes: build("fileRoutes(pageRoutes) from @solidjs/router/fs with pageRoutes from virtual:file-routes, passed to createRouter({ routes })", "Also add the fileRoutes() Vite plugin from filesystem-routing/vite, a different function with the same name."),
  },
  "@solidjs/start/middleware": {
    createMiddleware: build("a start.middleware module default-exporting (event, next) => Response, or an array of them", "onRequest and onBeforeResponse become one next() chain, and next() takes no arguments."),
  },
};

const VINXI_HTTP: Record<string, Entry> = {
  getCookie: build("parseCookieHeader(getRequestEvent().request.headers.get(\"cookie\")) from @solidjs/web", "Cookie access is a codec over native Headers; writes use serializeCookie appended to the response headers."),
  useSession: build("an app-layer session over the request event", "Core ships no session primitive, and existing sealed 1.x sessions cannot be read, so users sign in again."),
};

function entryFor(module: string, name: string): { entry: Entry; guide: string } | null {
  if (module === "@solidjs/router" && Object.hasOwn(ROUTER, name)) return { entry: ROUTER[name]!, guide: ROUTER_GUIDE };
  if (module === "@solidjs/meta" && Object.hasOwn(META, name)) return { entry: META[name]!, guide: META_GUIDE };
  if (module === "vinxi/http" && Object.hasOwn(VINXI_HTTP, name)) return { entry: VINXI_HTTP[name]!, guide: SSR_GUIDE };
  const start = Object.hasOwn(START, module) ? START[module]! : null;
  if (start !== null && Object.hasOwn(start, name)) {
    const coreMove = ["clientOnly", "HttpStatusCode", "HttpHeader"].includes(name);
    return { entry: start[name]!, guide: coreMove ? SSR_GUIDE : START_GUIDE };
  }
  return null;
}

const NO_SOLID_2_RELEASE = /^(?:@solidjs\/start(?:\/.*)?|vinxi(?:\/.*)?)$/;

export function analyzeEcosystemImports(
  rootNode: SgNode<TSX>,
  context: { filename: string },
): string[] {
  const findings: { index: number; text: string }[] = [];
  for (const statement of rootNode.findAll({ rule: { kind: "import_statement" } })) {
    const source = statement.children().find((child) => child.is("string"));
    const module = source ? stringLiteralValue(source) : null;
    if (module === null) continue;
    const unlisted: string[] = [];
    let specifiers = 0;
    for (const specifier of statement.findAll({ rule: { kind: "import_specifier" } })) {
      const name = specifier.field("name")?.text();
      if (name === undefined) continue;
      specifiers += 1;
      const found = entryFor(module, name);
      if (found === null) {
        unlisted.push(name);
        continue;
      }
      const start = specifier.range().start;
      findings.push({
        index: start.index,
        text: `${context.filename}:${start.line + 1}:${start.column + 1} ${headline(found.entry.tier, name, module)}
Why: Solid 2's ${module.startsWith("@solidjs/router") ? "router (@solidjs/router 2.0.0-next.44)" : module.startsWith("@solidjs/meta") ? "head management (useHead in @solidjs/web; @solidjs/meta 1.0.0-next.2)" : "application layer (@solidjs/vite-plugin start mode and core @solidjs/web)"} replaces this with ${found.entry.replacement}.
Guidance: ${found.entry.guidance} Make and validate that edit yourself; this analyzer never edits or runs the target project. Official migration guide: ${found.guide}`,
      });
    }
    // Every import from a package with no Solid 2 release needs a finding:
    // a statement with no named specifiers (default, namespace, side effect)
    // or with names the table does not list gets one generic finding.
    if (source !== undefined && NO_SOLID_2_RELEASE.test(module) && (specifiers === 0 || unlisted.length > 0)) {
      const start = source.range().start;
      const names = unlisted.length > 0 ? ` (${unlisted.join(", ")})` : "";
      findings.push({
        index: start.index,
        text: `${context.filename}:${start.line + 1}:${start.column + 1} Manual review required: migrate this ${module} import, which has no Solid 2 release.
Why: Neither @solidjs/start nor vinxi has a release that targets Solid 2; @solidjs/vite-plugin start mode and the core @solidjs/web runtime provide the application layer instead${names ? `, and the names this import takes${names} have no audited one-to-one replacement` : ""}.
Guidance: Find the Solid 2 equivalent of what this import provides in the @solidjs/vite-plugin start mode documentation or in @solidjs/web, and remove the import. Make and validate that edit yourself; this analyzer never edits or runs the target project. Official migration guide: ${START_GUIDE}`,
      });
    }
  }
  return findings.sort((left, right) => left.index - right.index).map(({ text }) => text);
}

function headline(tier: Tier, name: string, module: string): string {
  if (tier === "build") return `Manual review required: migrate this ${name} import from ${module}, which Solid 2 removes or moves.`;
  if (tier === "behavior") return `Manual review required: review this ${name} import from ${module}, whose Solid 2 behavior changed.`;
  return `Manual review required: replace this deprecated ${name} import from ${module}.`;
}
