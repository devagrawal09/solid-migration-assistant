// fixture: tuples-consumers
// Callers of tuples' factories. The findings are reported from tuples, where
// the contexts are created, at these sites.
import { useContext } from "solid-js";
import { createContextAndHook, createPlainHook, createSpread } from "./tuples.fixture";

export const [ThemeContext, useMaybeTheme] = createContextAndHook<{ dark: boolean }>();
const [, LocaleContext] = createPlainHook<string>();
const [usePlainUser] = createPlainHook<{ id: string }>();
const [useSpreadValue] = createSpread<string>([]);

export function useThemeOrThrow() {
  const theme = useContext(ThemeContext);
  if (!theme) throw new Error("no ThemeProvider");
  return theme;
}

export function Badge() {
  const theme = useMaybeTheme();
  const locale = useContext(LocaleContext);
  const spread = useSpreadValue();
  return theme?.dark ? `${locale}:${spread}` : locale;
}

// The plain hook's result is used as is: nothing tells it is optional.
export const userId = () => usePlainUser().id;
