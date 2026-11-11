// fixture: unused-or-passed
import { createStore } from "solid-js/store";

// createStore is never called here, only passed on, so the stores it will
// create elsewhere are unseen and the import must not move.
export const factory = createStore;
