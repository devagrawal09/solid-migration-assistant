// fixture: nonmatches
// Already Solid 2, or not Solid: nothing here is reported.
import { defineConfig } from "vite";
import solid from "@solidjs/vite-plugin";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [solid({ ssr: true, refresh: false, solid: { moduleName: "@solidjs/web" } }), react({ babel: {} })],
  esbuild: { jsxImportSource: "@solidjs/web" },
  optimizeDeps: { include: ["@solidjs/web", "solid-js"], exclude: ["solid-js/web-extra"] },
  babel: { presets: ["@babel/preset-env"] },
});
const label = "solid-js/web";
