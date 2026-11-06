// fixture: no-matches
const onclick = () => undefined;
const text = "<button onclick=";
// <button onclick={handler}>
const element = document.createElement("button");
element.onclick = onclick;
export const migrated = <button onClick={onclick} />;
void text;
