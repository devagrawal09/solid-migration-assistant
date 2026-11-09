// Literal path setters become draft writes and the import moves to solid-js;
// see store-merge.ts for a file whose import must stay.
import { createStore } from "solid-js/store";

const [settings, setSettings] = createStore({ theme: "light", panel: { open: false } });
setSettings("theme", "dark");
setSettings("panel", "open", true);

export { settings };
