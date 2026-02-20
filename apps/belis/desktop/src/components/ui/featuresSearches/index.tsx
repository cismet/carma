import LeuchteSearch from "./LeuchteSearch";
import MastSearch from "./MastSearch";
import SchaltstelleSearch from "./SchaltstelleSearch";

export { LeuchteSearch, MastSearch, SchaltstelleSearch };

export const featureSearchRegistry: Record<
  string,
  React.ComponentType<unknown>
> = {
  leuchte: LeuchteSearch,
  mast: MastSearch,
  schaltstelle: SchaltstelleSearch,
};
