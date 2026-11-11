import { createEffect } from "solid-js";

createEffect((prev) => prev + count(), 0, { name: "counter" });
