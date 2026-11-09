// fixture: jsx-element-mixed
// prettier-ignore
import { type Component, createMemo } from 'solid-js'
import type { JSX } from '@solidjs/web'

export const Layout: Component<{ aside: JSX.Element }> = (props) => {
  const aside = createMemo(() => props.aside);
  return <main>{aside()}</main>;
};
