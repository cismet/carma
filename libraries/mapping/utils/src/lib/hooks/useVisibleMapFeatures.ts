import { useEffect, useState, useCallback, useRef } from "react";
import type { Map as MaplibreMap, MapGeoJSONFeature } from "maplibre-gl";

const DEFAULT_MAX_FEATURES = 2000;
const DEFAULT_DEBOUNCE_MS = 300;
const DEFAULT_MIN_ZOOM_FOR_FULL_FEATURES = 17;

export interface UseVisibleMapFeaturesOptions {
  maplibreMap: MaplibreMap | null;
  visibleMapWidth: number;
  visibleMapHeight: number;
  showDebugBounds?: boolean;
  maxFeatures?: number;
  debounceMs?: number;
  /** Minimum zoom level to return full features. Below this, only counts are returned. */
  minZoomForFullFeatures?: number;
  /** Regex patterns matched against MapLibre style layer IDs to restrict queryRenderedFeatures.
   *  Resolved once when the style loads, then cached. e.g. ["Leuchten.*-base", "Leuchten.*-icon"] */
  layerFilterExpressions?: string[];
  /** Optional additional filter predicate applied after the engine-level layer filtering. */
  filter?: (feature: MapGeoJSONFeature) => boolean;
  /** When true, only return features where getFeatureState().highlighted === true */
  highlightedOnly?: boolean;
  /** External trigger to force re-query (e.g. highlightVersion from context) */
  refreshTrigger?: number;
}

export interface VisibleFeature extends MapGeoJSONFeature {
  original: MapGeoJSONFeature;
}

export interface UseVisibleMapFeaturesResult {
  features: VisibleFeature[];
  totalCount: number;
  countsByLayer: Record<string, number>;
  isLoading: boolean;
  /** True when in overview mode (zoom below threshold or hit max features) */
  isOverviewMode: boolean;
}

interface Bounds {
  getWest: () => number;
  getEast: () => number;
  getNorth: () => number;
  getSouth: () => number;
}

/**
 * Check if any part of a feature geometry is within the given bounds
 */
const isFeatureInGeoBounds = (
  feature: MapGeoJSONFeature,
  bounds: Bounds
): boolean => {
  if (!feature.geometry) return false;

  const west = bounds.getWest();
  const south = bounds.getSouth();
  const east = bounds.getEast();
  const north = bounds.getNorth();

  const isPointInBounds = (coord: number[]): boolean => {
    const [lng, lat] = coord;
    return lng >= west && lng <= east && lat >= south && lat <= north;
  };

  const geom = feature.geometry;
  if (geom.type === "Point") {
    return isPointInBounds(geom.coordinates as number[]);
  } else if (geom.type === "LineString" || geom.type === "MultiPoint") {
    return (geom.coordinates as number[][]).some(isPointInBounds);
  } else if (geom.type === "Polygon" || geom.type === "MultiLineString") {
    return (geom.coordinates as number[][][]).some((ring) =>
      ring.some(isPointInBounds)
    );
  } else if (geom.type === "MultiPolygon") {
    return (geom.coordinates as number[][][][]).some((poly) =>
      poly.some((ring) => ring.some(isPointInBounds))
    );
  }
  return false;
};

/**
 * Hook to query and return visible map features within the actual visible viewport.
 *
 * Accounts for oversized canvas (e.g., for momentum scrolling) by calculating
 * the true visible bounds based on container dimensions.
 *
 * Features are automatically filtered by any MapLibre layer filters applied.
 */
