/**
 * useMapHighlighting - Connects MapHighlightContext to a MapLibre map instance.
 *
 * Responsibilities:
 * - Syncs highlightingActive to map global state ("highlightingEnabled")
 * - When criteria change: iterates source features, matches against criteria,
 *   calls setFeatureState({ highlighted: true/false })
 * - Registers sourcedata listener to re-apply on new tiles
 * - Optional modifier+click to toggle individual features
 * - On clear: resets all feature state and removes listeners
 */

import { useEffect, useRef, useCallback } from "react";
import type {
  Map as MaplibreMap,
  MapMouseEvent,
  MapGeoJSONFeature,
  GeoJSONFeature,
} from "maplibre-gl";
import { useMapHighlight } from "../contexts/MapHighlightContext";
import type { HighlightCriteria } from "../contexts/MapHighlightContext";
import { buildFeatureStateTarget } from "../utils/featureStateTarget";
import type { FeatureStateRef } from "../utils/featureStateTarget";

/**
 * Pre-built index for O(1) queryId lookups.
 * Keys: "sourceLayer::property::value" and "*::property::value" (wildcard)
 */
type QueryIdIndex = Set<string>;

interface QueryIdLookup {
  index: QueryIdIndex;
  properties: Set<string>;
}

function buildQueryIdLookup(criteria: HighlightCriteria): QueryIdLookup {
  const index: QueryIdIndex = new Set();
  const properties = new Set<string>();
  for (const qid of criteria.queryIds) {
    index.add(`${qid.sourceLayer}::${qid.property}::${qid.value}`);
    properties.add(qid.property);
  }
  return { index, properties };
}

type MapWithGlobalState = MaplibreMap & {
  setGlobalStateProperty(key: string, value: unknown): void;
};

export interface UseMapHighlightingOptions {
  map: MaplibreMap | null;
  /** Source config. If omitted, auto-discovered from map style sources. */
  sources?: Array<{ source: string; sourceLayers: string[] }>;
  /** Modifier key for click-to-toggle. null = disabled. Default: null */
  modifierClick?: "alt" | "ctrl" | "shift" | "meta" | null;
  /** Feature state key. Default: "highlighted" */
  stateKey?: string;
  /** Called after a modifier+click toggle with the toggled feature. */
  onToggle?: (feature: MapGeoJSONFeature) => void;
  /** Called after highlights are applied with the deduplicated set of matched features. */
  onHighlightsApplied?: (features: GeoJSONFeature[]) => void;
}

/** Discover all sources and their source layers from the map style.
 *  Geojson sources have no native source-layer; they end up with an empty
 *  list and are iterated once in applyHighlights (effective layer comes
 *  from properties._sourceLayer). */
function discoverSources(
  map: MaplibreMap
): Array<{ source: string; sourceLayers: string[] }> {
  const style = map.getStyle();
  if (!style?.layers) return [];

  const sourceMap = new Map<string, Set<string>>();
  for (const layer of style.layers) {
    if ("source" in layer && layer.source) {
      const src = layer.source as string;
      if (!sourceMap.has(src)) sourceMap.set(src, new Set());
      if ("source-layer" in layer && layer["source-layer"]) {
        sourceMap.get(src)!.add(layer["source-layer"] as string);
      }
    }
  }

  return Array.from(sourceMap.entries()).map(([source, sls]) => ({
    source,
    sourceLayers: Array.from(sls),
  }));
}

/** Check whether a feature matches the current highlight criteria.
 *  Toggled features act as a flip (XOR): toggling a feature that already
 *  matches a property/query criterion removes it from the result set,
 *  while toggling a non-matching feature adds it. */
