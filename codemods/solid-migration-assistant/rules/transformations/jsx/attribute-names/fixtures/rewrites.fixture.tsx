// fixture: rewrites
import { createSignal } from "solid-js";

const [locked] = createSignal(false);

export function Form(props: { id: string; size: number }) {
  return (
    <form noValidate encType="multipart/form-data">
      <label htmlFor={props.id} className="label">Name</label>
      <input id={props.id} readOnly={!locked()} maxLength={props.size} autoComplete="off" tabIndex={0} />
      <div contentEditable={true} spellCheck={false} />
      <img srcSet="a.png 2x" crossOrigin="anonymous" referrerPolicy="no-referrer" />
    </form>
  );
}
