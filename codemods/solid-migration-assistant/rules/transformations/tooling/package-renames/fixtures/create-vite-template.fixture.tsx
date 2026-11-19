// fixture: create-vite-template
// Origin: vitejs/vite, packages/create-vite/template-solid-ts/vite.config.ts as
// create-vite 9.3.4 writes it. License: MIT
// (https://github.com/vitejs/vite/blob/main/LICENSE).
import { defineConfig } from 'vite'
import solid from 'vite-plugin-solid'

export default defineConfig({
  plugins: [solid()],
})
