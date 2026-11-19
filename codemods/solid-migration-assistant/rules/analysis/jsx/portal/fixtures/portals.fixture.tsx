// fixture: portals
// Removed props are reported once each; a plain Portal gets one behavior
// finding. A Portal from another module is not reported.
import { Portal } from "solid-js/web";
import { Portal as Layer } from "./layers";

let wrapper: HTMLDivElement | undefined;
const host = document.createElement("div");

export const Modal = () => (
  <>
    <Portal ref={wrapper} mount={host}>
      <dialog open />
    </Portal>
    <Portal useShadow isSVG>
      <g />
    </Portal>
    <Portal mount={host}>
      <p>toast</p>
    </Portal>
    <Layer ref={wrapper} />
  </>
);
