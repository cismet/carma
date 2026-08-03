import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { Map as MaplibreMap, MapGeoJSONFeature } from "maplibre-gl";
import type { Store } from "redux";

import { useMapHighlight } from "@carma-mapping/contexts";
import type { LayerStackEntry } from "@carma-mapping/layers";
import {
  buildFeatureStateTarget,
  useVisibleMapFeatures,
} from "@carma-mapping/utils";

import { useAddonState } from "../lib/AddonStateContext";
import type { AddonComponentProps } from "../lib/registry";

/**
 * Headless producer of statistics over the features visible on the MapLibre map.
 * Renders nothing: it publishes a finished breakdown on the
 * `visibleFeatureStats` addon-state channel, which `VisibleFeatureStatsPanel`
 * draws. A route that only wants the console log declares this addon alone.
 *
 * Grouping needs `layer.metadata`, the vector tile source and the host's layer
 * stack, so it happens here and the channel carries `LayerStatsGroup[]` instead
 * of the raw features. The panel needs neither a map nor a store.
 *
 * `useVisibleMapFeatures` queries on the map's debounced `idle` event and sees
 * rendered features only: anything hidden by a style filter, outside its zoom
 * range or in a tile that has not loaded is not counted.
 *
 * With `VectorHighlight` on the same route (`filterByHighlight`, default on) the
 * numbers narrow to the highlighted features while its mode runs. Both addons
 * read `MapHighlightContext`; the highlight itself is read off the map as the
 * `highlighted` feature-state.
 */

export type MapChromeInset = {
  top?: number;
  right?: number;
  bottom?: number;
  left?: number;
};

export type VisibleFeatureStatsSourceConfig = {
  /** Debounce after `idle` before querying. Default: 300 */
  debounceMs?: number;
  /**
   * Draw the queried rectangle as a yellow box.
   * Default: false. Overridden by `?showBr=true|false` in the URL.
   */
  showDebugBounds?: boolean;
  /**
   * Pixels the counted area is pulled inside the canvas, as one value for all
   * sides or per side. The map container starts behind the navbar and the
   * panels float over it, so features are rendered there that the user cannot
   * see; without an inset they are counted. The debug box draws this same
   * rectangle. Default: 0
   */
  insetPx?: number | MapChromeInset;
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
   * Feature-state key the highlight is read from; must match the `stateKey` of
   * whoever writes it. Default: "highlighted"
   */
  highlightStateKey?: string;
  /** Also log the feature array, not just the counts. Default: true */
  logFeatures?: boolean;
  /** Log every settled viewport to the console. Default: true */
  logToConsole?: boolean;
};

/**
 * Payload of the `visibleFeatureStats` channel: the finished breakdown, without
 * map objects and without colours — the palette belongs to the panel.
 */
export type VisibleFeatureStatsState = {
  /** the number the rows add up to — highlighted only while `isFiltered` */
  totalCount: number;
  /** everything on screen; the denominator while `isFiltered` */
  visibleCount: number;
  groups: LayerStatsGroup[];
  /** a viewport is being queried; the last result is still the one in `groups` */
  isLoading: boolean;
  /** narrowed to the highlighted features */
  isFiltered: boolean;
};

/**
 * The breakdown is built from the feature list, which the hook drops once the
 * count passes `maxFeatures`. This addon only counts, so it opts out of the cap.
 */
const NO_FEATURE_CAP = Number.MAX_SAFE_INTEGER;
const DEFAULT_DEBOUNCE_MS = 300;
const DEFAULT_INSET_PX = 0;
/** `useMapHighlighting`'s own default, and `VectorHighlight`'s */
const DEFAULT_HIGHLIGHT_STATE_KEY = "highlighted";

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
  inset: number | MapChromeInset | undefined
): Required<MapChromeInset> => {
  const fallback = typeof inset === "number" ? inset : DEFAULT_INSET_PX;
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
 * The catalog layer that drew this feature, read from the `metadata["layer-id"]`
 * stamp `styleComposer` writes. The `"<layerId>::<styleLayerId>"` prefix is the
 * fallback for layers added outside the composer.
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
 * Groups are the catalog categories the layers were picked from (POI, Verkehr,
 * Immobilien, …), each split by the catalog layer that drew the feature and
 * labelled with its stack title.
 *
 * Features without a catalog layer — basemap, anything added outside the
 * composer — fall back to the vector tile's own `sourceLayer`.
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

    // a mixed category is marked as whatever it mostly draws, not as whatever
    // came first
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
      // listed even when a category holds a single layer: the layer name is the
      // information the group label does not carry
      children: toRows(children),
    }))
    .sort((a, b) => b.count - a.count);
};

/**
 * One entry per map object. A catalog layer may draw the same id in several
 * source layers (icon and shape), which the hook's `source-sourceLayer-id`
 * dedupe keeps apart.
 */
