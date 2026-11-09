import { /* before */ produce /* after */ } from "solid-js\u002fstore";
import { produce as makeProducer } from "solid-js/store";
import * as Store from "solid-js/store";
import * as Other from "other-library";

const setStore = (...args: unknown[]) => void args;

produce((draft: { count: number }) => {
  draft.count += 1;
});
setStore(
  "todos",
  produce(
    /* nested in setter */ (draft: { done: boolean }) => {
      draft.done = true;
    },
  ),
);
// prettier-ignore
(produce /* callee */)((draft: { ready: boolean }) => {
  draft.ready = true;
});
produce((draft: { child: { done: boolean } }) => {
  const updateChild = produce((child: { done: boolean }) => {
    child.done = true;
  });
  setStore(draft.child, updateChild);
});

produce();
produce((draft: object) => draft, { extra: true });
declare const produceArguments: [(draft: object) => void];
produce(...produceArguments);

makeProducer((draft: object) => draft);
Store.produce((draft: object) => draft);
Other.produce((draft: object) => draft);

const indirect = produce;
indirect((draft: object) => draft);

function shadowed(produce: (recipe: (draft: object) => void) => unknown) {
  produce(() => undefined);
}

void shadowed;
