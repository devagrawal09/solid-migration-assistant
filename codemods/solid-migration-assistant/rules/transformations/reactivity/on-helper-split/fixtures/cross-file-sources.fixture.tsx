// fixture: cross-file-sources
// Declares the reactive sources cross-file-effects imports; no on() here.
import { createMemo, createSignal } from "solid-js";

const [count, setCount] = createSignal(0);
export const doubled = createMemo(() => count() * 2);
export { count, setCount };
export const [total] = createSignal(0);
export const plain = () => count();
