import LeuchteSearch from "./LeuchteSearch";
import MastSearch from "./MastSearch";
import SchaltstelleSearch from "./SchaltstelleSearch";
import MauerlascheSearch from "./MauerlascheSearch";
import ArbeitsauftragSearch from "./ArbeitsauftragSearch";

export { LeuchteSearch, MastSearch, SchaltstelleSearch, MauerlascheSearch, ArbeitsauftragSearch };

export const featureSearchRegistry: Record<
  string,
  React.ComponentType<unknown>
> = {
  leuchte: LeuchteSearch,
  mast: MastSearch,
  schaltstelle: SchaltstelleSearch,
  mauerlasche: MauerlascheSearch,
  arbeitsauftrag: ArbeitsauftragSearch,
};
