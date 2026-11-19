// fixture: plugin-options
// The options vite-plugin-solid 2.x took that @solidjs/vite-plugin 3.0.1
// dropped or changed. include, exclude, dev, ssr, extensions and the
// surviving compiler options are not reported.
import { defineConfig } from "vite";
import solidPlugin from "vite-plugin-solid";
import solid from "@solidjs/vite-plugin";

export default defineConfig({
  plugins: [
    solidPlugin({
      hot: false,
      ssr: true,
      include: ["src/**"],
      extensions: [".mdx"],
      babel: { plugins: [["@babel/plugin-proposal-decorators", { version: "2023-05" }]] },
      solid: { moduleName: "solid-js/web", generate: "dom", hydratable: true, omitServerOnlyTemplates: true, delegateEvents: false },
    }),
    solid({ "hot": true, dev: true }),
  ],
});

const options = { hot: false };
export const fromVariable = solidPlugin(options);
