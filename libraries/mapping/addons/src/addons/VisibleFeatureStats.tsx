import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { Map as MaplibreMap, MapGeoJSONFeature } from "maplibre-gl";
import type { Store } from "redux";

import { useMapHighlight } from "@carma-mapping/contexts";
import type { LayerStackEntry } from "@carma-mapping/layers";
import { Control, type Positions } from "@carma-mapping/map-controls-layout";
import {
  buildFeatureStateTarget,
  useVisibleMapFeatures,
} from "@carma-mapping/utils";

import type { AddonComponentProps } from "../lib/registry";

/**
 * Statistics over the features currently visible on the MapLibre map
 * (`featureFlagLibreMap`, alias `ng`).
 *
 * Same mechanism BELIS uses to fill its sidebar: `useVisibleMapFeatures`
 * listens on the map's `idle` event, recomputes the *true* visible rectangle
 * (the canvas is oversized for momentum scrolling, so `map.getBounds()` is
 * larger than what the user sees), runs `queryRenderedFeatures` and dedupes by
 * `source-sourceLayer-id`. `showDebugBounds` draws that rectangle as the yellow
 * Caveat inherited from `queryRenderedFeatures`: this sees *rendered* features
 * only. Anything hidden by a style filter, out of its zoom range, or in a tile
 * that has not loaded yet is not counted. That is the right input for "stats
 * about what is on screen", the wrong one for "stats about all data in the
 * bbox".
 *
 * WITH `VectorHighlight` ON THE SAME ROUTE (`filterByHighlight`, on by
 * default): while its highlight mode runs, the panel narrows to the highlighted
 * features and its heading says so. The two addons do not talk to each other —
 * both read `MapHighlightContext`, and the highlight itself is read off the map
 * as the `highlighted` feature-state `useMapHighlighting` writes. That state is
 * where *every* highlight path lands (modifier+click, lasso, `highlightByIds`,
 * `highlightByProperty`), which the context's `toggledFeatures` map is not, and
 * it is a flag on the rendered feature, so grouping keeps working on the same
 * full `MapGeoJSONFeature` objects: same categories, same layer rows, same
 * colours, only fewer of them.
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
  /**
   * Draw the queried rectangle as a yellow box.
   * Default: false. Overridden by `?showBr=true|false` in the URL.
   */
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
  /**
   * While a highlight mode is running, count only the highlighted features.
   * Off, the panel always counts everything on screen. Default: true.
   */
  filterByHighlight?: boolean;
  /**
   * Feature-state key the highlight is read from. Must match the `stateKey` of
   * whoever writes it — `VectorHighlight`'s config, and BELIS' own style, both
   * default to the same. Default: "highlighted"
   */
  highlightStateKey?: string;
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
/** `useMapHighlighting`'s own default, and `VectorHighlight`'s */
const DEFAULT_HIGHLIGHT_STATE_KEY = "highlighted";
const DEBUG_SOURCE_ID = "visible-feature-stats-bbox-source";
const DEBUG_LAYER_ID = "visible-feature-stats-bbox-layer";

/**
 * The geoportal body stack (`apps/geoportal/src/app/index.css`). Set explicitly
 * instead of relying on inheritance so the panel reads the same in a story, in
 * BELIS, or in any host that ships a different body font.
 */
const FONT_STACK =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Cantarell", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif';

/**
 * Categorical slots, validated against a white surface: every adjacent pair
 * keeps ΔE ≥ 8 (OKLab ×100) under protanopia/deuteranopia/tritanopia, so
 * neighbouring rows and neighbouring bar segments stay tellable apart. Three of
 * them sit below 3:1 contrast on white, which is why every swatch is paired
 * with a written label and a number — colour never carries a value alone.
 *
 * Assigned per group key in first-seen order (`useStableSeriesColors`), never
 * by rank: rows are sorted by count, and panning reorders them, so a rank-based
 * palette would repaint a group the reader has already learned.
 */
