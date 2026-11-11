import { createSignal } from "solid-js";

export function Component() {
  return (
    <div>
      <button on:click={handleClick} on:keydown={handleKey} />
      <div oncapture:scroll={handleScroll} oncapture:pointerdown={handlePointer} />
      <input on:input={handleInput} />
    </div>
  );
}
