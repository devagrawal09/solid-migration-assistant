// fixture: real-world-lucide-icon-test
// Origin: lucide-icons/lucide, packages/lucide-solid/tests/Icon.spec.tsx at
// commit 56972960bb3cf93fe9208433c21afdf1280cb9eb, reduced to the
// accessibility test's Icon element, with the component stubbed. License: ISC
// (https://github.com/lucide-icons/lucide/blob/56972960bb3cf93fe9208433c21afdf1280cb9eb/LICENSE).
// Icon spreads its props onto the <svg>, so aria-hidden={false} no longer
// renders aria-hidden="false". A string value, an expression and a native
// element's attribute (the transform's) are not reported here.
import { render } from "@solidjs/testing-library";

const Icon = (props: Record<string, unknown>) => <svg {...props} />;
const Icons = { Icon };

export const rendered = render(() => (
  <>
    <Icon size={48} stroke="red" absoluteStrokeWidth aria-hidden={false} />
    <Icons.Icon data-active={true} aria-label="close" />
    <Icon aria-hidden="false" data-open={Math.random() > 0.5} />
  </>
));
