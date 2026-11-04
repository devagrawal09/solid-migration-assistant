import type { SgNode } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { migrationGuide, SOLID_TARGET_VERSION } from "../../../../shared/target.ts";

const MIGRATION_GUIDE =
  migrationGuide("classlist--class-objectarray-forms");

export function analyzeJsxClassListAttributes(
  rootNode: SgNode<TSX>,
  context: { filename: string },
): string[] {
  return findClassListAttributeNames(rootNode).map((name) => {
    const start = name.range().start;
    return `${context.filename}:${start.line + 1}:${start.column + 1} Manual review required: migrate this intrinsic JSX classList attribute to class.
Why: Solid ${SOLID_TARGET_VERSION} removes the JSX classList attribute in favor of the class attribute's object and array forms; on a native element the compiler now rejects classList with an error that names the replacement.
Guidance: Read this complete intrinsic element, its classList value, and every class source. Move the classList value into the class attribute's object or array form, preserve static classes and conditional truthiness, and deliberately merge any existing class attribute on the same element. Make and validate this migration yourself; this analyzer never edits or runs the target project. Stop without proposing a rewrite when the value or another class source is spread or forwarded, duplicate class sources have unclear precedence, getters or side effects could change evaluation order or frequency, or a focused rendering test does not prove the resulting static and conditional class tokens. Ask for the smallest focused rendering test or runtime observation that exposes the rendered class attribute across relevant states. Official migration guide: ${MIGRATION_GUIDE}`;
  });
}

function findClassListAttributeNames(rootNode: SgNode<TSX>): SgNode<TSX>[] {
  const names: SgNode<TSX>[] = [];

  for (const elementKind of [
    "jsx_opening_element",
    "jsx_self_closing_element",
  ] as const) {
    for (const element of rootNode.findAll({ rule: { kind: elementKind } })) {
      if (!isIntrinsicElement(element)) continue;

      for (const attribute of element
        .children()
        .filter((child) => child.kind() === "jsx_attribute")) {
        const name = attribute
          .children()
          .find((child) => child.kind() === "property_identifier");
        if (name?.text() === "classList") names.push(name);
      }
    }
  }

  return names.sort((left, right) => {
    const leftStart = left.range().start;
    const rightStart = right.range().start;
    return (
      leftStart.line - rightStart.line || leftStart.column - rightStart.column
    );
  });
}

function isIntrinsicElement(element: SgNode<TSX>): boolean {
  const name = element.field("name");
  return (
    name?.kind() === "identifier" && /^[a-z][A-Za-z0-9-]*$/.test(name.text())
  );
}