function matchesCriteria(
  criteria: HighlightCriteria,
  queryIdLookup: QueryIdLookup,
  featureProps: Record<string, unknown>,
  featureId: string | number,
  sourceLayer: string,
  source: string
): boolean {
  const toggleKey = `${source}::${sourceLayer}::${featureId}`;
  // Dismiss wins over every other match — unified un-highlight regardless of
  // which store originally selected the feature (toggledFeatures / queryIds /
  // propertyMatchers). Cleared by re-adding the feature or clearHighlights.
  if (criteria.suppressedFeatures.has(toggleKey)) return false;
  const isToggled = criteria.toggledFeatures.has(toggleKey);

  // Check property matchers
  let matchedByCriteria = false;
  for (const matcher of criteria.propertyMatchers) {
    if (
      matcher.sourceLayers &&
      matcher.sourceLayers.length > 0 &&
      !matcher.sourceLayers.includes(sourceLayer)
    ) {
      continue;
    }
    const val = String(featureProps[matcher.property] ?? "");
    if (matcher.regex.test(val)) {
      matchedByCriteria = true;
      break;
    }
  }

  // Check query IDs via Set index (O(1) per property instead of O(N))
  if (!matchedByCriteria && queryIdLookup.index.size > 0) {
    for (const prop of queryIdLookup.properties) {
      const val = String(featureProps[prop] ?? "");
      if (
        queryIdLookup.index.has(`${sourceLayer}::${prop}::${val}`) ||
        queryIdLookup.index.has(`*::${prop}::${val}`)
      ) {
        matchedByCriteria = true;
        break;
      }
    }
  }

  // XOR: toggle flips the match state
  if (isToggled) return !matchedByCriteria;
  return matchedByCriteria;
}

