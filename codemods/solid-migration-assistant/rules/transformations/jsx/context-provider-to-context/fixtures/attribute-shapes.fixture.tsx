// fixture: attribute-shapes
import { createContext } from "solid-js";

const ThemeContext = createContext("light");
const props = { value: "spread" };

export function Shapes() {
  return (
    <>
      <ThemeContext.Provider>no value</ThemeContext.Provider>
      <ThemeContext.Provider {...props}>spread</ThemeContext.Provider>
      <ThemeContext.Provider value="dark" {...props} />
      <ThemeContext.Provider value="dark" id="extra" />
      <ThemeContext.Provider value />
      <ThemeContext.Provider value={} />
      <ThemeContext.Provider value={/* only a comment */} />
      <ThemeContext.Provider value="dark" children="inline" />
      <ThemeContext.Provider ns:value="dark" />
    </>
  );
}
