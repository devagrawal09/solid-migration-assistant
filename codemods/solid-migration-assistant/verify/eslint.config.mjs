// eslint-plugin-solid's Solid 2 config, applied from outside the target so
// the project's own lint setup and files stay untouched.
import solid from "eslint-plugin-solid/configs/v2";
import tseslint from "typescript-eslint";

export default [
  { ignores: ["**/node_modules/**", "**/dist/**", "**/build/**", "**/coverage/**", "**/*.d.ts"] },
  {
    files: ["**/*.{js,jsx,mjs,ts,tsx}"],
    ...solid,
    languageOptions: { ...solid.languageOptions, parser: tseslint.parser },
  },
];
