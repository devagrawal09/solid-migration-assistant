// Components and namespaced element names are never reported, so a
// camelCase attribute on them stays silent — the attribute flows into the
// component's own props, which it interprets however it wants.

type ButtonProps = { tabIndex?: number; readOnly?: boolean; onClick?: () => void };
function MyButton(props: ButtonProps) {
  return (
    <button onClick={props.onClick} tabindex={props.tabIndex ?? 0}>
      button
    </button>
  );
}

export const Components = () => (
  <>
    <MyButton tabIndex={1} readOnly />
  </>
);

export const Namespaced = () => (
  // @ts-expect-error — namespaced element names are not intrinsic for this rule.
  <svg:foreignObject tabIndex={1} />
);

// Member components (Foo.Bar) are also excluded.
const Panel = { Header: (_props: { tabIndex?: number }) => null };
export const Member = () => <Panel.Header tabIndex={1} />;