const SERIES_COLORS = [
  "#2a78d6", // blue
  "#eb6834", // orange
  "#1baf7a", // aqua
  "#eda100", // yellow
  "#e87ba4", // magenta
  "#008300", // green
  "#4a3aa7", // violet
  "#e34948", // red
];

/** folded-away sources, and any group past the eighth slot */
const REST_COLOR = "#c3c2b7";

const INK = {
  /** heading — the deepest step of the same blue ramp slot 1 comes from */
  title: "#0d366b",
  primary: "#0b0b0b",
  secondary: "#52514e",
  /** empty proportion bar */
  track: "#e1e0d9",
};

const formatCount = new Intl.NumberFormat("de-DE").format;

/** module-level so the identity is stable across renders */
const excludeDebugBox = (feature: {
  source?: string;
  layer?: { id: string };
}) =>
  feature.source !== DEBUG_SOURCE_ID && feature.layer?.id !== DEBUG_LAYER_ID;

const SHOW_BORDER_PARAM = "showBr";

const isLocalhost = () =>
  typeof window !== "undefined" && window.location.hostname === "localhost";

const readShowBorderParam = (): boolean | undefined => {
  if (typeof window === "undefined") return undefined;
  const hashQuery = window.location.hash.split("?")[1] || "";
  const param = new URLSearchParams(hashQuery || window.location.search).get(
    SHOW_BORDER_PARAM
  );
  return param === null ? undefined : param === "true";
};

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

/** how a group is marked in the legend — mirrors the geometry it is drawn as */
export type MarkShape = "area" | "line" | "point";

export type LayerStatsGroup = LayerStatsRow & {
  shape: MarkShape;
  children: LayerStatsRow[];
};

/** a group with its swatch colour resolved, see `useStableSeriesColors` */
export type ColoredStatsGroup = LayerStatsGroup & { color: string };

const shapeOfGeometry = (type: string): MarkShape => {
  if (type.includes("Polygon")) return "area";
  if (type.includes("LineString")) return "line";
  return "point";
};

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

/** prefixes keep a category named "POI" apart from a source layer named "poi" */
const CATEGORY_PREFIX = "category:";
const SOURCE_PREFIX = "source:";

/**
 * Groups are the "Karteninhalte" categories the layers were picked from — POI,
 * Verkehr, Immobilien, Basis — and each group splits by the catalog layer that
 * actually drew the feature, labelled with its stack title. So "Baujahr
 * Wohngebäude" and "Baujahr Nicht-Wohngebäude" sit under "Immobilien", and
 * "Trinkwasserbrunnen" under "POI", the way the catalog itself presents them.
 *
 * Features the composer never stamped (basemap, anything added outside it) have
 * no catalog layer and therefore no category; they fall back to the vector
 * tile's own `sourceLayer`, which is what this used to group everything by.
 *
 * Only possible from the feature list, which the hook caps at `maxFeatures` and
 * drops entirely in overview mode; the addon opts out of that cap.
 */
