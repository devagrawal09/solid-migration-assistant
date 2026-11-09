import type { SgNode } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { findBindings } from "../../../../shared/bindings.ts";
import { migrationGuide, SOLID_TARGET_VERSION } from "../../../../shared/target.ts";
import { finding, type RuleFinding } from "../../../../shared/finding.ts";

const MIGRATION_GUIDE = migrationGuide("context-providers-contextprovider--context-is-the-provider");

export function analyzeContextProvider(
  rootNode: SgNode<TSX>,
  context: { filename: string },
): RuleFinding[] {
  const findings: RuleFinding[] = [];
  for (const elementKind of ["jsx_opening_element", "jsx_self_closing_element"] as const) {
    for (const element of rootNode.findAll({ rule: { kind: elementKind } })) {
      const nameField = element.field("name");
      if (!nameField || nameField.kind() !== "member_expression") continue;
      const property = nameField.children().find(
        (child) => child.kind() === "property_identifier",
      );
      if (!property || property.text() !== "Provider") continue;
      const object = nameField.children().find(
        (child) => child.kind() === "identifier",
      );
      if (!object) continue;
      if (!couldBeContext(rootNode, object.text())) continue;
      const start = element.range().start;
      const contextName = object.text();
      findings.push(
        finding(context.filename, start, {
        severity: "build",
        headline: `Migrate this Context.Provider JSX site to direct context provider syntax.`,
        why: `Solid ${SOLID_TARGET_VERSION} removes the Context.Provider pattern (createContext now returns the provider component itself, and .Provider is undefined); use the context value directly as a JSX component: <${contextName} value={...}>.`,
        guidance: `Replace <${contextName}.Provider value={...}> with <${contextName} value={...}>. Remove the .Provider suffix — the context itself is now the provider component. The value prop and children remain unchanged, but confirm the value is never undefined: Solid 2 treats value={undefined} as no provider, so a default-less context then throws ContextNotFoundError instead of falling back as 1.x did; use null as an explicit empty value.`,
        guide: MIGRATION_GUIDE,
      }),
      );
    }
  }
  return findings;
}

/**
 * True unless the file itself proves the identifier is not a Solid context:
 * when every in-file binding of the name is a declaration whose initializer
 * is something other than a `createContext(...)` call (an object literal with
 * its own `Provider` member, a function, a class), the `.Provider` is that
 * value's own property and no finding is produced. Imported bindings, bindings
 * initialized by a `createContext` call (any import form), and unresolved
 * globals keep the finding, since the file cannot rule a context out.
 */
function couldBeContext(rootNode: SgNode<TSX>, name: string): boolean {
  const bindings = findBindings(rootNode, name);
  if (bindings.length === 0) return true;
  return bindings.some((binding) => {
    const parent = binding.parent();
    if (parent === null) return true;
    if (parent.kind() !== "variable_declarator") return parent.kind() !== "function_declaration" && parent.kind() !== "class_declaration";
    const value = parent.field("value");
    if (value === null || value.kind() !== "call_expression") return false;
    const callee = value.field("function");
    return callee !== null && /(^|\.)createContext$/.test(callee.text());
  });
}
