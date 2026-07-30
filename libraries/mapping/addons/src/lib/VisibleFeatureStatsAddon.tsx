import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { Map as MaplibreMap, MapGeoJSONFeature } from "maplibre-gl";
import type { Store } from "redux";

import type { LayerStackEntry } from "@carma-mapping/layers";
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

/**
 * The nested breakdown is built from the feature list, and the hook empties that
 * list once the count passes `maxFeatures` (its "overview mode", which exists
 * because BELIS renders one sidebar row per feature). This panel only counts, so
 * it opts out: no cap, no overview mode, always a full breakdown.
 */
const NO_FEATURE_CAP = Number.MAX_SAFE_INTEGER;
const DEFAULT_DEBOUNCE_MS = 300;
const DEFAULT_DEBUG_INSET_PX = 0;
const DEFAULT_PANEL_POSITION: Positions = "topright";
const DEFAULT_PANEL_ORDER = 10;
const DEFAULT_PANEL_MAX_ROWS = 8;
const DEBUG_SOURCE_ID = "visible-feature-stats-bbox-source";
const DEBUG_LAYER_ID = "visible-feature-stats-bbox-layer";

/** module-level so the identity is stable across renders */
const excludeDebugBox = (feature: {
  source?: string;
  layer?: { id: string };
}) =>
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

export type LayerStatsRow = { key: string; label: string; count: number };
export type LayerStatsGroup = LayerStatsRow & { children: LayerStatsRow[] };

/** "layer-poi-3::poi" -> "poi"; ids without a namespace are returned as-is */
const stripNamespace = (id: string | undefined) => {
  if (!id) return undefined;
  const separator = id.indexOf("::");
  return separator === -1 ? id : id.slice(separator + 2);
};

/** "trinkwasserbrunnen" -> "Trinkwasserbrunnen", "poi" -> "POI" */
const humanizeKey = (key: string) => {
  const cleaned = stripNamespace(key)?.replace(/[-_]+/g, " ").trim() ?? "";
  if (!cleaned) return key;
  if (cleaned.length <= 4) return cleaned.toUpperCase();
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
};

/**
 * Which catalog layer drew this feature. `styleComposer` stamps the layer stack
 * id onto every style layer it namespaces (`metadata["layer-id"]`), so that is
 * the reliable key; the `"<layerId>::<styleLayerId>"` prefix is the fallback for
 * anything added outside the composer.
 */
const catalogLayerIdOf = (feature: MapGeoJSONFeature): string | undefined => {
  const fromMetadata = feature.layer?.metadata as
    | Record<string, unknown>
    | undefined;
  const stamped = fromMetadata?.["layer-id"];
  if (typeof stamped === "string" && stamped) return stamped;
  const layerId = feature.layer?.id;
  return layerId?.includes("::") ? layerId.split("::")[0] : undefined;
};

/**
 * Two POI layers from the same vector source collapse into a single `poi` row
 * in the hook's `countsByLayer`, which is what makes it useless here. So group
 * by the data source (`sourceLayer`) and split each group by the catalog layer
 * that actually drew the feature — the label comes from the layer stack, so it
 * reads "Trinkwasserbrunnen", not "layer-poi-3".
 *
 * Only possible from the feature list, which the hook caps at `maxFeatures` and
 * drops entirely in overview mode; `flatGroups` below covers that case.
 */
const buildGroups = (
  features: MapGeoJSONFeature[],
  titles: Map<string, string>
): LayerStatsGroup[] => {
  const groups = new Map<
    string,
    { count: number; children: Map<string, number> }
  >();

  for (const feature of features) {
    const groupKey =
      feature.sourceLayer || stripNamespace(feature.source) || "other";
    let group = groups.get(groupKey);
    if (!group) {
      group = { count: 0, children: new Map() };
      groups.set(groupKey, group);
    }
    group.count++;

    const childKey = catalogLayerIdOf(feature);
    if (childKey) {
      group.children.set(childKey, (group.children.get(childKey) ?? 0) + 1);
    }
  }

  const toRows = (counts: Map<string, number>): LayerStatsRow[] =>
    [...counts.entries()]
      .map(([key, count]) => ({
        key,
        label: titles.get(key) ?? humanizeKey(key),
        count,
      }))
      .sort((a, b) => b.count - a.count);

  return [...groups.entries()]
    .map(([key, { count, children }]) => ({
      key,
      label: humanizeKey(key),
      count,
      // a single child adds a row that just repeats the group total
      children: children.size > 1 ? toRows(children) : [],
    }))
    .sort((a, b) => b.count - a.count);
};

