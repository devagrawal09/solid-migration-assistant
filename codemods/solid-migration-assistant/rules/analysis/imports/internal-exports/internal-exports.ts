import type { SgNode } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { stringLiteralValue } from "../../../../shared/analysis.ts";
import { finding, type RuleFinding } from "../../../../shared/finding.ts";
import { migrationGuide, SOLID_TARGET_VERSION } from "../../../../shared/target.ts";

const MIGRATION_GUIDE = migrationGuide("removals");
const MODULES = new Set(["solid-js", "solid-js/web"]);
const INTERNAL = new Set(["sharedConfig", "$DEVCOMP"]);

/**
 * Reports `sharedConfig` and `$DEVCOMP` imported or re-exported from
 * `solid-js` or `solid-js/web`. At 2.0.0 the runtime still exports both
 * from `solid-js`, but only `solid-js/internal` declares them in its types,
 * so the import is a type error. Renderers and dev tooling use them; apps
 * rarely do.
 */
export function analyzeInternalExports(
  rootNode: SgNode<TSX>,
  context: { filename: string },
): RuleFinding[] {
  const statements = rootNode.findAll({ rule: { any: [{ kind: "import_statement" }, { kind: "export_statement" }] } });
  return statements.flatMap((statement) => {
    const source = statement.field("source") ?? statement.children().find((child) => child.is("string"));
    const moduleName = source ? stringLiteralValue(source) : null;
    if (moduleName === null || !MODULES.has(moduleName)) return [];
    return statement
      .findAll({ rule: { any: [{ kind: "import_specifier" }, { kind: "export_specifier" }] } })
      .filter((specifier) => INTERNAL.has(specifier.field("name")?.text() ?? ""))
      .map((specifier) => {
        const name = specifier.field("name")!.text();
        return finding(context.filename, specifier, {
          severity: "build",
          headline: `Import ${name} from solid-js/internal.`,
          why: `Solid ${SOLID_TARGET_VERSION} drops ${name} from ${moduleName}'s public types; only solid-js/internal declares it, so this import is a type error.`,
          guidance: `Move ${name} into an import from solid-js/internal and keep its alias. solid-js/internal is not public API and can change in any release, so if this is application code rather than a renderer or dev tool, look for a public API instead.`,
          guide: MIGRATION_GUIDE,
        });
      });
  });
}
