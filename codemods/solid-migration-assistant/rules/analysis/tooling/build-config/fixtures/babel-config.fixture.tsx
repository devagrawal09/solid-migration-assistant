// fixture: babel-config
// A babel.config.js and a Vite babel option naming babel-preset-solid, as a
// short name, a package name and a [name, options] pair.
module.exports = {
  presets: ["solid", "@babel/preset-typescript"],
  env: {
    test: { presets: [["babel-preset-solid", { generate: "ssr", hydratable: true }]] },
  },
  plugins: ["solid"],
};
