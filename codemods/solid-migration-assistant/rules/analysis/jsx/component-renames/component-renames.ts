import type { SgNode } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { stringLiteralValue } from "../../../../shared/analysis.ts";
import { migrationGuide } from "../../../../shared/target.ts";
import { finding, type RuleFinding } from "../../../../shared/finding.ts";
import { referencesOf } from "../../../../shared/semantic.ts";

const SUSPENSE_BOUNDARY_GUIDE =
  migrationGuide("suspense--errorboundary--loading--errored");
const INDEX_GUIDE =
  migrationGuide("list-rendering-index-is-gone-and-for-handles-each-keying-mode");
const SUSPENSE_LIST_GUIDE =
  migrationGuide("coordinating-loading-boundaries-suspenselist--reveal");

const COMPONENT_MIGRATIONS = {
  Suspense: "Loading",
  ErrorBoundary: "Errored",
  SuspenseList: "Reveal",
  Index: "For",
} as const;

type LegacyComponent = keyof typeof COMPONENT_MIGRATIONS;

type ComponentSite = {
  element: SgNode<TSX>;
  filename: string;
  legacyName: LegacyComponent;
};

export function analyzeJsxComponentRenames(
  rootNode: SgNode<TSX>,
  context: { filename: string },
): RuleFinding[] {
  return findImportedComponentSites(rootNode)
    .sort((left, right) => {
      const leftStart = left.element.range().start;
      const rightStart = right.element.range().start;
      const filenameOrder = left.filename.localeCompare(right.filename);
      if (filenameOrder !== 0) return filenameOrder;
      if (leftStart.line !== rightStart.line) {
        return leftStart.line - rightStart.line;
      }
      return leftStart.column - rightStart.column;
    })
    .map(({ element, filename, legacyName }) =>
      componentGuidance(element, filename, legacyName),
    );
}

function findImportedComponentSites(rootNode: SgNode<TSX>): ComponentSite[] {
  const sites = new Map<string, ComponentSite>();

  for (const statement of rootNode.findAll({
    rule: { kind: "import_statement" },
  })) {
    const source = statement.children().find((child) => child.is("string"));
    if (!source || stringLiteralValue(source) !== "solid-js") continue;

    for (const specifier of statement.findAll({
      rule: { kind: "import_specifier" },
    })) {
      const legacyName = importedLegacyName(specifier);
      if (!legacyName) continue;

      const identifiers = specifier.findAll({ rule: { kind: "identifier" } });
      const binding = identifiers[0];
      if (!binding || identifiers.length !== 1) continue;

      for (const fileReferences of referencesOf(binding)) {
        const filename = fileReferences.root
          .relativeFilename()
          .replaceAll("\\", "/");
        for (const reference of fileReferences.nodes) {
          const element = reference.parent();
          if (
            !element ||
            (element.kind() !== "jsx_opening_element" &&
              element.kind() !== "jsx_self_closing_element") ||
            element.field("name")?.id() !== reference.id()
          ) {
            continue;
          }
          sites.set(`${filename}:${element.id()}`, {
            element,
            filename,
            legacyName,
          });
        }
      }
    }
  }

  return [...sites.values()];
}

function importedLegacyName(specifier: SgNode<TSX>): LegacyComponent | null {
  const text = specifier.text().trim();
  return text in COMPONENT_MIGRATIONS ? (text as LegacyComponent) : null;
}

function componentGuidance(
  element: SgNode<TSX>,
  filename: string,
  legacyName: LegacyComponent,
): RuleFinding {
  const start = element.range().start;

  if (legacyName === "Suspense") {
    return finding(filename, start, {
        severity: "build",
        headline: `Migrate this imported Suspense JSX site to Loading.`,
        why: `Solid 2 replaces the solid-js Suspense component with Loading for initial not-ready fallback UI.`,
        guidance: `Read this complete boundary, its fallback, children, props, and corresponding import. Replace the unaliased named Suspense import and this JSX component with Loading only after confirming that the boundary owns initial not-ready UI and that its fallback and children preserve their rendering behavior. Stop without proposing a rewrite when props are spread or forwarded, fallback ownership or evaluation is indirect, nested async boundaries make the intended initial-loading behavior unclear, or focused rendering tests do not cover the fallback and ready states. Ask for the smallest focused test or runtime observation that exposes both states.`,
        lint: ["removed-api"],
        guide: SUSPENSE_BOUNDARY_GUIDE,
      });
  }

  if (legacyName === "ErrorBoundary") {
    return finding(filename, start, {
        severity: "build",
        headline: `Migrate this imported ErrorBoundary JSX site to Errored.`,
        why: `Solid 2 replaces the solid-js ErrorBoundary component with Errored, whose fallback receives an error accessor rather than a raw error value.`,
        guidance: `Read this complete boundary, its fallback, children, props, and corresponding import. Replace the unaliased named ErrorBoundary import and this JSX component with Errored only after updating every fallback use to read the error accessor, such as err(), while preserving error ownership and recovery behavior. Stop without proposing a rewrite when props are spread or forwarded, the fallback is indirect or escapes, the error value is passed to unknown code, reset or recovery behavior is unclear, or focused tests do not cover thrown and recovered states. Ask for the smallest focused test or runtime observation that exposes the fallback value and recovery behavior.`,
        lint: ["removed-api"],
        guide: SUSPENSE_BOUNDARY_GUIDE,
      });
  }

  if (legacyName === "Index") {
    return finding(filename, start, {
        severity: "build",
        headline: `Migrate this imported Index JSX site to For keyed={false}.`,
        why: `Solid 2 removes Index; its direct replacement is For with keyed={false}, whose child callback receives an item accessor and a stable numeric index.`,
        guidance: `Read the complete list site, its each value, child callback, props, and corresponding import. Replace the unaliased named Index import and this JSX component with For, add the literal keyed={false} mode, and review the callback so the item remains an accessor and the index remains a stable number. Stop without proposing a rewrite when props are spread or forwarded, each or the child callback is indirect, callback parameters escape to unknown code, item identity or index behavior is unclear, or focused list-update tests do not prove state preservation. Ask for the smallest focused test or runtime observation that covers insertion, removal, reordering, and item updates.`,
        lint: ["removed-api"],
        guide: INDEX_GUIDE,
      });
  }

  return finding(filename, start, {
        severity: "build",
        headline: `Migrate this imported SuspenseList JSX site to Reveal.`,
        why: `Solid 2 replaces SuspenseList with Reveal for coordinating sibling Loading boundaries and replaces revealOrder and tail controls with order and collapsed semantics.`,
        guidance: `Read the complete group, its revealOrder and tail values, children, nesting, props, and corresponding import. Replace the unaliased named SuspenseList import and this JSX component with Reveal only after mapping literal revealOrder="forwards" to the default or order="sequential", revealOrder="together" to order="together", and tail="collapsed" to collapsed only under sequential order; review the children as sibling Loading boundaries, and do not use the earlier-beta boolean together prop. Stop without proposing a rewrite when props are spread or forwarded, revealOrder or tail is dynamic or has another value, child boundary ownership or nesting is unclear, intended reveal timing cannot be established, or focused behavior tests do not cover the coordinated states. Ask for the smallest focused test or runtime observation that exposes ordering, fallback, and collapsed-tail behavior.`,
        lint: ["removed-api"],
        guide: SUSPENSE_LIST_GUIDE,
      });
}

