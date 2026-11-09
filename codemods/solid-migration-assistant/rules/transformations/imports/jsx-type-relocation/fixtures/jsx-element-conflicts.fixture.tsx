// fixture: jsx-element-conflicts
import type { JSXElement } from "solid-js";
import type { JSX } from "./local-jsx";

// The file already binds JSX, so JSXElement cannot become JSX.Element here.
export const legacy: JSXElement = <i />;
export const local: JSX.Element = <b />;
