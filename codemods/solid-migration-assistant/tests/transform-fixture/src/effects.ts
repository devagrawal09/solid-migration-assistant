// A simple on() effect is split and the on import removed.
import { createEffect, createSignal, on } from "solid-js";

const [page, setPage] = createSignal(1);
createEffect(on(page, (value, previous) => {
  console.log("page", value, "from", previous);
}));

export { setPage };
