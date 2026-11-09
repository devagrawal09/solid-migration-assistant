import { createRoot } from "./roots";

export function makeController() {
  return createRoot(() => 1);
}
