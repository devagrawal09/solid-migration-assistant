// The module-level `createSignal` and `createStore` are not Solid's; nothing
// is reported even when a function first argument is passed.
function createSignal<T>(value: T): [() => T, (next: T) => void] {
  let current = value;
  return [
    () => current,
    (next) => {
      current = next;
    },
  ];
}

function createStore<T>(value: T): [T] {
  return [value];
}

const [a] = createSignal(() => 1);
const [b] = createStore(() => ({ total: 0 }));

void a;
void b;
