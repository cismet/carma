/**
 * MapHighlightContext - Shared context for declarative map feature highlighting
 *
 * Engine-agnostic context holding highlight *intent* (not execution).
 * The actual map-engine work (setFeatureState, sourcedata listeners, etc.)
 * is done by engine-specific hooks like useMapHighlighting.
 *
 * - External callers set criteria via highlightByProperty / highlightByIds / toggleFeatureHighlight
 * - Engine hooks watch criteria + highlightVersion and apply visual state
 * - highlightVersion is bumped on every mutation so consumers can react
 */

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  useRef,
  type ReactNode,
} from "react";

export interface PropertyMatcher {
  property: string;
  regex: RegExp;
  sourceLayers?: string[];
}

export interface QueryId {
  sourceLayer: string;
  property: string;
  value: string | number;
}

export interface ToggledFeature {
  source: string;
  sourceLayer: string;
  id: string | number;
}

export interface HighlightCriteria {
  /** Property matchers: match features where properties[property] matches regex */
  propertyMatchers: PropertyMatcher[];
  /** Query-result IDs: structured form parsed from "sourceLayer:value" strings */
  queryIds: QueryId[];
  /** Individually toggled feature identifiers (from modifier+click) */
  toggledFeatures: Map<string, ToggledFeature>;
  /** Features the user explicitly dismissed. Wins over every other match so the
   *  sidebar ✕ works uniformly regardless of how a feature became highlighted
   *  (lasso → toggledFeatures, modal search → queryIds, street search →
   *  propertyMatchers). Cleared by adding the feature back or clearHighlights. */
  suppressedFeatures: Map<string, ToggledFeature>;
}

export interface MapHighlightContextType {
  highlightingActive: boolean;
  setHighlightingActive: (active: boolean) => void;
  criteria: HighlightCriteria;
  /** Add property regex matcher, e.g. highlightByProperty("strassenschluessel", /00026/i) */
  highlightByProperty: (
    property: string,
    regex: RegExp,
    sourceLayers?: string[]
  ) => void;
  /** Parse "sourceLayer:value" strings, match against properties.id by default */
  highlightByIds: (ids: string[], options?: { property?: string }) => void;
  /** Toggle a single feature (for click interactions) */
  toggleFeatureHighlight: (id: ToggledFeature) => void;
  /** Idempotently ensure features are toggled on or off */
  ensureToggledFeatures: (ids: ToggledFeature[], toggled: boolean) => void;
  /** Idempotently mark features as suppressed (dismissed) or unsuppress them.
   *  Suppressed features render as un-highlighted even if a matcher/query/toggle
   *  would otherwise select them. Adding via ensureToggledFeatures(_, true) or
   *  toggleFeatureHighlight (when adding) implicitly unsuppresses. */
  ensureSuppressedFeatures: (
    ids: ToggledFeature[],
    suppressed: boolean
  ) => void;
  /** Clear everything */
  clearHighlights: () => void;
  /** Version counter bumped on every mutation */
  highlightVersion: number;
}

const EMPTY_CRITERIA: HighlightCriteria = {
  propertyMatchers: [],
  queryIds: [],
  toggledFeatures: new Map(),
  suppressedFeatures: new Map(),
};

const defaultContext: MapHighlightContextType = {
  highlightingActive: false,
  setHighlightingActive: () => {},
  criteria: EMPTY_CRITERIA,
  highlightByProperty: () => {},
  highlightByIds: () => {},
  toggleFeatureHighlight: () => {},
  ensureToggledFeatures: () => {},
  ensureSuppressedFeatures: () => {},
  clearHighlights: () => {},
  highlightVersion: 0,
};

export const MapHighlightContext =
  createContext<MapHighlightContextType>(defaultContext);

interface MapHighlightProviderProps {
  children: ReactNode;
  debug?: boolean;
}

