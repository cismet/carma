import LeuchteSearch from "./LeuchteSearch";

export { LeuchteSearch };

export const featureSearchRegistry: Record<string, React.ComponentType<unknown>> = {
  leuchte: LeuchteSearch,
};
