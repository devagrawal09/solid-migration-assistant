import { createSignal } from "other-library";

const [count, setCount] = createSignal(0);

export function increment() {
  setCount(1);
  return count();
}
