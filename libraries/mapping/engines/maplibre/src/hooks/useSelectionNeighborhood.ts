/**
 * useSelectionNeighborhood - Sets feature state on "neighbor" features
 * when a map feature is selected.
 *
 * Generic: the caller provides an `isNeighbor` predicate that receives
 * the selected feature's properties and a candidate feature's properties,
 * returning true if the candidate should be marked.
 *
 * Uses MapLibre's setFeatureState with a configurable state key
 * (default: "selectionInNeighborhood"). The vector tile style can
 * then use feature-state to style neighbors differently.
 *
 * Performance note: we only ever write feature-state for the (few) features
 * that are actually neighbors, and track them so they can be cleared on the
 * next selection. We deliberately do NOT write `false` to the thousands of
 * non-neighbor features: MapLibre records every setFeatureState call as a
 * change and re-evaluates + re-uploads those features at render time even
 * when the value is unchanged. Writing `false` to every loaded feature on
 * every selection is what made this stall for seconds when zoomed out (city
 * level loads the whole dataset). The style reads the state via
 * `["boolean", ["feature-state", <key>], false]`, so an unset feature is
 * already treated as `false` — leaving non-neighbors unset is equivalent.
 */

import { useEffect, useRef, useCallback } from "react";
import type { Map as MaplibreMap, MapSourceDataEvent } from "maplibre-gl";
import { useMapSelection } from "../contexts/MapSelectionContext";
import { buildFeatureStateTarget } from "../utils/featureStateTarget";
import type { FeatureStateRef } from "../utils/featureStateTarget";

export type NeighborPredicate = (
  selectedProps: Record<string, unknown>,
  candidateProps: Record<string, unknown>,
  candidateSourceLayer: string,
  selectedSourceLayer: string
) => boolean;

export interface UseSelectionNeighborhoodOptions {
  map: MaplibreMap | null;
  /** Source config (same shape as useMapHighlighting). */
  sources?: Array<{ source: string; sourceLayers: string[] }>;
  /** Predicate: is the candidate a neighbor of the selected feature? If omitted, hook is inert. */
  isNeighbor?: NeighborPredicate | null;
  /** Feature state key to set. Default: "selectionInNeighborhood" */
  stateKey?: string;
}

export const useSelectionNeighborhood = ({
  map,
  sources,
  isNeighbor,
  stateKey = "selectionInNeighborhood",
}: UseSelectionNeighborhoodOptions): void => {
  const { selectedFeatureId, rawFeature, selectionVersion } = useMapSelection();
  const sourceDataCleanupRef = useRef<(() => void) | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevVersionRef = useRef(-1);
  // Keep isNeighbor in a ref to avoid re-triggering the effect on every render
  const isNeighborRef = useRef(isNeighbor);
  isNeighborRef.current = isNeighbor;
  // Targets we've currently marked as neighbors (key -> target), so we can
  // clear exactly those on the next selection without touching everything else.
  const markedRef = useRef<Map<string, FeatureStateRef>>(new Map());

  const enabled = typeof isNeighbor === "function";

  // Clear only the currently-marked neighbors. Cheap: proportional to the
  // number of neighbors, not to the number of loaded features.
  const clearMarked = useCallback(
    (mapInst: MaplibreMap) => {
      for (const target of markedRef.current.values()) {
        mapInst.setFeatureState(target, { [stateKey]: false });
      }
      markedRef.current.clear();
    },
    [stateKey]
  );

  const applyNeighborhood = useCallback(
    (
      mapInst: MaplibreMap,
      selectedProps: Record<string, unknown>,
      selSourceLayer: string,
      clearPrevious: boolean
    ) => {
      if (!sources) return;
      // On a genuine selection change, clear the previous selection's neighbors
      // first. On a same-selection re-apply (new tiles loaded), keep them and
      // only add newly-visible neighbors below.
      if (clearPrevious) clearMarked(mapInst);

      const marked = markedRef.current;
      for (const { source, sourceLayers } of sources) {
        // Geojson: query once, derive effective layer per-feature from
        // properties._sourceLayer. Vector: iterate per configured sourceLayer.
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
            const neighbor = isNeighborRef.current!(
              selectedProps,
              props,
              effectiveSL,
              selSourceLayer
            );
            // Only touch feature-state for actual neighbors; non-neighbors are
            // left unset (== false in the style). Skip neighbors we've already
            // marked (feature can recur across tiles / sourcedata events).
            if (!neighbor) continue;
            const key = `${source}::${effectiveSL}::${String(f.id)}`;
            if (marked.has(key)) continue;
            const target = buildFeatureStateTarget(mapInst, {
              source,
              sourceLayer: effectiveSL,
              id: f.id,
            });
            mapInst.setFeatureState(target, { [stateKey]: true });
            marked.set(key, target);
          }
        }
      }
    },
    [sources, stateKey, clearMarked]
  );

  useEffect(() => {
    if (!map || !enabled) return;

    // No selection: clear neighborhood state
    if (!selectedFeatureId || !rawFeature) {
      clearMarked(map);
      sourceDataCleanupRef.current?.();
      sourceDataCleanupRef.current = null;
      prevVersionRef.current = selectionVersion;
      return;
    }

    // Only apply when version actually changed
    if (prevVersionRef.current === selectionVersion) return;
    prevVersionRef.current = selectionVersion;

    const selectedProps = (rawFeature.properties ?? {}) as Record<
      string,
      unknown
    >;
    const selSL = selectedFeatureId.sourceLayer ?? "";
    applyNeighborhood(map, selectedProps, selSL, true);

    // Re-apply on newly loaded tiles. Debounced (coalesce tile bursts) and
    // filtered to our own sources so unrelated basemap/overlay tile loads
    // don't trigger a full re-scan.
    sourceDataCleanupRef.current?.();
    const ourSources = new Set((sources ?? []).map((s) => s.source));
    const handler = (e: MapSourceDataEvent) => {
      if (e.sourceId && !ourSources.has(e.sourceId)) return;
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = setTimeout(() => {
        applyNeighborhood(map, selectedProps, selSL, false);
      }, 100);
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
  }, [
    map,
    enabled,
    selectedFeatureId,
    rawFeature,
    selectionVersion,
    applyNeighborhood,
    clearMarked,
    sources,
  ]);
};
