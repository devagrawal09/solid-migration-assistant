import { sharedConfig, createSignal } from "solid-js";
import { $DEVCOMP as devComponent } from "solid-js/web";
import { sharedConfig as fromInternal } from "solid-js/internal";
import { sharedConfig as other } from "other-library";
export { sharedConfig as config } from "solid-js";

void [sharedConfig, createSignal, devComponent, fromInternal, other];
