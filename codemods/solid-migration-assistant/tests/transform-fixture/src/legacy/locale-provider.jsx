import { LocaleContext } from "./locale";

export const LocaleProvider = (props) => (
  <LocaleContext.Provider value={props.locale}>{props.children}</LocaleContext.Provider>
);
