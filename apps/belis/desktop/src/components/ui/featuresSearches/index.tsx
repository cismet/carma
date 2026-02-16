import LeuchteSearch from "./LeuchteSearch";
import MastSearch from "./MastSearch";

export { LeuchteSearch, MastSearch };

export const featureSearchRegistry: Record<string, React.ComponentType<unknown>> = {
  leuchte: LeuchteSearch,
  mast: MastSearch,
};
