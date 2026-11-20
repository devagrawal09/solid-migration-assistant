// fixture: babel-presets
// babel-preset-solid in the presets shapes migrate moves to plugins as
// @solidjs/babel-plugin: alone, beside presets that ran after it, with
// options that carry over, into an existing plugins list, and where the
// plugin is already listed.
module.exports = {
  presets: ["solid"],
  env: {
    test: {
      presets: [["babel-preset-solid", { generate: "ssr", hydratable: true, moduleName: "solid-js/web" }]],
    },
    jest: {
      presets: [
        "@babel/preset-env",
        "babel-preset-solid",
        "@babel/preset-typescript",
      ],
      plugins: [
        "@babel/plugin-proposal-decorators",
      ],
    },
  },
  overrides: [
    { test: "*.tsx", presets: ['solid', '@babel/preset-typescript'] },
    { test: "*.jsx", "presets": ["solid"], plugins: [] },
    { test: "*.mjs", presets: ["solid", "@babel/preset-typescript"], plugins: ["@solidjs/babel-plugin"] },
  ],
};