export const MapHighlightProvider = ({
  children,
  debug = false,
}: MapHighlightProviderProps) => {
  const [highlightingActive, setHighlightingActive] = useState(false);
  const [highlightVersion, setHighlightVersion] = useState(0);

  // Use ref + state bump pattern: criteria is mutable (avoids re-creating objects),
  // and highlightVersion triggers consumers to re-read.
  const criteriaRef = useRef<HighlightCriteria>({
    propertyMatchers: [],
    queryIds: [],
    toggledFeatures: new Map(),
    suppressedFeatures: new Map(),
  });

  const bump = useCallback(() => setHighlightVersion((v) => v + 1), []);

  const highlightByProperty = useCallback(
    (property: string, regex: RegExp, sourceLayers?: string[]) => {
      if (debug) {
        console.log("[MapHighlight] highlightByProperty", {
          property,
          regex: regex.source,
          sourceLayers,
        });
      }
      criteriaRef.current.propertyMatchers.push({
        property,
        regex,
        sourceLayers,
      });
      bump();
    },
    [debug, bump]
  );

  const highlightByIds = useCallback(
    (ids: string[], options?: { property?: string }) => {
      const property = options?.property ?? "id";
      if (debug) {
        console.log("[MapHighlight] highlightByIds", { ids, property });
      }
      for (const raw of ids) {
        const colonIdx = raw.indexOf(":");
        if (colonIdx > 0) {
          criteriaRef.current.queryIds.push({
            sourceLayer: raw.slice(0, colonIdx),
            property,
            value: raw.slice(colonIdx + 1),
          });
        } else {
          // No sourceLayer prefix: match across all source layers
          criteriaRef.current.queryIds.push({
            sourceLayer: "*",
            property,
            value: raw,
          });
        }
      }
      bump();
    },
    [debug, bump]
  );

  const toggleFeatureHighlight = useCallback(
    (id: ToggledFeature) => {
      const key = `${id.source}::${id.sourceLayer}::${id.id}`;
      const toggled = criteriaRef.current.toggledFeatures;
      const suppressed = criteriaRef.current.suppressedFeatures;
      if (toggled.has(key)) {
        toggled.delete(key);
        if (debug) console.log("[MapHighlight] un-toggled feature", key);
      } else {
        toggled.set(key, id);
        // Re-toggling counts as re-adding — drop any prior suppression so the
        // feature actually shows up (would otherwise stay hidden by the dismiss).
        suppressed.delete(key);
        if (debug) console.log("[MapHighlight] toggled feature", key);
      }
      bump();
    },
    [debug, bump]
  );

  const ensureToggledFeatures = useCallback(
    (ids: ToggledFeature[], toggled: boolean) => {
      const map = criteriaRef.current.toggledFeatures;
      const suppressed = criteriaRef.current.suppressedFeatures;
      let changed = false;
      for (const id of ids) {
        const key = `${id.source}::${id.sourceLayer}::${id.id}`;
        if (toggled) {
          if (!map.has(key)) {
            map.set(key, id);
            changed = true;
          }
          // Adding is an explicit "show this" — clear any prior dismiss.
          if (suppressed.delete(key)) changed = true;
        } else {
          if (map.has(key)) {
            map.delete(key);
            changed = true;
          }
        }
      }
      if (changed) {
        if (debug)
          console.log("[MapHighlight] ensureToggledFeatures", {
            count: ids.length,
            toggled,
          });
        bump();
      }
    },
    [debug, bump]
  );

  const ensureSuppressedFeatures = useCallback(
    (ids: ToggledFeature[], suppressed: boolean) => {
      const map = criteriaRef.current.suppressedFeatures;
      let changed = false;
      for (const id of ids) {
        const key = `${id.source}::${id.sourceLayer}::${id.id}`;
        if (suppressed) {
          if (!map.has(key)) {
            map.set(key, id);
            changed = true;
          }
        } else {
          if (map.has(key)) {
            map.delete(key);
            changed = true;
          }
        }
      }
      if (changed) {
        if (debug)
          console.log("[MapHighlight] ensureSuppressedFeatures", {
            count: ids.length,
            suppressed,
          });
        bump();
      }
    },
    [debug, bump]
  );

  const clearHighlights = useCallback(() => {
    if (debug) console.log("[MapHighlight] clearHighlights");
    criteriaRef.current = {
      propertyMatchers: [],
      queryIds: [],
      toggledFeatures: new Map(),
      suppressedFeatures: new Map(),
    };
    bump();
  }, [debug, bump]);

  const value = useMemo(
    () => ({
      highlightingActive,
      setHighlightingActive,
      criteria: criteriaRef.current,
      highlightByProperty,
      highlightByIds,
      toggleFeatureHighlight,
      ensureToggledFeatures,
      ensureSuppressedFeatures,
      clearHighlights,
      highlightVersion,
    }),
    [
      highlightingActive,
      highlightByProperty,
      highlightByIds,
      toggleFeatureHighlight,
      ensureToggledFeatures,
      ensureSuppressedFeatures,
      clearHighlights,
      highlightVersion,
    ]
  );

  return (
    <MapHighlightContext.Provider value={value}>
      {children}
    </MapHighlightContext.Provider>
  );
};

export const useMapHighlight = () => useContext(MapHighlightContext);
