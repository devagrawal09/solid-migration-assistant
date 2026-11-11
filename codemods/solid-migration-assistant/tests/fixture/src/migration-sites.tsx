import {
  createComputed,
  createContext,
  createEffect,
  createMemo,
  createSignal,
  ErrorBoundary,
  Index,
  mergeProps,
  onMount,
  splitProps,
  Suspense,
  SuspenseList,
  useContext,
} from "solid-js";
import { createMutable, createStore, modifyMutable, produce, unwrap } from "solid-js/store";
import { Portal, render } from "solid-js/web";

const [count] = createSignal(0);
// reactivity/create-signal-function: function first argument is now a derived signal.
const [doubled] = createSignal(() => count() * 2);
// reactivity/create-signal-function: createStore(fn) now a derived store.
const [listItems] = createStore(() => [count(), count() + 1]);

// reactivity/use-context-default: default-less context whose undefined check is now dead.
const TodosContext = createContext<{ total: number }>();
function useTodosCount() {
  const ctx = useContext(TodosContext);
  if (!ctx) throw new Error("missing TodosContext");
  return ctx.total;
}

const props = mergeProps({ label: "Count" }, { label: undefined });
const [localProps, restProps] = splitProps(props, ["label"]);
const seeded = createMemo((previous) => previous + count(), 0);
const legacyMutable = createMutable({ value: 0 });
modifyMutable(legacyMutable, (draft) => {
  draft.value += 1;
});
const plainMutable = unwrap(legacyMutable);
const legacyRecipe = produce((draft: { value: number }) => {
  draft.value += 1;
});

createComputed(() => count() * 2);
createEffect(() => {
  document.title = `Count ${count()}`;
});

onMount(() => {
  document.querySelector("button")?.focus();
});

function Counter() {
  return (
    <Suspense fallback={<span>Loading</span>}>
      <ErrorBoundary fallback={(error) => <span>{error.message}</span>}>
        <SuspenseList revealOrder="forwards" tail="collapsed">
          <Index each={[props.label]}>
            {(item, index) => (
              // jsx/dom-attr-casing: rc.21 declares tabindex, not tabIndex.
              <button classList={{ active: true }} data-index={index} tabIndex={0}>
                {item()}: {seeded()} {doubled()} {listItems[0]} {useTodosCount()}
              </button>
            )}
          </Index>
        </SuspenseList>
        {/* jsx/portal-props: Portal lost useShadow at rc.21. */}
        <Portal useShadow mount={document.body}>
          <span>shadowed</span>
        </Portal>
      </ErrorBoundary>
    </Suspense>
  );
}

void localProps;
void restProps;
void plainMutable;
void legacyRecipe;

render(() => <Counter />, document.getElementById("root")!);
