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

  // Stable ref so applyHighlights doesn't need onHighlightsApplied as a dependency
  const onHighlightsAppliedRef = useRef<
    ((features: GeoJSONFeature[]) => void) | undefined
  >(onHighlightsApplied);
  onHighlightsAppliedRef.current = onHighlightsApplied;

  // Apply highlight feature state to all currently loaded features
  const applyHighlights = useCallback(
    (mapInst: MaplibreMap) => {
      // Guard: style must be loaded before we can query sources/features
      if (!mapInst.isStyleLoaded()) return;

      // Ensure global state is in sync: the style uses ["global-state",
      // "highlightingEnabled"] to dim non-highlighted features. Setting it
      // here (alongside feature-state) guarantees both arrive in the same
      // MapLibre render frame, avoiding a flash of un-dimmed features.
      const mGlobal = mapInst as MapWithGlobalState;
      if (typeof mGlobal.setGlobalStateProperty === "function") {
        mGlobal.setGlobalStateProperty("highlightingEnabled", true);
      }

      const srcs = explicitSources ?? discoverSources(mapInst);
      const queryIdLookup = buildQueryIdLookup(criteria);
      const matched: GeoJSONFeature[] = [];
      const seen = new Set<string>();

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
            mapInst.setFeatureState(
              buildFeatureStateTarget(mapInst, {
                source,
                sourceLayer: effectiveSL,
                id: f.id,
              }),
              { [stateKey]: shouldHighlight }
            );
            if (shouldHighlight) {
              const key = `${effectiveSL}::${String(props.id ?? f.id)}`;
              if (!seen.has(key)) {
                seen.add(key);
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
      }

      onHighlightsAppliedRef.current?.(matched);
    },
    [criteria, explicitSources, stateKey]
  );

  // Clear all highlight state from loaded features
  const clearAllState = useCallback(
    (mapInst: MaplibreMap) => {
      // Guard: style must be loaded before we can query sources/features
      if (!mapInst.isStyleLoaded()) return;

      const srcs = explicitSources ?? discoverSources(mapInst);
      for (const { source, sourceLayers } of srcs) {
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
            mapInst.setFeatureState(
              buildFeatureStateTarget(mapInst, {
                source,
                sourceLayer: iterSL,
                id: f.id,
              }),
              { [stateKey]: false }
            );
          }
        }
      }
    },
    [explicitSources, stateKey]
  );

  // Sync highlightingActive to map global state
  useEffect(() => {
    if (!map) return;
    // Guard: style must be loaded before setting global state
    if (!map.isStyleLoaded()) return;
    const m = map as MapWithGlobalState;
    if (typeof m.setGlobalStateProperty === "function") {
      m.setGlobalStateProperty("highlightingEnabled", highlightingActive);
    }
  }, [map, highlightingActive]);

  // Apply highlights when criteria change
  useEffect(() => {
    if (!map || !highlightingActive) return;
    // Only apply when version actually changed
    if (prevVersionRef.current === highlightVersion) return;
    prevVersionRef.current = highlightVersion;

    applyHighlights(map);

    // Start debounced sourcedata listener for new tiles
    sourceDataCleanupRef.current?.();
    const handler = () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = setTimeout(() => applyHighlights(map), 100);
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
