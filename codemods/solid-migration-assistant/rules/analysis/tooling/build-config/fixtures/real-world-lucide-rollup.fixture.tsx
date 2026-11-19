// fixture: real-world-lucide-rollup
// Origin: lucide-icons/lucide, packages/lucide-solid/rollup.config.mjs at
// commit 56972960bb3cf93fe9208433c21afdf1280cb9eb, reduced to the Babel
// presets, the esbuild source build's jsxImportSource and the rollup
// externals. License: ISC
// (https://github.com/lucide-icons/lucide/blob/56972960bb3cf93fe9208433c21afdf1280cb9eb/LICENSE).
import { babel } from '@rollup/plugin-babel';
import esbuild from 'esbuild';

export default {
  input: 'src/lucide-solid.ts',
  plugins: [
    babel({
      extensions: ['.ts', '.tsx', '.js', '.jsx'],
      babelHelpers: 'bundled',
      presets: [
        'babel-preset-solid',
        '@babel/preset-typescript',
        ['@babel/preset-env', { targets: 'last 2 years' }],
      ],
    }),
    {
      name: 'ts',
      buildEnd() {
        esbuild.build({
          entryPoints: ['./src/**/*.tsx', './src/**/*.ts'],
          outdir: './dist/source',
          jsx: 'preserve',
          jsxImportSource: 'solid-js',
          external: ['solid-js'],
        });
      },
    },
  ],
  external: ['solid-js', 'solid-js/web', 'solid-js/store'],
};
