// fixture: rewrites
import { createSignal } from "solid-js";

const [locked] = createSignal(false);

export function Form(props: { id: string; size: number }) {
  return (
    <form novalidate enctype="multipart/form-data">
      <label for={props.id} class="label">Name</label>
      <input id={props.id} readonly={!locked()} maxlength={props.size} autocomplete="off" tabindex={0} />
      <div contenteditable={true} spellcheck={false} />
      <img srcset="a.png 2x" crossorigin="anonymous" referrerpolicy="no-referrer" />
    </form>
  );
}
