// fixture: exported-setter
import { createStore } from "solid-js/store";

// The setter is exported, so other files may call it in shapes this file
// cannot see: the literal call here is rewritten, but the import stays.
export const [settings, setSettings] = createStore({ theme: "light" });
setSettings((draft) => { draft.theme = "dark"; });
