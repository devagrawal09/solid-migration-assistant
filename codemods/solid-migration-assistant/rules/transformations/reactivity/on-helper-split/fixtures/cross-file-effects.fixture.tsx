// fixture: cross-file-effects
import { createEffect, on } from "solid-js";
import { count, doubled, plain, total } from "./cross-file-sources.fixture";

// Rewritten: doubled is a const createMemo(...) in the declaring file.
createEffect(on(doubled, (value) => {
  console.log(value);
}));

// Refused: a destructured signal getter (re-exported through a list, or
// exported destructured) and a plain function the declaring file does not
// prove to be a reactive getter.
createEffect(on(count, (value) => {
  console.log(value);
}));
createEffect(on(total, (value) => {
  console.log(value);
}));
createEffect(on(plain, (value) => {
  console.log(value);
}));
