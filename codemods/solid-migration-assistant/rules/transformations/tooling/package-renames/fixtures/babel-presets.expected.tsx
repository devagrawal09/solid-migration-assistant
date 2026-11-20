// fixture: babel-presets
// babel-preset-solid in the presets shapes migrate moves to plugins as
// @solidjs/babel-plugin: alone, beside presets that ran after it, with
// options that carry over, into an existing plugins list, and where the
// plugin is already listed.
module.exports = {
  plugins: ["@solidjs/babel-plugin"],
  env: {
    test: {
      plugins: [["@solidjs/babel-plugin", { generate: "ssr", hydratable: true, moduleName: "@solidjs/web" }]],
    },
    jest: {
      presets: [
        "@babel/preset-env",
        "@babel/preset-typescript",
      ],
      plugins: [
        "@babel/plugin-proposal-decorators",
        "@solidjs/babel-plugin",
      ],
    },
  },
  overrides: [
    { test: "*.tsx", presets: ['@babel/preset-typescript'], plugins: ['@solidjs/babel-plugin'] },
    { test: "*.jsx", plugins: ["@solidjs/babel-plugin"] },
    { test: "*.mjs", presets: ["@babel/preset-typescript"], plugins: ["@solidjs/babel-plugin"] },
    {
      test: "*.cjs",
      // Comments that belong to the presets around it stay.
      presets: [
        // TypeScript last
        "@babel/preset-typescript",
      ],
      plugins: ["@solidjs/babel-plugin"],
    },
  ],
};
