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
 */

import { useEffect, useRef, useCallback } from "react";
import type { Map as MaplibreMap } from "maplibre-gl";
import { useMapSelection } from "../contexts/MapSelectionContext";

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
  const prevVersionRef = useRef(-1);
  // Keep isNeighbor in a ref to avoid re-triggering the effect on every render
  const isNeighborRef = useRef(isNeighbor);
  isNeighborRef.current = isNeighbor;

  const enabled = typeof isNeighbor === "function";

  const applyNeighborhood = useCallback(
    (
      mapInst: MaplibreMap,
      selectedProps: Record<string, unknown>,
      selSourceLayer: string
    ) => {
      if (!sources) return;
      for (const { source, sourceLayers } of sources) {
        for (const sourceLayer of sourceLayers) {
          const features = mapInst.querySourceFeatures(source, {
            sourceLayer,
          });
          for (const f of features) {
            if (f.id == null) continue;
            const props = (f.properties ?? {}) as Record<string, unknown>;
            const neighbor = isNeighborRef.current!(
              selectedProps,
              props,
              sourceLayer,
              selSourceLayer
            );
            mapInst.setFeatureState(
              { source, sourceLayer, id: f.id },
              { [stateKey]: neighbor }
            );
          }
        }
      }
    },
    [sources, stateKey]
  );

  const clearAllState = useCallback(
    (mapInst: MaplibreMap) => {
      if (!sources) return;
      for (const { source, sourceLayers } of sources) {
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
    [sources, stateKey]
  );

  useEffect(() => {
    if (!map || !enabled) return;

    // No selection: clear neighborhood state
    if (!selectedFeatureId || !rawFeature) {
      clearAllState(map);
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
    applyNeighborhood(map, selectedProps, selSL);

    // Re-apply on new tiles
    sourceDataCleanupRef.current?.();
    const handler = () => applyNeighborhood(map, selectedProps, selSL);
    map.on("sourcedata", handler);
    sourceDataCleanupRef.current = () => map.off("sourcedata", handler);

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
    clearAllState,
  ]);
};
