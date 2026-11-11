import { Portal } from "@solidjs/web";

// mount and children stay on Portal in rc.21, so these sites are silent.
export const Fine = () => (
  <Portal mount={document.body}>
    <div>plain</div>
  </Portal>
);

// A spread may supply useShadow/isSVG/ref, but the attribute name is not
// plainly `useShadow`, `isSVG`, or `ref`, so the rule does not report it.
export const Spread = (props: { portalProps: { mount?: Element } }) => (
  <Portal {...props.portalProps}>
    <div>via spread</div>
  </Portal>
);

// Portal imported from another module is left alone.
import { Portal as OtherPortal } from "./not-solid";
export const Other = () => (
  <OtherPortal useShadow isSVG ref={() => undefined}>
    <div>other</div>
  </OtherPortal>
);

// A type-only Portal import binds no runtime value and is skipped.
import type { Portal as PortalType } from "@solidjs/web";
export const typed: typeof PortalType = (() => null) as never;
