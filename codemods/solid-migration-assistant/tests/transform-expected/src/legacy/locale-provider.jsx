import { LocaleContext } from "./locale";

export const LocaleProvider = (props) => (
  <LocaleContext value={props.locale}>{props.children}</LocaleContext>
);
