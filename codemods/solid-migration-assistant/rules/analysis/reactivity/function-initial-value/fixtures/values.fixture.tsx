import { createSignal } from "solid-js";
import { createStore } from "solid-js/store";

const format = (n: number) => n.toFixed(2);
function onSave() {}
const label = "label";

export const [formatter, setFormatter] = createSignal(format);
export const [handler] = createSignal(onSave);
export const [inline] = createSignal(() => console.log("clicked"));
export const [wrapped] = createSignal(() => format);
export const [text] = createSignal(label);
export const [count] = createSignal(0);
export const [state] = createStore(() => ({ open: false }));
export const [plain] = createStore({ open: false });

void [setFormatter, formatter, handler, inline, wrapped, text, count, state, plain];
