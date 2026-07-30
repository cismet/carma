import { useEffect, useMemo, useState } from "react";
import type { Map as MaplibreMap } from "maplibre-gl";

import { Control, type Positions } from "@carma-mapping/map-controls-layout";
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
  /** Log every settled viewport to the console. Default: true */
  logToConsole?: boolean;
  /** Render the stats panel on the map. Default: true */
  showPanel?: boolean;
  /** Corner the panel is registered in. Default: "topright" */
  panelPosition?: Positions;
  /** Sort order within that corner. Default: 10 */
  panelOrder?: number;
  /** Layer rows shown before the rest is folded into a "+n" line. Default: 8 */
  panelMaxRows?: number;
};

const DEFAULT_MAX_FEATURES = 2000;
const DEFAULT_DEBOUNCE_MS = 300;
const DEFAULT_DEBUG_INSET_PX = 0;
const DEFAULT_PANEL_POSITION: Positions = "topright";
const DEFAULT_PANEL_ORDER = 10;
const DEFAULT_PANEL_MAX_ROWS = 8;
const DEBUG_SOURCE_ID = "visible-feature-stats-bbox-source";
const DEBUG_LAYER_ID = "visible-feature-stats-bbox-layer";

/** module-level so the identity is stable across renders */
const excludeDebugBox = (feature: { source?: string; layer?: { id: string } }) =>
  feature.source !== DEBUG_SOURCE_ID && feature.layer?.id !== DEBUG_LAYER_ID;

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

/**
 * Presentational half: props in, markup out. No map, no hooks — so it can be
 * rendered from a story or a test without a MapLibre instance, and restyled
 * without touching the query logic above.
 *
 * Deliberately stateless: `Control` re-registers its children on every render
 * (its effect deps are `[children]`, and JSX children are a fresh object each
 * time), so anything held in local state here would be reset on every pan.
 */
export const VisibleFeatureStatsPanel = ({
  totalCount,
  countsByLayer,
  isLoading,
  isOverviewMode,
  maxFeatures,
  maxRows,
}: {
  totalCount: number;
  countsByLayer: Record<string, number>;
  isLoading: boolean;
  isOverviewMode: boolean;
  maxFeatures: number;
  maxRows: number;
}) => {
  const rows = Object.entries(countsByLayer).sort((a, b) => b[1] - a[1]);
  const shown = rows.slice(0, maxRows);
  const hidden = rows.length - shown.length;

  return (
    <div className="pointer-events-auto min-w-52 max-w-72 rounded-md bg-white/90 p-2 text-sm shadow-md">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-semibold">Sichtbare Objekte</span>
        <span className={isLoading ? "text-gray-400" : "font-semibold"}>
          {totalCount}
        </span>
      </div>

      {isOverviewMode && (
        <div className="mt-1 text-xs text-gray-500">
          Übersicht — mehr als {maxFeatures} Objekte, keine Einzelliste
        </div>
      )}

      {rows.length === 0 ? (
        <div className="mt-1 text-xs text-gray-500">
          {isLoading ? "wird ermittelt …" : "keine Objekte im Ausschnitt"}
        </div>
      ) : (
        <ul className="mt-1 flex flex-col gap-0.5">
          {shown.map(([layer, count]) => (
            <li key={layer} className="flex justify-between gap-2 text-xs">
              <span className="truncate" title={layer}>
                {layer}
              </span>
              <span className="tabular-nums text-gray-600">{count}</span>
            </li>
          ))}
          {hidden > 0 && (
            <li className="text-xs text-gray-500">+{hidden} weitere Ebenen</li>
          )}
        </ul>
      )}
    </div>
  );
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
    logToConsole = true,
    showPanel = true,
    panelPosition = DEFAULT_PANEL_POSITION,
    panelOrder = DEFAULT_PANEL_ORDER,
    panelMaxRows = DEFAULT_PANEL_MAX_ROWS,
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
      // the debug box is a rendered feature like any other, so without this it
      // counts itself and shows up as its own row in the panel
      filter: excludeDebugBox,
    });

  useEffect(() => {
    // `isLoading` is true from `movestart` until the query settles — skip the
    // stale intermediate render so every log line is a finished viewport
    if (isLoading || !logToConsole) return;
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
    logToConsole,
  ]);

  if (!showPanel) {
    return null;
  }

  // `Control` renders nothing here — it registers the panel into the surrounding
  // `ControlLayout` (AddonHost sits inside it) and the layout draws it in that
  // corner, sorted by `order`.
  return (
    <Control position={panelPosition} order={panelOrder}>
      <VisibleFeatureStatsPanel
        totalCount={totalCount}
        countsByLayer={countsByLayer}
        isLoading={isLoading}
        isOverviewMode={isOverviewMode}
        maxFeatures={maxFeatures}
        maxRows={panelMaxRows}
      />
    </Control>
  );
};
