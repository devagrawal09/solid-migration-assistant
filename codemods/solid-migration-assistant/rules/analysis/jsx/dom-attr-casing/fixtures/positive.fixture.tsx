export const All = () => (
  <>
    <div tabIndex={0}>tab</div>
    <input readOnly maxLength={10} minLength={2} inputMode="numeric" />
    <button formAction="/x" formMethod="post" formEnctype="multipart/form-data" formTarget="_blank" formNoValidate>
      submit
    </button>
    <td colSpan={2} rowSpan={3}>cell</td>
    <time dateTime="2026-01-01">then</time>
    <img srcSet="a.png 1x, b.png 2x" useMap="#m" isMap crossOrigin="anonymous" referrerPolicy="no-referrer" />
    <div contentEditable="true" accessKey="h" autoCapitalize="words" contextMenu="menu" exportParts="a:b" />
    <div itemScope itemType="https://schema.org/Person" itemId="urn:x" itemRef="r" itemProp="name" />
    <script noModule />
    <form noValidate />
    <video mediaGroup="g" />
    <button popoverTarget="p" popoverTargetAction="show">open</button>
  </>
);