const buildGroups = (
  features: MapGeoJSONFeature[],
  layers: Map<string, LayerMeta>
): LayerStatsGroup[] => {
  const groups = new Map<
    string,
    {
      label: string;
      count: number;
      children: Map<string, number>;
      shapes: Map<MarkShape, number>;
    }
  >();

  for (const feature of features) {
    const layerId = catalogLayerIdOf(feature);
    const category = layerId ? layers.get(layerId)?.category : undefined;

    let groupKey: string;
    let groupLabel: string;
    if (category) {
      groupKey = CATEGORY_PREFIX + category;
      // catalog titles are already written for reading
      groupLabel = category;
    } else {
      const source =
        feature.sourceLayer || stripNamespace(feature.source) || "other";
      groupKey = SOURCE_PREFIX + source;
      groupLabel = humanizeKey(source);
    }

    let group = groups.get(groupKey);
    if (!group) {
      group = {
        label: groupLabel,
        count: 0,
        children: new Map(),
        shapes: new Map(),
      };
      groups.set(groupKey, group);
    }
    group.count++;

    if (layerId) {
      group.children.set(layerId, (group.children.get(layerId) ?? 0) + 1);
    }

    // a category is usually homogeneous, but a mixed one should be marked as
    // whatever it mostly draws rather than as whatever came first
    const shape = shapeOfGeometry(feature.geometry.type);
    group.shapes.set(shape, (group.shapes.get(shape) ?? 0) + 1);
  }

  const dominantShape = (shapes: Map<MarkShape, number>): MarkShape =>
    [...shapes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "point";

  const toRows = (counts: Map<string, number>): LayerStatsRow[] =>
    [...counts.entries()]
      .map(([key, count]) => ({
        key,
        label: layers.get(key)?.title ?? humanizeKey(key),
        count,
      }))
      .sort((a, b) => b.count - a.count);

  return [...groups.entries()]
    .map(([key, { label, count, children, shapes }]) => ({
      key,
      label,
      count,
      shape: dominantShape(shapes),
      // always listed, even when a category holds a single layer and the child
      // row repeats the group total — the layer name is the point
      children: toRows(children),
    }))
    .sort((a, b) => b.count - a.count);
};

type LayerStackState = { mapping?: { layers?: LayerStackEntry[] } };

/** what the layer stack knows about one layer id */
type LayerMeta = { title: string; category?: string };

/**
 * The catalog category a layer was picked from. The catalog writes it as the
 * layer's first tag (`layerHelper.ts`: `tags[0] = categoryObject.Title`), and on
 * a stack entry it survives under `other` or `layerInfo` — the same two places
 * geoportal reads for favourites (`layer-favorite-utils.ts`).
 *
 * Not to be confused with `layer.group`, which is only filled for user-made
 * layer groups in the sidebar (`layerStack.ts`, `maskMemberWithGroup`).
 */
const categoryOf = (entry: LayerStackEntry): string | undefined => {
  const { other, layerInfo } = entry as {
    other?: { tags?: unknown };
    layerInfo?: { tags?: unknown };
  };
  const tags = other?.tags ?? layerInfo?.tags;
  const first = Array.isArray(tags) ? (tags as unknown[])[0] : undefined;
  return typeof first === "string" && first.trim() ? first.trim() : undefined;
};

const collectLayerMeta = (
  entries: LayerStackEntry[] | undefined,
  into: Map<string, LayerMeta>
) => {
  for (const entry of entries ?? []) {
    if (entry.id && entry.title) {
      into.set(entry.id, { title: entry.title, category: categoryOf(entry) });
    }
    // groups carry their members in `layers`
    const nested = (entry as { layers?: LayerStackEntry[] }).layers;
    if (nested) collectLayerMeta(nested, into);
  }
  return into;
};

/**
 * Layer id -> title and catalog category, straight from the host app's layer
 * stack. Read through the store prop rather than `useSelector`, since libraries
 * must not depend on react-redux; the snapshot is the `layers` array itself, so
 * an unrelated action does not re-render the panel.
 */
const useLayerIndex = (store: Store): Map<string, LayerMeta> => {
  const layerStack = useSyncExternalStore(store.subscribe, () => {
    return (store.getState() as LayerStackState).mapping?.layers;
  });
  return useMemo(() => collectLayerMeta(layerStack, new Map()), [layerStack]);
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
 * The highlighted subset of the visible features, read live off the map.
 *
 * `useMapHighlighting` marks a highlight by writing the `highlighted`
 * feature-state, so the mark sits on the feature itself and every path that can
 * highlight something lands there — modifier+click, lasso, `highlightByIds`,
 * `highlightByProperty`. Reading it back keeps the full `MapGeoJSONFeature`, so
 * `buildGroups` still sees `layer.metadata`, `source`/`sourceLayer` and the
 * geometry type and groups exactly as it does unfiltered. The context's
 * `toggledFeatures` map would not do: it holds `{source, sourceLayer, id}`
 * triples, and grouping those would collapse every catalog category into the
 * source-layer fallback.
 *
 * Asked of the map rather than read from `feature.state`: that snapshot is
 * taken when the features are queried, and `useVisibleMapFeatures` only
 * requeries on the map's debounced `idle` — toggling a highlight moves nothing,
 * so the snapshot would lag a click behind. `getFeatureState` hits the same
 * store the renderer reads, and `version` (see `useSettledHighlightVersion`) is
 * what makes React redo the pass.
 *
 * Features without an `id` can hold no feature-state at all, so they are never
 * highlighted and are dropped before the lookup.
 *
 * `enabled` is what keeps this free while no highlight mode runs — a viewport
 * is thousands of features, and without the guard every settled pan would walk
 * all of them for a result nothing reads.
 */
const useHighlightedFeatures = (
  map: MaplibreMap | null,
  features: MapGeoJSONFeature[],
  stateKey: string,
  version: number,
  enabled: boolean
): MapGeoJSONFeature[] =>
  useMemo(() => {
    if (!map || !enabled) return [];
    return features.filter((feature) => {
      if (feature.id == null || !feature.source) return false;
      try {
        const state = map.getFeatureState(
          buildFeatureStateTarget(map, {
            source: feature.source,
            sourceLayer: feature.sourceLayer,
            id: feature.id,
          })
        );
        return state[stateKey] === true;
      } catch {
        // the source went away between the query and this read
        return false;
      }
    });
    // `version` is the signal, not an input: the criteria behind it are a ref
    // that mutates in place, so they can never be a dependency
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, features, stateKey, version, enabled]);

/**
 * `highlightVersion`, delayed to the frame after the highlight was applied.
 *
 * `useMapHighlighting` writes the feature-state from an effect keyed on that
 * same version (`useMapHighlighting.ts:307`), i.e. in the commit phase, while
 * the read above happens while rendering. Reacting to the raw version would
 * therefore always show the state from before the toggle. Doing our read in an
 * effect instead would only trade that for a dependency on which of the two
 * addons React commits first — declaration order in the route config, which is
 * no basis for correctness. A frame later both have run, whoever went first.
 *
 * Features from tiles that load afterwards are highlighted by that hook's own
 * debounced re-apply, and are picked up here without any of this: a tile load
 * settles the map, `useVisibleMapFeatures` requeries, and the new feature list
 * re-runs the pass.
 */
const useSettledHighlightVersion = (highlightVersion: number): number => {
  const [settled, setSettled] = useState(highlightVersion);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setSettled(highlightVersion));
    return () => cancelAnimationFrame(frame);
  }, [highlightVersion]);
  return settled;
};

