// fixture: real-world-solid-primitives-active-element
// Origin: solidjs-community/solid-primitives, packages/active-element/dev/index.tsx
// at commit 9c81cd0d64591e80afafd30e9facf7dccfb0f4ab, reduced to the Client
// component's list and shuffle button, with the local primitive imports
// replaced by inline stubs. License: MIT
// (https://github.com/solidjs-community/solid-primitives/blob/9c81cd0d64591e80afafd30e9facf7dccfb0f4ab/LICENSE).
import { type Component, createSignal, For } from "solid-js";

type NodeData = { id: number; x: number; y: number; size: number };
const genNodeList = (): NodeData[] => [{ id: 1, x: 0, y: 0, size: 1 }];
const Node: Component<{ x: number; y: number; size: number; children: unknown }> = (props) => (
  <button>{props.children}</button>
);

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
        onclick={shuffle}
      >
        Shuffle!
      </button>
    </div>
  );
};

export default Client;
