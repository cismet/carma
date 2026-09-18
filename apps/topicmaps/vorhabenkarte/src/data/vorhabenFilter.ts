import type { VorhabenFeatureProperties } from "./vorhabenGeoJson";

/** Same shape react-cismap's FeatureCollectionContext held for this map */
export interface VorhabenFilterState {
  topics: string[];
  citizen: boolean;
}

/**
 * Semantics of the old itemFilterFunction (helper/filter.ts): the Vorhaben's
 * theme must be selected, and with the citizen switch on it must additionally
 * be a Buergerbeteiligung one. No selected theme means nothing matches.
 */
export const matchesVorhabenFilter = (
  props: Pick<VorhabenFeatureProperties, "thema_name" | "buergerbeteiligung">,
  state: VorhabenFilterState
): boolean => {
  if (!state.topics.includes(props.thema_name)) {
    return false;
  }
  if (state.citizen && !props.buergerbeteiligung) {
    return false;
  }
  return true;
};

/**
 * The same filter as a MapLibre expression, to AND into the style layers via
 * the LibreLayer's userFilter. Must stay equivalent to matchesVorhabenFilter,
 * the spec checks both against the same features.
 */
export const buildVorhabenFilterExpression = (
  state: VorhabenFilterState
): unknown[] => {
  const byTopic = ["in", ["get", "thema_name"], ["literal", state.topics]];
  if (!state.citizen) {
    return byTopic;
  }
  return ["all", byTopic, ["==", ["get", "buergerbeteiligung"], true]];
};
