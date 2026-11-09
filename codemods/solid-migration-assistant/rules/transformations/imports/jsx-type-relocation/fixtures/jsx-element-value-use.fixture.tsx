// fixture: jsx-element-value-use
import type { JSXElement } from "solid-js";

// A re-export names JSXElement as a value position, so the file is refused.
export type { JSXElement };
export const legacy: JSXElement = <i />;