type LayerTitleState = { mapping?: { layers?: LayerStackEntry[] } };

const collectTitles = (
  entries: LayerStackEntry[] | undefined,
  into: Map<string, string>
) => {
  for (const entry of entries ?? []) {
    if (entry.id && entry.title) into.set(entry.id, entry.title);
    // groups carry their members in `layers`
    const nested = (entry as { layers?: LayerStackEntry[] }).layers;
    if (nested) collectTitles(nested, into);
  }
  return into;
};

/**
 * Layer id -> readable title, straight from the host app's layer stack. Read
 * through the store prop rather than `useSelector`, since libraries must not
 * depend on react-redux; the snapshot is the `layers` array itself, so an
 * unrelated action does not re-render the panel.
 */
const useLayerTitles = (store: Store): Map<string, string> => {
  const layerStack = useSyncExternalStore(store.subscribe, () => {
    return (store.getState() as LayerTitleState).mapping?.layers;
  });
  return useMemo(() => collectTitles(layerStack, new Map()), [layerStack]);
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
  groups,
  isLoading,
  maxRows,
}: {
  totalCount: number;
  groups: LayerStatsGroup[];
  isLoading: boolean;
  maxRows: number;
}) => {
  const shown = groups.slice(0, maxRows);
  const hidden = groups.length - shown.length;

  return (
    <div className="pointer-events-auto min-w-56 max-w-80 rounded-md bg-white/90 p-2 text-sm shadow-md">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-semibold">Sichtbare Objekte</span>
        <span className={isLoading ? "text-gray-400" : "font-semibold"}>
          {totalCount}
        </span>
      </div>

      {groups.length === 0 ? (
        <div className="mt-1 text-xs text-gray-500">
          {isLoading ? "wird ermittelt …" : "keine Objekte im Ausschnitt"}
        </div>
      ) : (
        <ul className="mt-1 flex flex-col gap-1">
          {shown.map((group) => (
            <li key={group.key}>
              <div className="flex justify-between gap-2 text-xs font-medium">
                <span className="truncate" title={group.key}>
                  {group.label}
                </span>
                <span className="tabular-nums">{group.count}</span>
              </div>
              {group.children.length > 0 && (
                <ul className="mt-0.5 flex flex-col gap-0.5 border-l border-gray-200 pl-2">
                  {group.children.slice(0, maxRows).map((child) => (
                    <li
                      key={child.key}
                      className="flex justify-between gap-2 text-xs text-gray-600"
                    >
                      <span className="truncate" title={child.key}>
                        {child.label}
                      </span>
                      <span className="tabular-nums">{child.count}</span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
          {hidden > 0 && (
            <li className="text-xs text-gray-500">+{hidden} weitere Quellen</li>
          )}
        </ul>
      )}
    </div>
  );
};

export const VisibleFeatureStatsAddon = ({
  config,
  libreMap,
  store,
}: AddonComponentProps<"visibleFeatureStats">) => {
  const {
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

  const { features, totalCount, isLoading } = useVisibleMapFeatures({
    // the hook only needs a size once the map exists; 0/0 yields no features
    maplibreMap: width > 0 && height > 0 ? libreMap : null,
    visibleMapWidth: width,
    visibleMapHeight: height,
    maxFeatures: NO_FEATURE_CAP,
    debounceMs,
    // the addon draws its own inset box above, the hook's would be clipped
    showDebugBounds: false,
    layerFilterExpressions: layerFilters,
    // the debug box is a rendered feature like any other, so without this it
    // counts itself and shows up as its own row in the panel
    filter: excludeDebugBox,
  });

  const titles = useLayerTitles(store);
  const groups = useMemo(
    () => buildGroups(features, titles),
    [features, titles]
  );

  useEffect(() => {
    // `isLoading` is true from `movestart` until the query settles — skip the
    // stale intermediate render so every log line is a finished viewport
    if (isLoading || !logToConsole) return;
    console.info("[VISIBLE_FEATURE_STATS]", {
      totalCount,
      groups,
      ...(logFeatures ? { features } : {}),
    });
  }, [features, totalCount, groups, isLoading, logFeatures, logToConsole]);

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
        groups={groups}
        isLoading={isLoading}
        maxRows={panelMaxRows}
      />
    </Control>
  );
};
