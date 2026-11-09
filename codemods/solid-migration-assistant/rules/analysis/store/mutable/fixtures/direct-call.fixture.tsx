import {
  /* before */ createMutable /* between */,
  modifyMutable /* after */,
} from "solid-js/store";
import {
  createMutable as mutable,
  modifyMutable as modify,
} from "solid-js/store";
import * as Store from "solid-js/store";
import * as Other from "other-library";

const initial = { count: 0 };
const options = { name: "counter" };

const state = createMutable(initial);
// prettier-ignore
const namedState = (createMutable /* callee */)(initial, options);
modifyMutable(state, (draft: typeof state) => {
  draft.count += 1;
});
// prettier-ignore
(modifyMutable /* callee */)(state, (draft: typeof state) => {
  draft.count += 1;
});

createMutable();
createMutable(initial, options, "extra");
declare const createArguments: [typeof initial];
createMutable(...createArguments);
modifyMutable(state);
modifyMutable(state, () => undefined, "extra");
declare const modifyArguments: [typeof state, (draft: typeof state) => void];
modifyMutable(...modifyArguments);

mutable(initial);
modify(state, () => undefined);
Store.createMutable(initial);
Store.modifyMutable(state, () => undefined);
Other.createMutable(initial);
Other.modifyMutable(state, () => undefined);

const indirectCreate = createMutable;
const indirectModify = modifyMutable;
indirectCreate(initial);
indirectModify(state, () => undefined);

function shadowed(
  createMutable: (value: object) => object,
  modifyMutable: (value: object, recipe: (draft: object) => void) => void,
) {
  const localState = createMutable(initial);
  modifyMutable(localState, () => undefined);
}

void namedState;
void shadowed;
