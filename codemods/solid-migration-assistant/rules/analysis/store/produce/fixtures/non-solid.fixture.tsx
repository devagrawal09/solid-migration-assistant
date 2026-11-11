import { produce } from "other-library";

produce((draft: { value: number }) => {
  draft.value += 1;
});