/**
 * Legend mark. The shape repeats the geometry the group is drawn with, so it is
 * a second, non-colour channel for identity: filled square for areas, dot for
 * points, short rule for lines.
 */
const Swatch = ({ shape, color }: { shape: MarkShape; color: string }) => (
  <span
    aria-hidden
    className={
      shape === "line"
        ? "h-[3px] w-[10px] shrink-0 rounded-full"
        : `h-[9px] w-[9px] shrink-0 ${
            shape === "point" ? "rounded-full" : "rounded-[2px]"
          }`
    }
    style={{ backgroundColor: color }}
  />
);

/** swatch width + row gap, so child rows line up under their parent's label */
const CHILD_INDENT_PX = 19;

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
  isFiltered = false,
  visibleCount,
}: {
  /** the number the rows add up to — highlighted only while `isFiltered` */
  totalCount: number;
  groups: ColoredStatsGroup[];
  isLoading: boolean;
  maxRows: number;
  /** narrowed to the highlighted features; changes heading and readout */
  isFiltered?: boolean;
  /** everything on screen, shown as the denominator while `isFiltered` */
  visibleCount?: number;
}) => {
  const shown = groups.slice(0, maxRows);
  const folded = groups.slice(maxRows);
  const foldedCount = folded.reduce((sum, group) => sum + group.count, 0);

  // the bar is drawn from the rows themselves rather than from `totalCount`, so
  // the segments always add up to exactly what the list below shows
  const segments = [
    ...shown,
    ...(folded.length > 0
      ? [
          {
            key: "__rest__",
            label: `${folded.length} weitere Quellen`,
            count: foldedCount,
            color: REST_COLOR,
          },
        ]
      : []),
  ].filter((segment) => segment.count > 0);
  const barTotal = segments.reduce((sum, segment) => sum + segment.count, 0);

  // a settled viewport stays on screen while the next one is queried — dimmed
  // rather than replaced by a skeleton, so nothing jumps on every pan
  const staleness = { opacity: isLoading ? 0.45 : 1 };

  return (
    <div
      className="pointer-events-auto w-[280px] rounded-lg bg-white/95 px-3.5 py-3 shadow-lg ring-1 ring-black/10"
      style={{ fontFamily: FONT_STACK }}
    >
      <div className="flex items-baseline justify-between gap-3">
        {/* the filtered heading is the longer of the two and sits next to a
            two-part number, so it shrinks rather than wrapping the header */}
        <span
          className="min-w-0 truncate text-[11px] font-semibold uppercase leading-none tracking-[0.09em]"
          style={{ color: INK.title }}
        >
          {isFiltered ? "Hervorgehobene Objekte" : "Sichtbare Objekte"}
        </span>
        <span
          className="whitespace-nowrap text-[17px] font-semibold leading-none transition-opacity"
          style={{ color: INK.primary, ...staleness }}
        >
          {formatCount(totalCount)}
          {/* the denominator says what the panel is a share *of*, so a small
              highlight among thousands does not read as an empty map */}
          {isFiltered && visibleCount !== undefined && (
            <span
              className="text-[12px] font-normal"
              style={{ color: INK.secondary }}
            >
              {" / "}
              {formatCount(visibleCount)}
            </span>
          )}
        </span>
      </div>

      <div className="transition-opacity" style={staleness}>
        <div className="mt-2.5 flex h-[5px] gap-[2px]">
          {segments.length === 0 ? (
            <span
              className="flex-1 rounded-full"
              style={{ backgroundColor: INK.track }}
            />
          ) : (
            segments.map((segment) => (
              <span
                key={segment.key}
                className="rounded-full"
                title={`${segment.label}: ${formatCount(segment.count)} (${(
                  (segment.count / barTotal) *
                  100
                ).toFixed(1)} %)`}
                // grow by count, but never thinner than a visible sliver — a
                // handful of features among thousands still gets a mark
                style={{
                  flex: `${segment.count} 1 0`,
                  minWidth: 3,
                  backgroundColor: segment.color,
                }}
              />
            ))
          )}
        </div>

        {groups.length === 0 ? (
          <p className="mt-3 text-[12px]" style={{ color: INK.secondary }}>
            {isLoading
              ? "wird ermittelt …"
              : isFiltered
              ? // an empty *filter* is not an empty map — say which one it is
                "keine hervorgehobenen Objekte"
              : "keine Objekte im Ausschnitt"}
          </p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2.5">
            {shown.map((group) => (
              <li key={group.key}>
                <div className="flex items-center gap-2.5">
                  <Swatch shape={group.shape} color={group.color} />
                  <span
                    className="flex-1 truncate text-[13px] font-medium"
                    style={{ color: INK.primary }}
                    title={group.key}
                  >
                    {group.label}
                  </span>
                  <span
                    className="text-[13px] font-medium tabular-nums"
                    style={{ color: INK.primary }}
                  >
                    {formatCount(group.count)}
                  </span>
                </div>
                {group.children.length > 0 && (
                  <ul
                    className="mt-1 flex flex-col gap-1"
                    style={{ paddingLeft: CHILD_INDENT_PX }}
                  >
                    {group.children.slice(0, maxRows).map((child) => (
                      <li
                        key={child.key}
                        className="flex items-center gap-2.5 text-[12px]"
                        style={{ color: INK.secondary }}
                      >
                        <span className="flex-1 truncate" title={child.key}>
                          {child.label}
                        </span>
                        <span className="tabular-nums">
                          {formatCount(child.count)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
            {folded.length > 0 && (
              <li
                className="flex items-center gap-2.5 text-[12px]"
                style={{ color: INK.secondary }}
              >
                <Swatch shape="area" color={REST_COLOR} />
                <span className="flex-1 truncate">
                  {folded.length} weitere Quellen
                </span>
                <span className="tabular-nums">{formatCount(foldedCount)}</span>
              </li>
            )}
          </ul>
        )}
      </div>
    </div>
  );
};

/**
 * Group key -> palette slot, in the order the keys were first seen and kept for
 * the life of the addon. Rows are sorted by count and panning reorders them, so
 * indexing the palette by row position would repaint every group on every pan;
 * this way "Wohngebäude is blue" holds for the whole session. Slots run out
 * after eight — anything later shares the neutral, which is also what the
 * folded tail wears.
 */
const useStableSeriesColors = (
  groups: LayerStatsGroup[]
): ColoredStatsGroup[] => {
  const slots = useRef<Map<string, number>>(new Map());

  return useMemo(() => {
    const assigned = slots.current;
    return groups.map((group) => {
      let slot = assigned.get(group.key);
      if (slot === undefined) {
        slot = assigned.size;
        assigned.set(group.key, slot);
      }
      return { ...group, color: SERIES_COLORS[slot] ?? REST_COLOR };
    });
  }, [groups]);
};

export const VisibleFeatureStats = ({
  config,
  libreMap,
  store,
}: AddonComponentProps<"visibleFeatureStats">) => {
  const {
    debounceMs = DEFAULT_DEBOUNCE_MS,
    showDebugBounds = false,
    debugInsetPx = DEFAULT_DEBUG_INSET_PX,
    layerFilterExpressions,
    filterByHighlight = true,
    highlightStateKey = DEFAULT_HIGHLIGHT_STATE_KEY,
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

  // read once per mount: the geoportal hash state rewrites the hash as the user
  // pans, so a live read would lose the param the moment it is dropped
  const showBorderParam = useMemo(readShowBorderParam, []);
  const showBorder = showBorderParam ?? (showDebugBounds && isLocalhost());

  const { width, height } = useMapCanvasSize(libreMap);
  useDebugBoundsBox(libreMap, showBorder, inset);

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

  // no addon-state channel between the two addons: `VectorHighlight` owns the
  // mode, this one only observes it. `highlightingActive` is the mode, not the
  // presence of highlights — it stays on after the last one is removed, which
  // is what keeps the panel filtered (and honestly at 0) instead of flipping
  // back to the full count mid-session.
  const { highlightingActive, highlightVersion } = useMapHighlight();
  const isFiltered = filterByHighlight && highlightingActive;
  const settledVersion = useSettledHighlightVersion(highlightVersion);

  const highlighted = useHighlightedFeatures(
    libreMap,
    features,
    highlightStateKey,
    settledVersion,
    isFiltered
  );
  const shownFeatures = isFiltered ? highlighted : features;
  // a highlighted feature panned off screen leaves the query, so this counts
  // "highlighted *and* visible" — the same rule the unfiltered panel follows
  const shownCount = isFiltered ? shownFeatures.length : totalCount;

  const layerIndex = useLayerIndex(store);
  const groups = useMemo(
    () => buildGroups(shownFeatures, layerIndex),
    [shownFeatures, layerIndex]
  );
  const coloredGroups = useStableSeriesColors(groups);

  useEffect(() => {
    // `isLoading` is true from `movestart` until the query settles — skip the
    // stale intermediate render so every log line is a finished viewport
    if (isLoading || !logToConsole) return;
    console.info("[VISIBLE_FEATURE_STATS]", {
      totalCount: shownCount,
      ...(isFiltered
        ? { visibleCount: totalCount, filter: "highlighted" }
        : {}),
      groups,
      ...(logFeatures ? { features: shownFeatures } : {}),
    });
  }, [
    shownFeatures,
    shownCount,
    totalCount,
    isFiltered,
    groups,
    isLoading,
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
        totalCount={shownCount}
        groups={coloredGroups}
        isLoading={isLoading}
        maxRows={panelMaxRows}
        isFiltered={isFiltered}
        visibleCount={totalCount}
      />
    </Control>
  );
};
