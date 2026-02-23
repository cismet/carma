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
import type { Map as MaplibreMap, MapMouseEvent } from "maplibre-gl";
import { useMapHighlight } from "../contexts/MapHighlightContext";
import type { HighlightCriteria } from "../contexts/MapHighlightContext";

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
}

/** Discover all vector sources and their source layers from the map style. */
function discoverSources(
  map: MaplibreMap
): Array<{ source: string; sourceLayers: string[] }> {
  const style = map.getStyle();
  if (!style?.layers) return [];

  // Collect source layers per source from layers
  const sourceMap = new Map<string, Set<string>>();
  for (const layer of style.layers) {
    if (
      "source" in layer &&
      layer.source &&
      "source-layer" in layer &&
      layer["source-layer"]
    ) {
      const src = layer.source as string;
      const sl = layer["source-layer"] as string;
      if (!sourceMap.has(src)) sourceMap.set(src, new Set());
      sourceMap.get(src)!.add(sl);
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

  // Apply highlight feature state to all currently loaded features
  const applyHighlights = useCallback(
    (mapInst: MaplibreMap) => {
      // Guard: style must be loaded before we can query sources/features
      if (!mapInst.isStyleLoaded()) return;

      const srcs = explicitSources ?? discoverSources(mapInst);
      const queryIdLookup = buildQueryIdLookup(criteria);

      for (const { source, sourceLayers } of srcs) {
        for (const sourceLayer of sourceLayers) {
          const features = mapInst.querySourceFeatures(source, {
            sourceLayer,
          });
          for (const f of features) {
            if (f.id == null) continue;
            const props = (f.properties ?? {}) as Record<string, unknown>;
            const shouldHighlight = matchesCriteria(
              criteria,
              queryIdLookup,
              props,
              f.id,
              sourceLayer,
              source
            );
            mapInst.setFeatureState(
              { source, sourceLayer, id: f.id },
              { [stateKey]: shouldHighlight }
            );
          }
        }
      }
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
        for (const sourceLayer of sourceLayers) {
          const features = mapInst.querySourceFeatures(source, {
            sourceLayer,
          });
          for (const f of features) {
            if (f.id == null) continue;
            mapInst.setFeatureState(
              { source, sourceLayer, id: f.id },
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
      const feature = hits.find(
        (f) =>
          f.id != null &&
          f.source &&
          f.sourceLayer &&
          !f.layer.id.includes("selection") &&
          !f.layer.id.includes("background")
      );
      if (!feature) return;

      // Auto-enable highlighting when toggling via modifier+click
      if (!highlightingActive) {
        setHighlightingActive(true);
      }

      toggleFeatureHighlight({
        source: feature.source,
        sourceLayer: feature.sourceLayer!,
        id: feature.id!,
      });
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
  ]);
};
