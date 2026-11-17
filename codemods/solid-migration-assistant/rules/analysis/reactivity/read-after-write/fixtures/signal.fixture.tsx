import { createSignal, flush, untrack } from "solid-js";

const [count, setCount] = createSignal(0);

export function increment() {
  setCount(count() + 1);
  return count();
}

export function flushed() {
  setCount(1);
  flush();
  return count();
}

export function viaUntrack() {
  return untrack(() => {
    setCount(2);
    return count() * 2;
  });
}

export function branches(reset: boolean) {
  if (reset) setCount(0);
  else return count();
  return undefined;
}

export function deferred() {
  setCount(3);
  setTimeout(() => console.log(count()));
  return <p>{count()}</p>;
}

export function twoReads() {
  setCount(4);
  console.log(count(), count());
}