export const useVisibleMapFeatures = ({
  maplibreMap,
  visibleMapWidth,
  visibleMapHeight,
  showDebugBounds = false,
  maxFeatures = DEFAULT_MAX_FEATURES,
  debounceMs = DEFAULT_DEBOUNCE_MS,
  minZoomForFullFeatures = DEFAULT_MIN_ZOOM_FOR_FULL_FEATURES,
  layerFilterExpressions,
  filter,
  highlightedOnly = false,
  refreshTrigger,
}: UseVisibleMapFeaturesOptions): UseVisibleMapFeaturesResult => {
  const [features, setFeatures] = useState<VisibleFeature[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [countsByLayer, setCountsByLayer] = useState<Record<string, number>>(
    {}
  );
  const [isLoading, setIsLoading] = useState(false);
  const [isOverviewMode, setIsOverviewMode] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Use ref for filter to avoid re-creating updateFeatures when the callback reference changes
  const filterRef = useRef(filter);
  filterRef.current = filter;
  const highlightedOnlyRef = useRef(highlightedOnly);
  highlightedOnlyRef.current = highlightedOnly;
  // Cached resolved layer IDs from layerFilterExpressions
  const resolvedLayerIdsRef = useRef<string[] | undefined>(undefined);
  const layerFilterExpressionsRef = useRef(layerFilterExpressions);
  layerFilterExpressionsRef.current = layerFilterExpressions;

  // Resolve layerFilterExpressions to MapLibre layer IDs once on style load.
  // In imperative mode, actual layer IDs are namespaced (e.g. "slug::leitungen-base")
  // but the caller writes patterns against merged-mode IDs (e.g. "Leuchten.*-base").
  // We read the bidirectional mapping from the map instance to resolve transparently.
  useEffect(() => {
    if (!maplibreMap) return;
    const resolve = () => {
      const exprs = layerFilterExpressionsRef.current;
      if (!exprs || exprs.length === 0) {
        resolvedLayerIdsRef.current = undefined;
        return;
      }
      const style = maplibreMap.getStyle();
      if (!style?.layers) return;
      const regexes = exprs.map((e) => new RegExp(e));

      // Direct match against actual map layer IDs (works in merged mode)
      const ids = style.layers
        .filter((l) => regexes.some((r) => r.test(l.id)))
        .map((l) => l.id);

      // Also try matching against merged-mode-equivalent keys (imperative mode)
      const layerIdMap = (maplibreMap as unknown as Record<string, unknown>)
        .__carmaLayerIdMap as
        | { mergedToNamespaced: Map<string, string> }
        | undefined;
      if (layerIdMap?.mergedToNamespaced) {
        for (const [mergedKey, namespacedId] of layerIdMap.mergedToNamespaced) {
          if (
            regexes.some((r) => r.test(mergedKey)) &&
            !ids.includes(namespacedId)
          ) {
            ids.push(namespacedId);
          }
        }
      }

      resolvedLayerIdsRef.current = ids.length > 0 ? ids : undefined;
    };
    resolve();
    maplibreMap.on("styledata", resolve);
    return () => {
      maplibreMap.off("styledata", resolve);
    };
  }, [maplibreMap]);

  const updateFeatures = useCallback(() => {
    if (!maplibreMap) return;

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    setIsLoading(true);

    debounceRef.current = setTimeout(() => {
      try {
        // Get the full map bounds (for the oversized canvas)
        const fullBounds = maplibreMap.getBounds();

        // Get canvas size vs visible container size
        const canvas = maplibreMap.getCanvas();
        const canvasWidth = canvas.clientWidth;
        const canvasHeight = canvas.clientHeight;

        // Calculate the ACTUAL visible bounds
        const fullWest = fullBounds.getWest();
        const fullEast = fullBounds.getEast();
        const fullNorth = fullBounds.getNorth();
        const fullSouth = fullBounds.getSouth();

        const lngRange = fullEast - fullWest;
        const latRange = fullNorth - fullSouth;

        // Calculate the visible bounds within the oversized canvas.
        // The canvas is enlarged for momentum scrolling but is sized relative to
        // the FULL browser window, not just the visible map container.
        //
        // Horizontal: The sidebar (300px) takes space but the canvas doesn't know
        // about it - it's centered on the full window. So we need to account for
        // the sidebar when calculating where the visible map area sits within the canvas.
        // Formula: (canvasWidth - fullWindowWidth) / 2, where fullWindowWidth includes sidebar.
        //
        // Vertical: The canvas is simply centered on the visible height.
        // Formula: (canvasHeight - visibleMapHeight) / 2
        const sidebarWidth = 300;
        const fullWindowWidth = visibleMapWidth + sidebarWidth;
        const horizontalOffset = (canvasWidth - fullWindowWidth) / 2;
        const verticalOffset = (canvasHeight - visibleMapHeight) / 2;

        // Visible bounds with offset
        const visibleWest =
          fullWest + lngRange * (horizontalOffset / canvasWidth);
        const visibleEast =
          fullWest +
          lngRange * ((horizontalOffset + visibleMapWidth) / canvasWidth);
        const visibleNorth =
          fullNorth - latRange * (verticalOffset / canvasHeight);
        const visibleSouth =
          fullNorth -
          latRange * ((verticalOffset + visibleMapHeight) / canvasHeight);

        // Draw debug bbox using the VISIBLE bounds (if enabled)
        const debugSourceId = "debug-bbox-source";
        const debugLayerId = "debug-bbox-layer";

        if (showDebugBounds) {
          const bboxGeoJSON: GeoJSON.Feature = {
            type: "Feature",
            properties: {},
            geometry: {
              type: "Polygon",
              coordinates: [
                [
                  [visibleWest, visibleNorth],
                  [visibleEast, visibleNorth],
                  [visibleEast, visibleSouth],
                  [visibleWest, visibleSouth],
                  [visibleWest, visibleNorth],
                ],
              ],
            },
          };

          if (maplibreMap.getSource(debugSourceId)) {
            (
              maplibreMap.getSource(debugSourceId) as maplibregl.GeoJSONSource
            ).setData(bboxGeoJSON);
          } else {
            maplibreMap.addSource(debugSourceId, {
              type: "geojson",
              data: bboxGeoJSON,
            });
            maplibreMap.addLayer({
              id: debugLayerId,
              type: "line",
              source: debugSourceId,
              paint: {
                "line-color": "yellow",
                "line-width": 4,
              },
            });
          }
        } else {
          // Remove debug layer if it exists
          if (maplibreMap.getLayer(debugLayerId)) {
            maplibreMap.removeLayer(debugLayerId);
          }
          if (maplibreMap.getSource(debugSourceId)) {
            maplibreMap.removeSource(debugSourceId);
          }
        }

        // Create adjusted bounds object for filtering
        const visibleBounds: Bounds = {
          getWest: () => visibleWest,
          getEast: () => visibleEast,
          getNorth: () => visibleNorth,
          getSouth: () => visibleSouth,
        };

        // Check if we're in overview mode due to zoom level
        // +1 offset to align with RoutedMap/Leaflet zoom convention (temporary until native MapLibre)
        const currentZoom = maplibreMap.getZoom() + 1;
        // Skip zoom restriction when highlighting is active (show all highlighted features)
        const zoomBelowThreshold =
          !highlightedOnlyRef.current && currentZoom < minZoomForFullFeatures;

        // Use cached layer IDs from layerFilterExpressions (resolved on style load)
        const queryOptions = resolvedLayerIdsRef.current
          ? { layers: resolvedLayerIdsRef.current }
          : undefined;
        const renderedFeatures =
          maplibreMap.queryRenderedFeatures(queryOptions);

        const seen = new Set<string>();
        const uniqueFeatures: VisibleFeature[] = [];
        let count = 0;
        const layerCounts: Record<string, number> = {};

        for (const f of renderedFeatures) {
          if (filterRef.current && !filterRef.current(f)) continue;
          const key = `${f.source}-${f.sourceLayer}-${f.id}`;
          if (!seen.has(key) && isFeatureInGeoBounds(f, visibleBounds)) {
            seen.add(key);
            count++;
            // Track count per layer
            const layerKey = f.sourceLayer || f.source || "other";
            layerCounts[layerKey] = (layerCounts[layerKey] || 0) + 1;
            // Only add to array if not in overview mode and under maxFeatures
            if (!zoomBelowThreshold && uniqueFeatures.length < maxFeatures) {
              // Store the original maplibre feature reference
              const featureWithOriginal = f as VisibleFeature;
              featureWithOriginal.original = f;
              uniqueFeatures.push(featureWithOriginal);
            }
          }
        }

        // Filter to only highlighted features if requested
        let finalFeatures = uniqueFeatures;
        if (highlightedOnlyRef.current && maplibreMap) {
          finalFeatures = uniqueFeatures.filter((f) => {
            if (f.id == null || !f.source) return false;
            const state = maplibreMap.getFeatureState({
              source: f.source,
              sourceLayer: f.sourceLayer,
              id: f.id,
            });
            return state?.highlighted === true;
          });
        }

        // Recompute counts when filtering to highlighted-only
        let finalCount = count;
        let finalLayerCounts = layerCounts;
        if (highlightedOnlyRef.current && finalFeatures !== uniqueFeatures) {
          finalLayerCounts = {};
          for (const f of finalFeatures) {
            const layerKey = f.sourceLayer || f.source || "other";
            finalLayerCounts[layerKey] =
              (finalLayerCounts[layerKey] || 0) + 1;
          }
          finalCount = finalFeatures.length;
        }

        // Overview mode: zoom below threshold OR hit max features
        const inOverviewMode = zoomBelowThreshold || count > maxFeatures;

        setFeatures(inOverviewMode ? [] : finalFeatures);
        setTotalCount(finalCount);
        setCountsByLayer(finalLayerCounts);
        setIsOverviewMode(inOverviewMode);
      } catch (e) {
        console.warn("Error querying features:", e);
      } finally {
        setIsLoading(false);
      }
    }, debounceMs);
  }, [
    maplibreMap,
    visibleMapWidth,
    visibleMapHeight,
    showDebugBounds,
    maxFeatures,
    debounceMs,
    minZoomForFullFeatures,
    refreshTrigger,
  ]);

  useEffect(() => {
    if (!maplibreMap) return;

    updateFeatures();

    // Only use idle: fires after move/zoom AND after all tiles are rendered.
    // moveend/zoomend fire before tile processing is complete, causing
    // "feature index out of bounds" errors in queryRenderedFeatures.
    maplibreMap.on("idle", updateFeatures);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
      maplibreMap.off("idle", updateFeatures);
    };
  }, [maplibreMap, updateFeatures]);

  return { features, totalCount, countsByLayer, isLoading, isOverviewMode };
};
