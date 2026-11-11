import { createSignal } from "solid-js";
import { createStore } from "solid-js/store";

// Inline function literals: syntactically function-typed first argument.
const [a] = createSignal(() => 1);
const [b] = createSignal(function () {
  return 2;
});
const [c] = createStore(() => ({ total: 0 }));
const [d] = createStore(function () {
  return [1, 2, 3];
});

// Const-bound to a function literal in the same file.
const compute = () => 1;
const [e] = createSignal(compute);
const seed = function build() {
  return { total: 0 };
};
const [f] = createStore(seed, { total: 0 });

// Function declaration bound to a function.
function listItems() {
  return [1, 2, 3];
}
const [g] = createStore(listItems);
