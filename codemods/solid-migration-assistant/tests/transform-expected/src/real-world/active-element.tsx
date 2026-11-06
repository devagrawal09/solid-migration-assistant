// Origin: solidjs-community/solid-primitives, packages/active-element/dev/index.tsx
// at commit 9c81cd0d64591e80afafd30e9facf7dccfb0f4ab, reduced to the Node and
// Client components with the local primitive imports replaced by inline stubs.
// License: MIT
// (https://github.com/solidjs-community/solid-primitives/blob/9c81cd0d64591e80afafd30e9facf7dccfb0f4ab/LICENSE).
// The use: directive is left for the analyzer; the Index element, the
// lowercase onclick, and the class plus classList pair (disjoint literal keys)
// are rewritten.
import { type Component, createSignal, For, type ParentComponent } from "solid-js";

type NodeData = { id: number; x: number; y: number; size: number };
const genNodeList = (): NodeData[] => [{ id: 1, x: 0, y: 0, size: 1 }];
const focus = (el: HTMLElement, accessor: () => (value: boolean) => void) => void [el, accessor];

const Node: ParentComponent<{ x: number; y: number; size: number }> = props => {
  const [isFocused, setIsFocused] = createSignal(false);

  return (
    <button
      use:focus={setIsFocused}
      class={["fixed left-0 top-0 h-48 w-48 cursor-pointer rounded-full border-none bg-orange-700 text-4xl font-extrabold text-gray-900 hover:bg-orange-600", {
        "!bg-indigo-700 !hover:bg-indigo-600": isFocused(),
      }]}
      style={{
        transform: `translate(${props.x}px, ${props.y}px) scale(${props.size})`,
        transition: "transform 500ms, background 200ms",
      }}
    >
      {props.children}
    </button>
  );
};

const Client: Component = () => {
  const [list, setList] = createSignal(genNodeList());
  const shuffle = () => setList(genNodeList());

  return (
    <div class="box-border h-screen w-full overflow-hidden bg-gray-900 text-white">
      <For keyed={false} each={list()}>
        {item => (
          <Node x={item().x} y={item().y} size={item().size}>
            {item().id}
          </Node>
        )}
      </For>
      <button
        class="fixed left-1/2 top-1/2 -ml-32 -mt-8 h-16 w-64 cursor-pointer rounded-lg border-none bg-transparent text-5xl font-extrabold text-white hover:text-yellow-200"
        onClick={shuffle}
      >
        Shuffle!
      </button>
    </div>
  );
};

export default Client;
void focus;
