import { Portal } from "solid-js/web";

let target: HTMLElement | undefined;
let g: SVGGElement | undefined;

export const WithShadow = () => (
  <Portal useShadow mount={document.body}>
    <div>shadowed</div>
  </Portal>
);

export const WithSVG = () => (
  <Portal isSVG mount={document.querySelector("svg")!}>
    <circle cx="10" cy="10" r="5" />
  </Portal>
);

export const WithRef = () => (
  <Portal ref={(el) => (target = el as HTMLElement)} mount={document.body}>
    <div>refd</div>
  </Portal>
);

export const WithEverything = () => (
  <Portal useShadow isSVG ref={(el) => (g = el as SVGGElement)} mount={document.body}>
    <div>all three</div>
  </Portal>
);
