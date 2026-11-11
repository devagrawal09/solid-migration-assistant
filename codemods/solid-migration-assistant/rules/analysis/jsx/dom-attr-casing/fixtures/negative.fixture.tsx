// Lowercase forms are what rc.21 still accepts, so nothing is reported.
export const Lowercase = () => (
  <>
    <div tabindex={0} />
    <input readonly maxlength={10} minlength={2} inputmode="numeric" />
    <td colspan={2} rowspan={3} />
    <time datetime="2026-01-01">then</time>
    <img srcset="a.png 1x, b.png 2x" usemap="#m" ismap crossorigin="anonymous" referrerpolicy="no-referrer" />
    <div contenteditable="true" accesskey="h" autocapitalize="words" contextmenu="menu" exportparts="a:b" />
  </>
);

// Event handlers (on*) are owned by the dom-lowercase-events rule, not here.
export const Events = () => (
  <button onClick={() => undefined} onclick={() => undefined}>
    hi
  </button>
);

// classList is owned by the class-list rule; this rule skips it even though
// rc.21 drops both camelCase and lowercase declarations.
export const Classes = () => <div classList={{ on: true }} />;
