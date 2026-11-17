import type { SgNode, SgRoot } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { callTakingAsFirstArgument, findImportedCalls } from "../../../../shared/analysis.ts";
import { finding, type RuleFinding } from "../../../../shared/finding.ts";
import { referencesOf } from "../../../../shared/semantic.ts";
import { calleeOf, runningFunction, statePairs } from "../../../../shared/state-pairs.ts";
import { migrationGuide, SOLID_TARGET_VERSION } from "../../../../shared/target.ts";

const MIGRATION_GUIDE = migrationGuide("write-inside-reactive-scope-owned-scope");
const OWNING_CALLS = ["createMemo", "createRoot"];

type Owner = { kind: "component"; name: string } | { kind: "call"; name: string };

/**
 * Reports a call to a signal or store setter whose body runs in an owned
 * scope: a component body, a createMemo compute function, or a createRoot
 * callback (looking through `untrack`, which keeps the owner). At 2.0.0 the
 * dev build throws REACTIVE_WRITE_IN_OWNED_SCOPE there and halts the reactive
 * system; the production build lets the write through. Checked on the
 * browser build for a signal created in the same body and outside it, and
 * for a store setter. Writes in nested callbacks (event handlers, effects'
 * apply callbacks, onSettled, onCleanup) are not owned and are not reported.
 *
 * A component is a function named with a capital letter that contains JSX.
 * Setters are the second name of `const [x, setX] = createSignal(...)` or
 * `createStore(...)`, followed across files by the semantic provider; a
 * signal created with the `ownedWrite` option is skipped.
 */
export function analyzeOwnedWrite(rootNode: SgNode<TSX>, _context: { filename: string }): RuleFinding[] {
  const owningCalls = new Map<string, Map<number, string>>();
  const owningCallsIn = (root: SgRoot<TSX>, filename: string) => {
    if (!owningCalls.has(filename)) {
      owningCalls.set(
        filename,
        new Map(OWNING_CALLS.flatMap((name) => findImportedCalls(root.root(), "solid-js", name).map(({ call }) => [call.id(), name] as const))),
      );
    }
    return owningCalls.get(filename)!;
  };
  const findings: RuleFinding[] = [];

  for (const pair of statePairs(rootNode)) {
    if (pair.call.text().includes("ownedWrite")) continue;
    for (const { root, nodes } of referencesOf(pair.setter)) {
      const filename = root.relativeFilename().replaceAll("\\", "/");
      for (const reference of nodes) {
        const write = calleeOf(reference);
        if (write === null) continue;
        const owner = ownerOf(runningFunction(write), owningCallsIn(root, filename));
        if (owner === null) continue;
        const setter = pair.setter.text();
        const where = owner.kind === "component" ? `the ${owner.name} component body` : `this ${owner.name} callback`;
        findings.push(
          finding(filename, write, {
            severity: "behavior",
            headline: `Move this ${setter} call out of ${where}; Solid 2 throws on writes there in dev.`,
            why: `Solid ${SOLID_TARGET_VERSION} treats a component body, a createMemo compute function and a createRoot callback as owned scopes. A write to a signal or store there throws REACTIVE_WRITE_IN_OWNED_SCOPE in development builds and halts the reactive system; production builds let it through. Solid 1.x allowed these writes.`,
            guidance:
              owner.kind === "call" && owner.name === "createMemo"
                ? `Derive the value ${setter} writes with its own createMemo instead of writing it from this one, or move the write into the apply callback of a split createEffect: createEffect(() => source(), (value) => ${setter}(...)). Keep the ownedWrite option for an internal signal that has to be written while computing.`
                : `If the write sets a starting value, pass it to createSignal or createStore instead. If it derives state from props or other state, use createMemo, or createSignal(fn) when the derived value must stay writable. If it reacts to a change, move it into an event handler or the apply callback of a split createEffect. Keep the ownedWrite option for an internal signal that has to be written while rendering.`,
            guide: MIGRATION_GUIDE,
          }),
        );
      }
    }
  }

  return findings.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.column - b.column);
}

function ownerOf(fn: SgNode<TSX> | null, owningCalls: Map<number, string>): Owner | null {
  if (fn === null) return null;
  const call = callTakingAsFirstArgument(fn);
  const owning = call === null ? undefined : owningCalls.get(call.id());
  if (owning !== undefined) return { kind: "call", name: owning };
  const name = functionName(fn);
  if (name === null || !/^[A-Z]/.test(name)) return null;
  const jsx = fn.find({ rule: { any: [{ kind: "jsx_element" }, { kind: "jsx_self_closing_element" }] } });
  return jsx === null ? null : { kind: "component", name };
}

function functionName(fn: SgNode<TSX>): string | null {
  const own = fn.field("name");
  if (own !== null) return own.text();
  const declarator = fn.parent();
  if (declarator?.kind() !== "variable_declarator") return null;
  const name = declarator.field("name");
  return name?.kind() === "identifier" ? name.text() : null;
}
