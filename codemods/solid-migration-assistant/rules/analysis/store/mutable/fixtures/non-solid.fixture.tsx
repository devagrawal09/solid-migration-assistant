import { createMutable, modifyMutable } from "other-library";

const state = createMutable({ value: 1 });
modifyMutable(state, (draft: typeof state) => {
  draft.value += 1;
});
