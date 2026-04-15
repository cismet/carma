import { useEffect, useRef } from "react";
import type { FilterConfig } from "@carma-mapping/layers";
import {
  buildFilterExpression,
  captureOriginalFilters,
} from "./GenericFilterButtonsFactory";
import {
  deserializeFilterState,
  getAllowedKombis,
  buildPoiFilterExpression,
  findPoiLayerIds,
} from "./poiFilterUtils";

/**
 * Restores persisted filter state to the maplibre map on page reload.
 * Handles both "buttons" (generic) and "poi" filter types.
 */
export function useRestoreLayerFilter(
  filterConfig: FilterConfig | undefined,
  filterState: Record<string, boolean> | undefined,
  maplibreMap: any | null
) {
  const appliedRef = useRef(false);

  useEffect(() => {
    if (!filterConfig || !filterState || !maplibreMap || appliedRef.current)
      return;

    try {
      if (filterConfig.filterType === "poi") {
        const advanced = deserializeFilterState(filterState);
        // If everything is positiv and nothing negativ, no filter needed
        if (advanced.negativ.length === 0) {
          // We need the kombis to check if all are positiv, but we don't
          // have them yet. Query the source to find out.
          const features = maplibreMap.querySourceFeatures("poi-source", {
            sourceLayer: "poi",
          });
          if (features.length === 0) {
            // Tiles not loaded yet, retry on sourcedata
            const onSourceData = () => {
              if (appliedRef.current) return;
              const f = maplibreMap.querySourceFeatures("poi-source", {
                sourceLayer: "poi",
              });
              if (f.length === 0) return;

              applyPoiFilter(maplibreMap, filterState);
              appliedRef.current = true;
              maplibreMap.off("sourcedata", onSourceData);
            };
            maplibreMap.on("sourcedata", onSourceData);
            return () => maplibreMap.off("sourcedata", onSourceData);
          }

          applyPoiFilter(maplibreMap, filterState);
        } else {
          // Has negativ entries, definitely needs filtering
          applyPoiFilter(maplibreMap, filterState);
        }
      } else {
        const originals = captureOriginalFilters(
          filterConfig.layerPattern,
          maplibreMap
        );

        const filterExpression = buildFilterExpression(
          filterConfig,
          filterState
        );

        Object.keys(originals).forEach((layerId) => {
          try {
            const origFilter = originals[layerId];
            let combinedFilter = filterExpression;

            if (origFilter && filterExpression) {
              combinedFilter = ["all", origFilter, filterExpression];
            } else if (origFilter && !filterExpression) {
              combinedFilter = origFilter;
            }

            maplibreMap.setFilter(layerId, combinedFilter);
          } catch (error) {
            console.error(
              `[FilterRestore] Error setting filter on layer ${layerId}:`,
              error
            );
          }
        });
      }

      appliedRef.current = true;
    } catch (error) {
      console.error("[FilterRestore] Error restoring filters:", error);
    }
  }, [filterConfig, filterState, maplibreMap]);
}

function applyPoiFilter(map: any, stored: Record<string, boolean>) {
  const advanced = deserializeFilterState(stored);

  // Get all kombis from loaded features
  const features = map.querySourceFeatures("poi-source", {
    sourceLayer: "poi",
  });
  const kombiSet = new Set<string>();
  for (const f of features) {
    const kombi = f.properties?.kombi;
    if (typeof kombi === "string" && kombi.length > 0) {
      kombiSet.add(kombi);
    }
  }
  const allKombis = Array.from(kombiSet);

  const allowed = getAllowedKombis(allKombis, advanced);
  const isShowingAll = allowed.length === allKombis.length;
  const filterExpr = isShowingAll ? null : buildPoiFilterExpression(allowed);

  const poiLayerIds = findPoiLayerIds(map);
  for (const layerId of poiLayerIds) {
    try {
      map.setFilter(layerId, filterExpr);
    } catch (e) {
      console.error(`[FilterRestore] Error setting filter on ${layerId}:`, e);
    }
  }
}
