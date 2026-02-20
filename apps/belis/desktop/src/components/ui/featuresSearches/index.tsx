import LeuchteSearch from "./LeuchteSearch";
import MastSearch from "./MastSearch";
import SchaltstelleSearch from "./SchaltstelleSearch";
import MauerlascheSearch from "./MauerlascheSearch";

export { LeuchteSearch, MastSearch, SchaltstelleSearch, MauerlascheSearch };

export const featureSearchRegistry: Record<
  string,
  React.ComponentType<unknown>
> = {
  leuchte: LeuchteSearch,
  mast: MastSearch,
  schaltstelle: SchaltstelleSearch,
  mauerlasche: MauerlascheSearch,
};
