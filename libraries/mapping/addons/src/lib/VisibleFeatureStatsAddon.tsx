import { useEffect, useMemo, useState } from "react";
import type { Map as MaplibreMap } from "maplibre-gl";

import { useVisibleMapFeatures } from "@carma-mapping/utils";

import type { AddonComponentProps } from "./registry";

/**
 * Statistics over the features currently visible on the MapLibre map
 * (`featureFlagLibreMap`, alias `ng`).
 *
 * Same mechanism BELIS uses to fill its sidebar: `useVisibleMapFeatures`
 * listens on the map's `idle` event, recomputes the *true* visible rectangle
 * (the canvas is oversized for momentum scrolling, so `map.getBounds()` is
 * larger than what the user sees), runs `queryRenderedFeatures` and dedupes by
 * `source-sourceLayer-id`. `showDebugBounds` draws that rectangle as the yellow
 * border you see in BELIS.
 *
 * Caveat inherited from `queryRenderedFeatures`: this sees *rendered* features
 * only. Anything hidden by a style filter, out of its zoom range, or in a tile
 * that has not loaded yet is not counted. That is the right input for "stats
 * about what is on screen", the wrong one for "stats about all data in the
 * bbox".
 *
 * First iteration: log to the console. No UI.
 *
 * TODO: the border and the queried bbox are not the same rectangle yet.
 * `useVisibleMapFeatures` always queries the full canvas (its `isOversized`
 * branch is BELIS-specific: it centres on the window and subtracts a hardcoded
 * 300px sidebar), while `debugInsetPx` only moves the drawn box — so features
 * behind the top navbar are counted but sit outside the yellow line. Change the
 * original hook to take the visible rectangle as explicit insets/padding
 * instead of deriving it from a canvas-vs-container size guess, then drop the
 * local box here and let the hook draw the same rectangle it queries. Touches
 * BELIS as well, so it needs to be done deliberately.
 */

export type DebugInset = {
  top?: number;
  right?: number;
  bottom?: number;
  left?: number;
};

export type VisibleFeatureStatsConfig = {
  /** Above this count the hook drops the feature list and only reports counts. Default: 2000 */
  maxFeatures?: number;
  /** Debounce after `idle` before querying. Default: 300 */
  debounceMs?: number;
  /** Draw the queried rectangle as a yellow box (BELIS-style debug aid). Default: false */
  showDebugBounds?: boolean;
  /**
   * Pixels the debug box is pulled inside the canvas — a single number for all
   * sides, or per side. On the border the line is half-clipped, and the map
   * container starts behind the top navbar, so the top edge needs a larger
   * inset than the rest to be visible at all. Default: 4 per side.
   */
  debugInsetPx?: number | DebugInset;
  /**
   * Regexes matched against MapLibre style layer ids to restrict the query,
   * e.g. `["alkis.*-fill"]`. Omit to query every layer the style renders.
   */
  layerFilterExpressions?: string[];
  /** Also log the feature array, not just the counts. Default: true */
  logFeatures?: boolean;
};

const DEFAULT_MAX_FEATURES = 2000;
const DEFAULT_DEBOUNCE_MS = 300;
const DEFAULT_DEBUG_INSET_PX = 0;
const DEBUG_SOURCE_ID = "visible-feature-stats-bbox-source";
const DEBUG_LAYER_ID = "visible-feature-stats-bbox-layer";

const resolveInset = (
  inset: number | DebugInset | undefined
): Required<DebugInset> => {
  const fallback = typeof inset === "number" ? inset : DEFAULT_DEBUG_INSET_PX;
  const sides = typeof inset === "object" ? inset : {};
  return {
    top: sides.top ?? fallback,
    right: sides.right ?? fallback,
    bottom: sides.bottom ?? fallback,
    left: sides.left ?? fallback,
  };
};

/**
 * The hook wants the size of the *visible* map area and compares it against
 * `canvas.clientWidth/Height`. Geoportal does not oversize its canvas (that is
 * BELIS' momentum-scrolling trick), so the canvas *is* the visible area — report
 * exactly its integer size. Measuring the container with
 * `getBoundingClientRect()` instead would hand the hook fractional numbers, and
 * a canvas one sub-pixel "larger" flips its `isOversized` branch on, which then
 * shifts the query rectangle by BELIS' hardcoded 300px sidebar.
 */
const useMapCanvasSize = (map: MaplibreMap | null) => {
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    if (!map) return;
    const measure = () => {
      const canvas = map.getCanvas();
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      setSize((prev) =>
        prev.width === width && prev.height === height
          ? prev
          : { width, height }
      );
    };
    measure();
    // the canvas resizes as a consequence of the container resizing, so observe
    // the container and read the canvas afterwards
    const observer = new ResizeObserver(measure);
    observer.observe(map.getContainer());
    map.on("resize", measure);
    return () => {
      observer.disconnect();
      map.off("resize", measure);
    };
  }, [map]);

  return size;
};