export const useMapHighlighting = ({
  map,
  sources: explicitSources,
  modifierClick = null,
  stateKey = "highlighted",
  onToggle,
  onHighlightsApplied,
}: UseMapHighlightingOptions): void => {
  const {
    highlightingActive,
    setHighlightingActive,
    criteria,
    highlightVersion,
    toggleFeatureHighlight,
  } = useMapHighlight();

  const sourceDataCleanupRef = useRef<(() => void) | null>(null);
  const prevVersionRef = useRef(-1);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Targets we've currently marked as highlighted (key -> target), so we can
  // clear exactly those when criteria change. We deliberately never write
  // `false` to the (many) non-matching features: MapLibre treats every
  // setFeatureState call as a change and re-evaluates + re-uploads those
  // features at render even when the value is unchanged, which stalls for
  // seconds when the whole dataset is loaded (city-level zoom). The style
  // reads `["boolean", ["feature-state", "highlighted"], false]`, so an unset
  // feature already renders as not-highlighted.
  const markedRef = useRef<Map<string, FeatureStateRef>>(new Map());

  // A clear-of-the-previous-set can be requested (criteria change or
  // deactivation) at a moment when the style isn't loaded — e.g. a concurrent
  // source setData (the brandnew FC poll fires every 1s in localhost / 15s in
  // prod) momentarily flips isStyleLoaded() to false. When that happens we
  // can't touch feature-state, so we remember the owed clear here and honor it
  // on the next style-loaded apply. Without this, the recovery re-apply runs
  // with clearPrevious=false and UNIONS the stale old highlights with the new
  // ones (old + new both shown after a "clean" + new lasso/search).
  const pendingClearRef = useRef(false);

  // Stable ref so applyHighlights doesn't need onHighlightsApplied as a dependency
  const onHighlightsAppliedRef = useRef<
    ((features: GeoJSONFeature[]) => void) | undefined
  >(onHighlightsApplied);
  onHighlightsAppliedRef.current = onHighlightsApplied;

  // Clear only the currently-marked highlights. Cheap: proportional to the
  // number of highlighted features, not to the number of loaded features.
  const clearMarked = useCallback(
    (mapInst: MaplibreMap) => {
      for (const target of markedRef.current.values()) {
        mapInst.setFeatureState(target, { [stateKey]: false });
      }
      markedRef.current.clear();
    },
    [stateKey]
  );

  // Apply highlight feature state to currently loaded features.
  // `clearPrevious` = true on a genuine criteria change (clear the old
  // highlight set first); false on a same-criteria re-apply for newly loaded
  // tiles (keep existing marks, only add newly-visible matches).
  const applyHighlights = useCallback(
    (mapInst: MaplibreMap, clearPrevious: boolean) => {
      // Guard: style must be loaded before we can query sources/features.
      // If a clear was owed, remember it so the next (style-loaded) apply
      // clears the old set first instead of unioning it with the new one.
      if (!mapInst.isStyleLoaded()) {
        if (clearPrevious) pendingClearRef.current = true;
        return;
      }

      // Ensure global state is in sync: the style uses ["global-state",
      // "highlightingEnabled"] to dim non-highlighted features. Setting it
      // here (alongside feature-state) guarantees both arrive in the same
      // MapLibre render frame, avoiding a flash of un-dimmed features.
      const mGlobal = mapInst as MapWithGlobalState;
      if (typeof mGlobal.setGlobalStateProperty === "function") {
        mGlobal.setGlobalStateProperty("highlightingEnabled", true);
      }

      if (clearPrevious || pendingClearRef.current) clearMarked(mapInst);
      pendingClearRef.current = false;

      const srcs = explicitSources ?? discoverSources(mapInst);
      const queryIdLookup = buildQueryIdLookup(criteria);
      const matched: GeoJSONFeature[] = [];
      const seen = new Set<string>();
      const marked = markedRef.current;

      for (const { source, sourceLayers } of srcs) {
        // Geojson sources: querySourceFeatures ignores sourceLayer; iterate
        // once and read the effective layer per-feature from the stamped
        // properties._sourceLayer (a convention established for the
        // brandnew FC). Vector sources iterate per configured sourceLayer.
        const isGeojson = mapInst.getSource(source)?.type === "geojson";
        const iterLayers: (string | undefined)[] = isGeojson
          ? [undefined]
          : [...sourceLayers];
        for (const iterSL of iterLayers) {
          const features =
            iterSL === undefined
              ? mapInst.querySourceFeatures(source)
              : mapInst.querySourceFeatures(source, { sourceLayer: iterSL });
          for (const f of features) {
            if (f.id == null) continue;
            const props = (f.properties ?? {}) as Record<string, unknown>;
            const effectiveSL = isGeojson
              ? String(props._sourceLayer ?? "")
              : (iterSL as string);
            const shouldHighlight = matchesCriteria(
              criteria,
              queryIdLookup,
              props,
              f.id,
              effectiveSL,
              source
            );
            // Only touch feature-state for actual matches; non-matches are
            // left unset (== false in the style). Skip matches already marked
            // (feature can recur across tiles / sourcedata re-applies).
            if (!shouldHighlight) continue;
            const stateId = `${source}::${effectiveSL}::${String(f.id)}`;
            if (!marked.has(stateId)) {
              const target = buildFeatureStateTarget(mapInst, {
                source,
                sourceLayer: effectiveSL,
                id: f.id,
              });
              mapInst.setFeatureState(target, { [stateKey]: true });
              marked.set(stateId, target);
            }
            const dedupKey = `${effectiveSL}::${String(props.id ?? f.id)}`;
            if (!seen.has(dedupKey)) {
              seen.add(dedupKey);
              const fAny = f as GeoJSONFeature & {
                source?: string;
                sourceLayer?: string;
              };
              fAny.source = source;
              fAny.sourceLayer = effectiveSL;
              matched.push(f);
            }
          }
        }
      }

      onHighlightsAppliedRef.current?.(matched);
    },
    [criteria, explicitSources, stateKey, clearMarked]
  );

  // Clear all highlight state we've applied. Only the features we marked need
  // clearing; unset features already render as not-highlighted.
  const clearAllState = useCallback(
    (mapInst: MaplibreMap) => {
      // Guard: style must be loaded before we can touch feature state. If it
      // isn't (e.g. a concurrent source setData), remember the owed clear so
      // the next apply still wipes the stale set first — otherwise a "clean"
      // that lands during a style reload leaves the old highlights set (only
      // hidden by dimming) and they resurface on the next selection.
      if (!mapInst.isStyleLoaded()) {
        pendingClearRef.current = true;
        return;
      }
      clearMarked(mapInst);
    },
    [clearMarked]
  );

  // Sync highlightingActive to map global state. The style dims
  // non-highlighted features via ["global-state", "highlightingEnabled"], so
  // this value MUST always converge to highlightingActive — otherwise a
  // deactivation that gets dropped leaves the map permanently dimmed.
  //
  // The style isn't always loaded when this runs (e.g. a concurrent source
  // setData from a data refresh momentarily flips isStyleLoaded() to false).
  // Instead of silently bailing in that case, defer the write via a one-shot
  // "idle" listener so it still lands once the map settles.
  useEffect(() => {
    if (!map) return;
    const m = map as MapWithGlobalState;
    const apply = () => {
      if (typeof m.setGlobalStateProperty === "function") {
        m.setGlobalStateProperty("highlightingEnabled", highlightingActive);
      }
    };
    if (map.isStyleLoaded()) {
      apply();
      return;
    }
    map.once("idle", apply);
    return () => {
      map.off("idle", apply);
    };
  }, [map, highlightingActive]);

  // Apply highlights when criteria change
  useEffect(() => {
    if (!map || !highlightingActive) return;
    // Only apply when version actually changed
    if (prevVersionRef.current === highlightVersion) return;
    prevVersionRef.current = highlightVersion;

    applyHighlights(map, true);

    // Start debounced sourcedata listener for new tiles
    sourceDataCleanupRef.current?.();
    const handler = () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = setTimeout(
        () => applyHighlights(map, false),
        100
      );
    };
    map.on("sourcedata", handler);
    sourceDataCleanupRef.current = () => {
      map.off("sourcedata", handler);
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
    };

    return () => {
      sourceDataCleanupRef.current?.();
      sourceDataCleanupRef.current = null;
    };
  }, [map, highlightingActive, highlightVersion, applyHighlights]);

  // Clear state when highlighting is deactivated
  useEffect(() => {
    if (!map || highlightingActive) return;
    clearAllState(map);
    sourceDataCleanupRef.current?.();
    sourceDataCleanupRef.current = null;
  }, [map, highlightingActive, clearAllState]);

  // Modifier+click handler
  useEffect(() => {
    if (!map || !modifierClick) return;

    const handler = (e: MapMouseEvent & { originalEvent: MouseEvent }) => {
      const orig = e.originalEvent;
      const modifierPressed =
        (modifierClick === "alt" && orig.altKey) ||
        (modifierClick === "ctrl" && orig.ctrlKey) ||
        (modifierClick === "shift" && orig.shiftKey) ||
        (modifierClick === "meta" && orig.metaKey);
      if (!modifierPressed) return;

      const hits = map.queryRenderedFeatures(e.point);
      const feature = hits.find((f) => {
        if (f.id == null || !f.source) return false;
        if (
          f.layer.id.includes("selection") ||
          f.layer.id.includes("background")
        )
          return false;
        // Vector tiles always carry sourceLayer; geojson features don't,
        // and we accept them (effective layer comes from properties._sourceLayer).
        if (f.sourceLayer) return true;
        return map.getSource(f.source)?.type === "geojson";
      });
      if (!feature) return;

      const isGeojson = map.getSource(feature.source)?.type === "geojson";
      const effectiveSourceLayer =
        feature.sourceLayer ??
        (isGeojson
          ? String(
              (feature.properties as Record<string, unknown> | undefined)
                ?._sourceLayer ?? ""
            )
          : "");

      // Auto-enable highlighting when toggling via modifier+click
      if (!highlightingActive) {
        setHighlightingActive(true);
      }

      toggleFeatureHighlight({
        source: feature.source,
        sourceLayer: effectiveSourceLayer,
        id: feature.id!,
      });

      // Stamp so onToggle consumers (which read feature.sourceLayer) work
      // for geojson features the same way as for vector tiles.
      if (isGeojson && !feature.sourceLayer) {
        (feature as MapGeoJSONFeature & { sourceLayer?: string }).sourceLayer =
          effectiveSourceLayer;
      }

      onToggle?.(feature);
    };

    map.on("click", handler);
    return () => {
      map.off("click", handler);
    };
  }, [
    map,
    modifierClick,
    highlightingActive,
    setHighlightingActive,
    toggleFeatureHighlight,
    onToggle,
  ]);
};
