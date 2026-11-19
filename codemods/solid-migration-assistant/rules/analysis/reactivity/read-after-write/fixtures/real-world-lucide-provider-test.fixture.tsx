// fixture: real-world-lucide-provider-test
// Origin: lucide-icons/lucide, packages/lucide-solid/tests/context.spec.tsx at
// commit 56972960bb3cf93fe9208433c21afdf1280cb9eb, reduced to the reactive
// props test, with the components stubbed. License: ISC
// (https://github.com/lucide-icons/lucide/blob/56972960bb3cf93fe9208433c21afdf1280cb9eb/LICENSE).
// The second test flushes and the third awaits, so neither is reported.
import { render } from "@solidjs/testing-library";
import { createSignal, flush } from "solid-js";
import { describe, expect, it } from "vitest";

const LucideProvider = (props: { size: number; children?: unknown }) => <svg width={props.size}>{props.children as any}</svg>;
const House = () => <path />;

describe("Using LucideProvider", () => {
  it("should update when reactive LucideProvider props change", () => {
    const [size, setSize] = createSignal(24);
    const { container } = render(() => (
      <LucideProvider size={size()}>
        <House />
      </LucideProvider>
    ));

    expect(container.firstElementChild).toHaveAttribute("width", "24");

    setSize(48);

    expect(container.firstElementChild).toHaveAttribute("width", "48");
    expect(container.firstElementChild).toHaveAttribute("height", "48");
  });

  it("flushes before checking", () => {
    const [size, setSize] = createSignal(24);
    const { container } = render(() => <LucideProvider size={size()} />);
    setSize(48);
    flush();
    expect(container.firstElementChild).toHaveAttribute("width", "48");
  });

  it("awaits before checking", async () => {
    const [size, setSize] = createSignal(24);
    const { container } = render(() => <LucideProvider size={size()} />);
    setSize(48);
    await Promise.resolve();
    expect(container.firstElementChild).toHaveAttribute("width", "48");
  });
});