/**
 * Own debug box instead of the hook's `showDebugBounds`: the hook draws on the
 * bounds themselves, i.e. flush with the canvas border, where the line is
 * half-clipped and the top edge hides under the map's chrome. Inset by a few
 * pixels it is visible on all four sides. Drawn from `unproject`, so it marks
 * the same rectangle the hook queries as long as the canvas is not oversized —
 * which in geoportal it never is.
 */
const useDebugBoundsBox = (
  map: MaplibreMap | null,
  enabled: boolean,
  inset: Required<DebugInset>
) => {
  const { top, right: insetRight, bottom: insetBottom, left } = inset;

  useEffect(() => {
    if (!map || !enabled) return;

    const toGeoJSON = (): GeoJSON.Feature => {
      const canvas = map.getCanvas();
      const right = canvas.clientWidth - insetRight;
      const bottom = canvas.clientHeight - insetBottom;
      const corners = [
        map.unproject([left, top]),
        map.unproject([right, top]),
        map.unproject([right, bottom]),
        map.unproject([left, bottom]),
      ];
      return {
        type: "Feature",
        properties: {},
        geometry: {
          type: "Polygon",
          coordinates: [
            [...corners, corners[0]].map(({ lng, lat }) => [lng, lat]),
          ],
        },
      };
    };

    const draw = () => {
      const source = map.getSource(DEBUG_SOURCE_ID);
      if (source) {
        (source as maplibregl.GeoJSONSource).setData(toGeoJSON());
        return;
      }
      map.addSource(DEBUG_SOURCE_ID, { type: "geojson", data: toGeoJSON() });
      map.addLayer({
        id: DEBUG_LAYER_ID,
        type: "line",
        source: DEBUG_SOURCE_ID,
        paint: { "line-color": "yellow", "line-width": 4 },
      });
    };

    // follow the camera live, and re-add after a style rebuild dropped us
    const redraw = () => {
      try {
        draw();
      } catch {
        // style is mid-swap; the next event redraws
      }
    };
    redraw();
    map.on("move", redraw);
    map.on("styledata", redraw);

    return () => {
      map.off("move", redraw);
      map.off("styledata", redraw);
      if (map.getLayer(DEBUG_LAYER_ID)) map.removeLayer(DEBUG_LAYER_ID);
      if (map.getSource(DEBUG_SOURCE_ID)) map.removeSource(DEBUG_SOURCE_ID);
    };
  }, [map, enabled, top, insetRight, insetBottom, left]);
};

export const VisibleFeatureStatsAddon = ({
  config,
  libreMap,
}: AddonComponentProps<"visibleFeatureStats">) => {
  const {
    maxFeatures = DEFAULT_MAX_FEATURES,
    debounceMs = DEFAULT_DEBOUNCE_MS,
    showDebugBounds = false,
    debugInsetPx = DEFAULT_DEBUG_INSET_PX,
    layerFilterExpressions,
    logFeatures = true,
  } = config;

  // no memo needed: the drawing hook keys its effect on the four numbers, so a
  // fresh object per render costs nothing
  const inset = resolveInset(debugInsetPx);

  const { width, height } = useMapCanvasSize(libreMap);
  useDebugBoundsBox(libreMap, showDebugBounds, inset);

  // route configs pass a fresh array on every render; key on the content so the
  // hook does not re-resolve its layer ids each time
  const filterKey = (layerFilterExpressions ?? []).join("|");
  const layerFilters = useMemo(
    () => (filterKey ? filterKey.split("|") : undefined),
    [filterKey]
  );

  const { features, totalCount, countsByLayer, isLoading, isOverviewMode } =
    useVisibleMapFeatures({
      // the hook only needs a size once the map exists; 0/0 yields no features
      maplibreMap: width > 0 && height > 0 ? libreMap : null,
      visibleMapWidth: width,
      visibleMapHeight: height,
      maxFeatures,
      debounceMs,
      // the addon draws its own inset box above, the hook's would be clipped
      showDebugBounds: false,
      layerFilterExpressions: layerFilters,
    });

  useEffect(() => {
    // `isLoading` is true from `movestart` until the query settles — skip the
    // stale intermediate render so every log line is a finished viewport
    if (isLoading) return;
    console.info("[VISIBLE_FEATURE_STATS]", {
      totalCount,
      countsByLayer,
      isOverviewMode,
      ...(logFeatures ? { features } : {}),
    });
  }, [
    features,
    totalCount,
    countsByLayer,
    isLoading,
    isOverviewMode,
    logFeatures,
  ]);

  return null;
};
