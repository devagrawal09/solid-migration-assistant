import { createSignal } from "solid-js";

const [selected] = createSignal(false);
const save = () => {};
const cancel = () => {};
const handlers = { save };

export const conditional = <button onClick={selected() ? save : cancel}>go</button>;
export const factory = <button onClick={makeHandler("id")}>go</button>;
export const bound = <button onClick={save.bind(null)}>go</button>;
export const arrow = <button onClick={() => (selected() ? save() : cancel())}>go</button>;
export const named = <button onClick={save}>go</button>;
export const member = <button onClick={handlers.save}>go</button>;
export const component = <Button onClick={selected() ? save : cancel} />;

function makeHandler(id: string) {
  return () => console.log(id);
}

function Button(props: { onClick: () => void }) {
  return <button onClick={props.onClick} />;
}
