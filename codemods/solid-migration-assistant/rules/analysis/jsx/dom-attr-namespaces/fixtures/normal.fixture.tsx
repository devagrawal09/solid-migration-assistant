import { createSignal } from "solid-js";

export function Component() {
  return (
    <div>
      <input attr:type="text" attr:disabled={true} />
      <button bool:disabled={isDisabled()} attr:aria-label="Close" />
      <span attr:data-x="1" bool:hidden={shouldHide()} />
    </div>
  );
}
