// fixture: babel-presets-left
// babel-preset-solid shapes migrate leaves for tooling/build-config to
// report: options that changed or were removed, options it can't read, a
// preset that ran before Solid's compiler, a plugins option it can't edit,
// an options object that spreads, and the preset named twice.
import { babel } from "@rollup/plugin-babel";

const solidOptions = { generate: "dom" };
const shared = { plugins: ["macros"] };

export default [
  babel({ presets: [["solid", { builtIns: ["For", "Show"] }]] }),
  babel({ presets: [["solid", { omitServerOnlyTemplates: false }]] }),
  babel({ presets: [["solid", { staticMarker: "@once" }]] }),
  babel({ presets: [["solid", { moduleName: "solid-three" }]] }),
  babel({ presets: [["solid", solidOptions]] }),
  babel({ presets: [["solid", { ...solidOptions }]] }),
  babel({ presets: ["babel-preset-solid", "@babel/preset-typescript", ["@babel/preset-env", { targets: "last 2 years" }]] }),
  babel({ presets: ["solid"], plugins: shared.plugins }),
  babel({ ...shared, presets: ["solid"] }),
  babel({ presets: ["solid", "babel-preset-solid"] }),
  babel({ presets: [["solid", { generate: "ssr" }]], plugins: [["@solidjs/babel-plugin", { generate: "ssr" }]] }),
];
