import { createSignal } from "solid-js";

declare function clickOutside(el: HTMLElement, accessor: () => () => void): void;

export function Component() {
  let ref!: HTMLDivElement;
  return (
    <div>
      <div use:clickOutside={() => close()} />
      <button use:focusTrap={{ enabled: true }}>Save</button>
    </div>
  );
}
