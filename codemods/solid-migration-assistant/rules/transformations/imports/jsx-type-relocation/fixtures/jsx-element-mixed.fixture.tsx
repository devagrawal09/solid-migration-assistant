// fixture: jsx-element-mixed
// prettier-ignore
import { type Component, type JSXElement, createMemo } from 'solid-js'

export const Layout: Component<{ aside: JSXElement }> = (props) => {
  const aside = createMemo(() => props.aside);
  return <main>{aside()}</main>;
};
