import { useEffect, useRef } from "react";
import type { Map as MaplibreMap } from "maplibre-gl";

import { useMapSelection } from "@carma-mapping/contexts";
import {
  applySelectionForwarding,
  buildFeatureStateTarget,
  type FeatureIdentifier,
} from "@carma-mapping/engines/maplibre";

const featureStateKey = (target: {
  source: string;
  sourceLayer?: string;
  id?: string | number;
}) => `${target.source}::${target.sourceLayer ?? ""}::${String(target.id)}`;

/**
 * Applies `selected` to the companion source-layers of the selected feature.
 *
 * Styles that draw one object from several source-layers (B-Plan: polygon +
 * label; ALKIS: parcel + label + leader line + arrow tip) list them in
 * `carmaConf.selectionForwardingTo` and read `selected` from each. Under
 * `disableInternalSelection` LibreMap re-applies it to the primary layer only,
 * so the rest is written here.
 *
 * Must be called from a component that renders `LibreMap` as a descendant:
 * child effects flush first, so this runs after LibreMap's clear-and-reapply.
 */
export const useSelectionForwarding = (
  libreMap: MaplibreMap | null | undefined
) => {
  const { selectedFeatureId, rawFeature, selectionVersion } = useMapSelection();

  // what the previous selection wrote; LibreMap does not know about these rows,
  // so nothing else can clear them
  const forwardedRef = useRef<FeatureIdentifier[]>([]);

  useEffect(() => {
    if (!libreMap) return;

    const previous = forwardedRef.current;
    const next =
      selectedFeatureId?.id != null
        ? applySelectionForwarding(
            libreMap,
            selectedFeatureId as FeatureIdentifier,
            true,
            rawFeature ?? undefined
          )
        : [];

    // Clear the leftovers of the previous selection, minus the rows the current
    // one needs. Both exceptions are real: re-selecting the same object repeats
    // its companions, and clicking the label of an object whose polygon was
    // selected makes a former companion the new primary row — clearing it would
    // undo the selection LibreMap just applied.
    const keep = new Set(next.map(featureStateKey));
    keep.add(
      featureStateKey(selectedFeatureId ?? { source: "", id: undefined })
    );
    for (const target of previous) {
      if (keep.has(featureStateKey(target))) continue;
      try {
        libreMap.setFeatureState(buildFeatureStateTarget(libreMap, target), {
          selected: false,
        });
      } catch {
        // source or layer gone with a style change
      }
    }

    forwardedRef.current = next;
  }, [libreMap, selectionVersion, selectedFeatureId, rawFeature]);
};
