import { createSignal } from "./local-signals";

export function Panel() {
  const [open, setOpen] = createSignal(false);
  setOpen(true);
  return <div>{open()}</div>;
}