const dedupeByObject = (features: MapGeoJSONFeature[]): MapGeoJSONFeature[] => {
  const seen = new Set<string>();
  const unique: MapGeoJSONFeature[] = [];
  for (const feature of features) {
    if (feature.id == null) {
      unique.push(feature);
      continue;
    }
    const scope = catalogLayerIdOf(feature) ?? feature.source ?? "";
    const key = `${scope}-${String(feature.id)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(feature);
  }
  return unique;
};

type LayerStackState = { mapping?: { layers?: LayerStackEntry[] } };

/** what the layer stack knows about one layer id */
type LayerMeta = { title: string; category?: string };

/**
 * The catalog category a layer was picked from. The catalog writes it as the
 * layer's first tag, and on a stack entry it survives under `other` or
 * `layerInfo`. Not `layer.group`, which is only set for user-made layer groups.
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
 * Layer id -> title and catalog category from the host's layer stack. Read
 * through the store prop rather than `useSelector`, since libraries must not
 * depend on react-redux; the snapshot is the `layers` array, so unrelated
 * actions do not re-render.
 */
const useLayerIndex = (store: Store): Map<string, LayerMeta> => {
  const layerStack = useSyncExternalStore(store.subscribe, () => {
    return (store.getState() as LayerStackState).mapping?.layers;
  });
  return useMemo(() => collectLayerMeta(layerStack, new Map()), [layerStack]);
};

/**
 * The visible map size `useVisibleMapFeatures` compares against the canvas.
 * Geoportal does not oversize its canvas, so the canvas is the visible area and
 * its integer client size is reported as is: the fractional numbers of
 * `getBoundingClientRect()` would flip the hook's `isOversized` branch and shift
 * the query rectangle.
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
    // the canvas resizes as a consequence of the container resizing
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
 * The highlighted subset of the visible features, read from the map.
 *
 * Every highlight path — modifier+click, lasso, `highlightByIds`,
 * `highlightByProperty` — ends in the `highlighted` feature-state, and reading
 * it back keeps the full `MapGeoJSONFeature`, so `buildGroups` works exactly as
 * it does unfiltered. `getFeatureState` is asked instead of `feature.state`,
 * whose snapshot dates from the last query and would lag a toggle behind.
 *
 * Features without an id hold no feature-state and are dropped. `enabled` keeps
 * the pass off while no highlight mode runs.
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
    // `version` is the signal; the criteria behind it are a ref mutated in place
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, features, stateKey, version, enabled]);

/**
 * `highlightVersion`, delayed by one frame.
 *
 * `useMapHighlighting` writes the feature-state from an effect keyed on the same
 * version, i.e. after render, so reacting to the raw version would read the
 * state from before the toggle. One frame later both addons have committed,
 * whichever React ran first.
 */
const useSettledHighlightVersion = (highlightVersion: number): number => {
  const [settled, setSettled] = useState(highlightVersion);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setSettled(highlightVersion));
    return () => cancelAnimationFrame(frame);
  }, [highlightVersion]);
  return settled;
};

export const VisibleFeatureStatsSource = ({
  // optional on every addon, and this one runs on defaults alone
  config = {},
  libreMap,
  store,
}: AddonComponentProps<"visibleFeatureStatsSource">) => {
  const {
    debounceMs = DEFAULT_DEBOUNCE_MS,
    showDebugBounds = false,
    insetPx = DEFAULT_INSET_PX,
    layerFilterExpressions,
    filterByHighlight = true,
    highlightStateKey = DEFAULT_HIGHLIGHT_STATE_KEY,
    logFeatures = true,
    logToConsole = true,
  } = config;

  // the drawing hook keys its effect on the four numbers and the query hook
  // holds it in a ref, so a fresh object per render costs nothing
  const inset = resolveInset(insetPx);

  // read once per mount: the hash state rewrites the URL while the user pans
  const showBorderParam = useMemo(readShowBorderParam, []);
  const showBorder = showBorderParam ?? (showDebugBounds || isLocalhost());

  const { width, height } = useMapCanvasSize(libreMap);

  // key on the content: route configs pass a fresh array per render
  const filterKey = (layerFilterExpressions ?? []).join("|");
  const layerFilters = useMemo(
    () => (filterKey ? filterKey.split("|") : undefined),
    [filterKey]
  );

  const { features: renderedFeatures, isLoading } = useVisibleMapFeatures({
    // the hook needs a size once the map exists; 0/0 yields no features
    maplibreMap: width > 0 && height > 0 ? libreMap : null,
    visibleMapWidth: width,
    visibleMapHeight: height,
    maxFeatures: NO_FEATURE_CAP,
    debounceMs,
    // the navbar and the panels cover the canvas: without this, the features
    // rendered behind them are counted although nobody can see them
    insetPx: inset,
    // the same rectangle the query uses, so the yellow line is the counted area
    // rather than an illustration of it; the hook keeps it out of its results
    showDebugBounds: showBorder,
    layerFilterExpressions: layerFilters,
  });

  const features = useMemo(
    () => dedupeByObject(renderedFeatures),
    [renderedFeatures]
  );
  const totalCount = features.length;

  // `highlightingActive` is the mode, not the presence of highlights: it stays
  // on after the last one is removed, so the readout keeps reporting the
  // filtered count instead of flipping back mid-session
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
  // "highlighted and visible"
  const shownCount = isFiltered ? shownFeatures.length : totalCount;

  const layerIndex = useLayerIndex(store);
  const groups = useMemo(
    () => buildGroups(shownFeatures, layerIndex),
    [shownFeatures, layerIndex]
  );

  // memoized: the provider bails out on `Object.is`-equal writes only, so a
  // fresh object per render would re-render every consumer
  const stats = useMemo<VisibleFeatureStatsState>(
    () => ({
      totalCount: shownCount,
      visibleCount: totalCount,
      groups,
      isLoading,
      isFiltered,
    }),
    [shownCount, totalCount, groups, isLoading, isFiltered]
  );

  const [, publish] = useAddonState("visibleFeatureStats");

  // from an effect, not during render: the setter updates the provider above
  // this addon. `AddonProvider` drops the whole state when the route's addon
  // list changes, so no teardown clears the channel.
  useEffect(() => {
    publish(stats);
  }, [publish, stats]);

  useEffect(() => {
    // `isLoading` runs from `movestart` until the query settles; skipping it
    // keeps every log line a finished viewport
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

  return null;
};
