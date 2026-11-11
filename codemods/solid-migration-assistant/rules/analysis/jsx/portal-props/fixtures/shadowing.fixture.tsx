import { Portal } from "solid-js/web";

// A local Portal declaration shadows the import, so we cannot be sure the
// JSX sites point at Solid's Portal. The rule stays silent for every
// attribute on a `<Portal>` element in this file.
function Portal(props: {
  useShadow?: boolean;
  isSVG?: boolean;
  ref?: (el: Element) => void;
  mount?: Element;
  children?: unknown;
}) {
  void props;
  return null;
}

export const Shadowed = () => (
  <Portal useShadow isSVG ref={() => undefined} mount={document.body}>
    <div>shadowed</div>
  </Portal>
);
