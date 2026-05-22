import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { useLibreContext } from "@carma-mapping/engines/maplibre";
import {
  TerraDraw,
  TerraDrawPointMode,
  TerraDrawLineStringMode,
  TerraDrawPolygonMode,
  TerraDrawSelectMode,
} from "terra-draw";
import type { GeoJSONStoreFeatures } from "terra-draw";
import { TerraDrawMapLibreGLAdapter } from "terra-draw-maplibre-gl-adapter";
import type { Feature } from "geojson";
import type { GeoJSONSource } from "maplibre-gl";

import type { DrawMode } from "./MeasurementControls";
import { LABEL_LAYER_ID, LABEL_SOURCE_ID, buildLabelFeatures } from "./labels";
import {
  findSnapTarget,
  getSnappableLayerIds,
  type SnapMode,
} from "./snapping";
import {
  setActiveRemoveFeatures,
  setActiveAddFeatures,
} from "./measurementHostHandle";
import { useMeasurementsRegistry } from "./MeasurementsContext";

const DEFAULT_SNAP_RADIUS_PX = 20;
const SNAP_PREVIEW_SOURCE_ID = "carma-measurements-snap-preview";
const SNAP_PREVIEW_LAYER_ID = "carma-measurements-snap-preview-circle";
const SNAP_RADIUS_SOURCE_ID = "carma-measurements-snap-radius";
const SNAP_RADIUS_LAYER_ID = "carma-measurements-snap-radius-circle";

const EMPTY_FC = { type: "FeatureCollection" as const, features: [] };
const EMPTY_OPTED_IN: ReadonlySet<string> = new Set();

// terra-draw's select mode injects internal helper Point features into its
// store so it can render draggable vertex/midpoint handles. They live in the
// same snapshot as real user features and must not leak to consumers — a
// freshly selected 2-vertex line would otherwise spawn 3 phantom "Punkt"
// rows in any sidebar / persistence sink. The property key set below covers
// every guidance flag terra-draw stamps (vertex grabs, midpoints, the
// in-progress snap dot, closing-vertex hover, etc.).
const GUIDANCE_PROPERTY_KEYS = [
  "midPoint",
  "selectionPoint",
  "selectionPointFeatureId",
  "snappingPoint",
  "coordinatePoint",
  "closingPoint",
  "edited",
] as const;

// Which snapshot features may act as snap targets for a NEW measurement.
// We want only committed user geometries: skip terra-draw's render helpers
// (selectionPoint / midPoint vertex handles, closingPoint / snappingPoint /
// coordinatePoint draw aids) AND the feature currently being drawn
// (`currentlyDrawing` is set while a line/polygon is mid-draw and cleared on
// finish) — otherwise an in-progress vertex would snap to itself and pin the
// dot to the cursor, defeating snapping to other features.
const isSnapCandidateFeature = (feature: Feature): boolean => {
  const props = (feature.properties ?? {}) as Record<string, unknown>;
  return (
    !props.selectionPoint &&
    !props.midPoint &&
    !props.closingPoint &&
    !props.snappingPoint &&
    !props.coordinatePoint &&
    props.currentlyDrawing !== true
  );
};

type TerraDrawMode = "select" | "point" | "linestring" | "polygon" | "static";
function isGuidanceFeature(feature: Feature): boolean {
  const props = feature.properties;
  if (!props) return false;
  return GUIDANCE_PROPERTY_KEYS.some((key) => Boolean(props[key]));
}

function stripGuidanceFeatures<T extends Feature>(features: T[]): T[] {
  return features.filter((f) => !isGuidanceFeature(f));
}

// Back-compat predicate for callers that .filter(isUserFeature) — keeps the
// imperative onChange path (forwardRef handle, clearAll/deleteFeature) using
// the same guidance check as the new context publish path.
const isUserFeature = (feature: Feature): boolean =>
  !isGuidanceFeature(feature);

function toTerraDrawMode(mode: DrawMode): TerraDrawMode {
  switch (mode) {
    case "point":
      return "point";
    case "line":
      return "linestring";
    case "polygon":
      return "polygon";
    case "select":
    case "none":
      // Resting state — terra-draw stays in select so existing measurements
      // remain clickable / interactive without a dedicated select button in
      // the UI. The host app's own click handlers still run in parallel for
      // fachobjekte; the two paths don't usually overlap by pixel target.
      return "select";
  }
}

export interface MeasurementHostProps {
  mode: DrawMode;
  /** Legacy callback fired at stable terra-draw moments (`finish`, plus the
   * imperative `deleteFeature` / `clearAll` paths) with the current user
   * features. Prefer the context API (`useMeasurements().features`) for new
   * consumers — this prop is kept for belis during the migration. */
  onChange?: (features: Feature[]) => void;
  /** When true, line / polygon drawing snaps to nearby vertices (and falls
   * back to the closest point on a segment) of the host map's rendered
   * features. Toggling this prop is cheap — terra-draw is not rebuilt; the
   * snap callback reads the live value via a ref. */
  snapping?: boolean;
  /** Pixel search radius for snap candidates. Defaults to 20. */
  snapRadiusPx?: number;
  /** Click-to-finish tolerance (px): drawing auto-finishes when a click lands
   * within this distance of the last committed vertex. When unset, terra-draw's
   * native default (40) is used — leave it unset to preserve existing behavior.
   * Hosts that draw short segments near snapped corners (e.g. BelIS) can lower
   * it (keep it <= `snapRadiusPx`) so the line doesn't terminate prematurely.
   * Read once at terra-draw construction time (unlike `snapRadiusPx`), so a
   * change applies on the next attach, not live. */
  closePointerDistancePx?: number;
  /** Strategy for selecting snap-target layers. Default `"opt-out"` —
   * every geometry-bearing layer is a candidate unless flagged with
   * `metadata.carmaConf.skipSnapping`. See `SnapMode` for the other modes. */
  snapMode?: SnapMode;
  /** Owner-id set used by `snapMode === "explicit"` to enable per-libreLayer
   * snap participation. Owner ids are read from
   * `layer.metadata["layer-id"]` (set by styleBuilder; equals the libreLayer
   * `name` for data layers and `bg-<layerName>` for vector backgrounds).
   * Ignored in opt-out and derived-opt-in modes. */
  optedInLayerIds?: ReadonlySet<string>;
  /** When `snapMode === "explicit"`, controls whether layers whose
   * owner-id starts with `bg-` (basemap) participate. Ignored in other
   * modes. */
  backgroundSnapping?: boolean;
  /** Toggle visibility of the segment / area / title labels rendered into
   * the host map. Default `true`. The label source is always populated;
   * only the symbol layer's `visibility` is flipped. */
  labelsVisible?: boolean;
  /** When true, render a translucent circle at the cursor sized to the
   * current `snapRadiusPx` — useful for tuning the radius during
   * development. Default `false`. Implicitly hidden when `snapping` is off. */
  radiusDebugVisible?: boolean;
  /** Fired when terra-draw's select mode picks up or drops a measurement.
   * `id` is the terra-draw feature id (a UUID), or `null` on deselect. Hosts
   * typically translate this into their own selection state so map and
   * sidebar stay in sync. */
  onSelectionChange?: (id: string | null) => void;
  /** Features to seed terra-draw with on the FIRST attach — used by hosts
   *  that persist measurements externally (e.g. redux-persist + localForage)
   *  and need them re-rendered after a page refresh. Each feature must be a
   *  terra-draw snapshot shape (UUID `id`, `properties.mode` set, `title`
   *  preserved if present). Re-attaches after a basemap swap ignore this
   *  prop — they reuse the previous terra-draw snapshot instead. The prop
   *  is read via a ref, so a late-arriving value (redux rehydration tick)
   *  is picked up as long as it lands before terra-draw's initial attach. */
  initialFeatures?: Feature[];
}

/** Imperative handle returned via ref. Lets the host invoke terra-draw
 *  operations (e.g. delete from an InfoBox button) without owning the
 *  TerraDraw instance directly. */
export interface MeasurementHostHandle {
  /** Remove a measurement by its terra-draw feature id (the raw UUID — do
   *  not pass any namespacing prefix the host applies in its own store). */
  deleteFeature: (id: string) => void;
  /** Programmatically put a measurement into terra-draw's select mode so its
   *  halo + vertex handles paint on the map. Idempotent: no-op if the id is
   *  already selected. Does NOT fire `onSelectionChange` (avoids redux →
   *  draw → redux echo when the host mirrors selection in both directions). */
  selectFeature: (id: string) => void;
  /** Clear terra-draw's selection (drops the halo). Idempotent. Does NOT
   *  fire `onSelectionChange` (same echo-avoidance as `selectFeature`). */
  deselectAll: () => void;
  /** Remove every measurement from terra-draw. Fires `onChange` once with an
   *  empty list so the host can mirror the wipe into its own state (redux,
   *  etc.). Idempotent: no `onChange` is fired when there were no features. */
  clearAll: () => void;
}

// Side-effect-only component. Lives as a sibling of <CarmaMap> inside the
// same LibreContextProvider AND inside a <MeasurementsProvider>; it pulls
// the maplibre map instance from useLibreContext(), creates a TerraDraw
// instance once the style is ready, re-creates it after every basemap swap
// (terra-draw's adapter has no auto-recovery), and renders an in-map label
// layer with German segment lengths for any drawn LineString.
//
// Two consumer pathways are supported in parallel during the imperative ->
// context migration:
//   1. Legacy imperative API — onChange / onSelectionChange / initialFeatures
//      props, MeasurementHostHandle ref, removeMeasurements module-level
//      escape hatch. Still used by belis (FeaturesFormsWrapper, save helpers,
//      BelisMapWrapper).
//   2. New context API — every stable snapshot is also pushed into the
//      surrounding <MeasurementsProvider>, and the host self-registers
//      clearAll/deleteById commands so descendants can drive terra-draw
//      via useMeasurements() without prop-drilling a ref.
// Both paths are fed from the same publishSnapshot / event listeners, so
// callers can migrate incrementally without divergence.
export const MeasurementHost = forwardRef<
  MeasurementHostHandle,
  MeasurementHostProps
>(function MeasurementHost(
  {
    mode,
    onChange,
    snapping = false,
    snapRadiusPx = DEFAULT_SNAP_RADIUS_PX,
    closePointerDistancePx,
    snapMode = "opt-out",
    optedInLayerIds = EMPTY_OPTED_IN,
    backgroundSnapping = false,
    labelsVisible = true,
    radiusDebugVisible = false,
    onSelectionChange,
    initialFeatures,
  },
  ref
) {
  const { map } = useLibreContext();
  const drawRef = useRef<TerraDraw | null>(null);
  const modeRef = useRef(mode);
  modeRef.current = mode;
  // Live registry handle from the surrounding MeasurementsProvider. The
  // hook throws if no provider is mounted above; held in a ref so the
  // closures created inside the `[map]` effect (publishSnapshot, command
  // implementations) see the same object across renders.
  const registry = useMeasurementsRegistry();
  const registryRef = useRef(registry);
  registryRef.current = registry;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  // Snapping state is mirrored into refs so the snap callback baked into
  // terra-draw at construction time always sees the current value without
  // requiring a rebuild on toggle. Same trick for the rest of the snap-
  // tuning props (radius, mode, per-layer opt-ins, bg flag) and the
  // debug-radius visibility.
  const snappingEnabledRef = useRef(snapping);
  snappingEnabledRef.current = snapping;
  const snapRadiusPxRef = useRef(snapRadiusPx);
  snapRadiusPxRef.current = snapRadiusPx;
  // Read at terra-draw construction time only — terra-draw bakes
  // `pointerDistance` into the mode and never re-reads it. The ref still tracks
  // the latest prop so a rebuild (basemap swap / remount) picks up changes.
  const closePointerDistancePxRef = useRef(closePointerDistancePx);
  closePointerDistancePxRef.current = closePointerDistancePx;
  const snapModeRef = useRef(snapMode);
  snapModeRef.current = snapMode;
  const optedInLayerIdsRef = useRef(optedInLayerIds);
  optedInLayerIdsRef.current = optedInLayerIds;
  const backgroundSnappingRef = useRef(backgroundSnapping);
  backgroundSnappingRef.current = backgroundSnapping;
  const radiusDebugVisibleRef = useRef(radiusDebugVisible);
  radiusDebugVisibleRef.current = radiusDebugVisible;
  const onSelectionChangeRef = useRef(onSelectionChange);
  onSelectionChangeRef.current = onSelectionChange;
  // Read live so a late redux-persist rehydrate that lands between mount
  // and the first terra-draw attach (style.load) still seeds the draw.
  const initialFeaturesRef = useRef(initialFeatures);
  initialFeaturesRef.current = initialFeatures;
  // Flips true after the first attach consumes initialFeatures so basemap
  // swaps don't re-seed on top of the live terra-draw snapshot.
  const initialFeaturesConsumedRef = useRef(false);
  // Lazy cache for snap-target layer ids. `null` means "dirty — rebuild on
  // next read". Belis (and any consumer with libreLayers loaded from style
  // URLs via styleComposer) gets its layers added asynchronously *after*
  // the initial `style.load` fires, so a cache built once at attach() time
  // would forever miss them. We listen to `styledata` events to mark this
  // dirty whenever the style changes, then rebuild lazily inside the snap
  // callback so we never walk on a frame that isn't actually snapping.
  const snappableLayerIdsRef = useRef<string[] | null>(null);
  // Tracks whether terra-draw's select mode currently has a feature
  // selected. Used to widen the snap preview's render gate to "mode === 'none'
  // AND something selected" — vertex drags benefit from the dot just as
  // much as new-line drawing does.
  const hasSelectionRef = useRef(false);
  // Mirrors terra-draw's currently-selected feature id so the imperative
  // `deselectAll` can call `deselectFeature(id)` (terra-draw has no
  // deselectAll API). Updated from the `select`/`deselect` listeners.
  const selectedIdRef = useRef<string | null>(null);
  // When true, the `select` / `deselect` listeners skip the consumer
  // callback. Set during imperative `selectFeature`/`deselectAll` so a
  // redux → draw sync doesn't bounce back as draw → redux.
  const suppressSelectionCallbackRef = useRef(false);
  // The most recently computed snap target (or null when nothing is in
  // range). Mirrors what the preview dot shows; read at finish-time to
  // post-hoc snap a freshly-created point. Necessary because
  // TerraDrawPointMode does not accept a snapping config the way
  // LineString and Polygon modes do — there's no mode-level hook to
  // adjust the click position before the point is committed, so we
  // mutate the geometry afterwards.
  const lastSnapTargetRef = useRef<[number, number] | null>(null);
  // Monotonic counters used to mint per-feature titles (P1, P2, ... for
  // points; L1, L2, ... for lines). Titles are assigned once at finish-
  // time and stored in `feature.properties.title` (terra-draw reserves
  // `mode`, `id`, etc., so we use `title`) — the symbol layer renders
  // them and consumers can pick them up via getSnapshot. Counters are
  // re-seeded from the snapshot whenever terra-draw is rebuilt (basemap
  // swap) so numbering doesn't restart.
  const pointCounterRef = useRef(0);
  const lineCounterRef = useRef(0);

  useEffect(() => {
    if (!map) return;

    const ensureSnapPreviewLayer = () => {
      if (!map.getSource(SNAP_PREVIEW_SOURCE_ID)) {
        map.addSource(SNAP_PREVIEW_SOURCE_ID, {
          type: "geojson",
          data: EMPTY_FC,
        });
      }
      if (!map.getLayer(SNAP_PREVIEW_LAYER_ID)) {
        map.addLayer({
          id: SNAP_PREVIEW_LAYER_ID,
          type: "circle",
          source: SNAP_PREVIEW_SOURCE_ID,
          paint: {
            "circle-radius": 5,
            "circle-color": "#000",
            "circle-stroke-color": "#fff",
            "circle-stroke-width": 1.5,
          },
        });
      }
    };

    const radiusLayerVisible = () =>
      snappingEnabledRef.current && radiusDebugVisibleRef.current;

    const ensureSnapRadiusLayer = () => {
      if (!map.getSource(SNAP_RADIUS_SOURCE_ID)) {
        map.addSource(SNAP_RADIUS_SOURCE_ID, {
          type: "geojson",
          data: EMPTY_FC,
        });
      }
      if (!map.getLayer(SNAP_RADIUS_LAYER_ID)) {
        map.addLayer({
          id: SNAP_RADIUS_LAYER_ID,
          type: "circle",
          source: SNAP_RADIUS_SOURCE_ID,
          layout: {
            visibility: radiusLayerVisible() ? "visible" : "none",
          },
          paint: {
            "circle-color": "#fff",
            "circle-opacity": 0.2,
            "circle-radius": snapRadiusPxRef.current,
            "circle-stroke-color": "#fff",
            "circle-stroke-width": 1,
            "circle-stroke-opacity": 0.6,
          },
        });
      }
    };

    const setRadiusCircle = (lngLat: [number, number] | null) => {
      const source = map.getSource(SNAP_RADIUS_SOURCE_ID) as
        | GeoJSONSource
        | undefined;
      if (!source) return;
      if (lngLat === null) {
        source.setData(EMPTY_FC);
        return;
      }
      source.setData({
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            geometry: { type: "Point", coordinates: lngLat },
            properties: {},
          },
        ],
      });
    };

    const setSnapPreview = (lngLat: [number, number] | null) => {
      // Keep the "last snap target" mirror in sync with the visible dot
      // so the point-finish handler can post-hoc snap a just-created
      // point without needing its own mousemove tracking.
      lastSnapTargetRef.current = lngLat;
      const source = map.getSource(SNAP_PREVIEW_SOURCE_ID) as
        | GeoJSONSource
        | undefined;
      if (!source) return;
      if (lngLat === null) {
        source.setData(EMPTY_FC);
        return;
      }
      source.setData({
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            geometry: { type: "Point", coordinates: lngLat },
            properties: {},
          },
        ],
      });
      // Intentionally NOT moved to the top: a freshly-committed point
      // shares the snap target's coord and should render OVER the dot,
      // otherwise the blue point reads as obscured by a black halo at
      // the click moment. terra-draw's `td-*` render layers are added
      // after our snap preview layer, so the natural addLayer order
      // already gives committed points the higher z-index.
    };

    const ensureLabelLayer = () => {
      if (!map.getSource(LABEL_SOURCE_ID)) {
        map.addSource(LABEL_SOURCE_ID, {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });
      }
      if (!map.getLayer(LABEL_LAYER_ID)) {
        map.addLayer({
          id: LABEL_LAYER_ID,
          type: "symbol",
          source: LABEL_SOURCE_ID,
          layout: {
            "text-field": ["get", "label"],
            // Two visual styles in one layer driven by `kind`:
            //   - "title"   → matches the belis fachobjekte label style
            //                 (Open Sans Bold, zoom-interpolated size, left
            //                 anchor with radial offset).
            //   - "segment" → stays compact (Noto Sans Regular, 12px,
            //                 centered above the segment).
            // Both fonts must be served by the cismet glyph server, which
            // every CARMA app sets via `overrideGlyphs` at the CarmaMap
            // level.
            "text-font": [
              "case",
              ["==", ["get", "kind"], "title"],
              ["literal", ["Open Sans Bold"]],
              ["literal", ["Noto Sans Regular"]],
            ],
            // Constant per kind. Zoom-interpolation can NOT be nested
            // inside a case keyed on a feature property — MapLibre requires
            // ["interpolate", ..., ["zoom"], ...] to be the outer expression
            // and silently drops the whole layer when that rule is broken,
            // so segment labels disappeared along with title labels in an
            // earlier draft.
            "text-size": ["case", ["==", ["get", "kind"], "title"], 16, 12],
            "text-anchor": [
              "case",
              ["==", ["get", "kind"], "title"],
              "left",
              "center",
            ],
            // No text-radial-offset for "title": maplibre ignores text-offset
            // entirely when radial-offset is set, and a fixed pixel-style
            // [x,y] offset gives us much cleaner control over how far the
            // label clears the (tiny) terra-draw point marker than radial.
            // The fachobjekte layer uses radial because its symbol icon is
            // much larger and centered; ours doesn't need it.
            "text-offset": [
              "case",
              ["==", ["get", "kind"], "segment"],
              ["literal", [0, -0.8]],
              ["==", ["get", "kind"], "title"],
              ["literal", [1.2, -0.6]],
              ["literal", [0, 0]],
            ],
            "text-allow-overlap": false,
            "text-ignore-placement": false,
          },
          paint: {
            "text-color": [
              "case",
              ["==", ["get", "kind"], "title"],
              "#333333",
              "#111",
            ],
            "text-halo-color": "#FFFFFF",
            "text-halo-width": [
              "case",
              ["==", ["get", "kind"], "title"],
              1.5,
              2,
            ],
          },
        });
      }
    };

    const refreshLabels = () => {
      const draw = drawRef.current;
      if (!draw) return;
      const source = map.getSource(LABEL_SOURCE_ID) as
        | GeoJSONSource
        | undefined;
      if (!source) return;
      try {
        source.setData(buildLabelFeatures(draw.getSnapshot() as Feature[]));
        // Terra-draw's adapter adds its `td-*` render layers lazily on the
        // first feature in each mode — those land ON TOP of any layer we
        // installed during attach() (where no terra-draw features existed
        // yet), which means line strokes end up obscuring the labels.
        // Re-asserting the label layer to the top on every refresh fixes
        // the order; moveLayer on an already-top layer is a near-no-op.
        if (map.getLayer(LABEL_LAYER_ID)) {
          map.moveLayer(LABEL_LAYER_ID);
        }
      } catch (e) {
        console.warn("[carma-measurements] label rebuild failed", e);
      }
    };

    const publishSnapshot = () => {
      const draw = drawRef.current;
      if (!draw) return;
      let snapshot: Feature[];
      try {
        snapshot = draw.getSnapshot() as Feature[];
      } catch (e) {
        console.warn("[carma-measurements] snapshot for publish failed", e);
        return;
      }
      const userFeatures = stripGuidanceFeatures(snapshot);
      // Legacy onChange callback (belis still consumes it). Wrapped in
      // try/catch so a host-side throw doesn't skip the registry publish.
      const cb = onChangeRef.current;
      if (cb) {
        try {
          cb(userFeatures);
        } catch (e) {
          console.warn("[carma-measurements] onChange callback failed", e);
        }
      }
      // Push to the surrounding MeasurementsProvider so context consumers
      // see the new snapshot. The registry is non-null by construction —
      // useMeasurementsRegistry() throws if no provider is mounted above.
      registryRef.current.publishFeatures(userFeatures);
    };

    // Lazy cache reader: rebuild only when the styledata listener (or a
    // snap-config prop change) has marked the cache dirty. The walk itself
    // is cheap (~50 layers) but we'd rather not do it 60+/sec while drawing.
    const getCachedSnappableLayerIds = (): string[] => {
      if (snappableLayerIdsRef.current === null) {
        snappableLayerIdsRef.current = getSnappableLayerIds(
          map,
          snapModeRef.current,
          optedInLayerIdsRef.current,
          backgroundSnappingRef.current
        );
      }
      return snappableLayerIdsRef.current;
    };

    // Committed measurements that should act as snap targets right now.
    // Terra-draw renders existing measurements in its own `td-*` layers, which
    // snapping.ts deliberately excludes from `queryRenderedFeatures` (so a
    // drawing vertex can't snap to itself). To let a new measurement snap to
    // EXISTING ones we feed the snapshot in as `extraFeatures` instead, after
    // dropping render helpers / the in-progress feature (isSnapCandidateFeature)
    // and — while editing in select mode — the selected feature itself, so
    // dragging one of its vertices doesn't snap to its own neighbours.
    // `excludeId` additionally drops a feature by id (used at point-finish to
    // stop the just-placed point snapping onto itself).
    const getMeasurementSnapFeatures = (excludeId?: string): Feature[] => {
      const draw = drawRef.current;
      if (!draw) return [];
      let snapshot: Feature[];
      try {
        snapshot = draw.getSnapshot() as Feature[];
      } catch {
        return [];
      }
      const selectedId =
        modeRef.current === "none" || modeRef.current === "select"
          ? selectedIdRef.current
          : null;
      return snapshot.filter((f) => {
        if (!isSnapCandidateFeature(f)) return false;
        const id = f.id != null ? String(f.id) : undefined;
        if (excludeId !== undefined && id === excludeId) return false;
        if (selectedId !== null && id === selectedId) return false;
        return true;
      });
    };

    // Same callback shape used by LineString and Polygon modes. terra-draw
    // treats `undefined` as "no snap, use raw cursor".
    const snapToCustom = (event: {
      containerX: number;
      containerY: number;
    }) => {
      if (!snappingEnabledRef.current) return undefined;
      const hit = findSnapTarget(
        map,
        { x: event.containerX, y: event.containerY },
        snapRadiusPxRef.current,
        getCachedSnappableLayerIds(),
        getMeasurementSnapFeatures()
      );
      return hit?.position;
    };

    // Initial hydrate runs at most once per mount — basemap-swap reattach
    // is covered separately by the snapshot+addFeatures path inside attach().
    // The flag is captured by closure, not a ref, because it's local to the
    // current `[map]` effect run; a fresh effect (e.g. on map remount) starts
    // a new closure and gets a fresh chance to hydrate. Storage is owned by
    // the surrounding MeasurementsProvider; we just ask it for whatever was
    // loaded under its `storageKey` and seed terra-draw with the result.
    let initialHydrateAttempted = false;
    const hydrateFromStorage = async () => {
      if (initialHydrateAttempted) return;
      initialHydrateAttempted = true;
      let stored: Feature[];
      try {
        stored = await registryRef.current.requestInitialFeatures();
      } catch (e) {
        console.warn("[carma-measurements] hydrate request failed", e);
        return;
      }
      // Defend against localforage data written by an earlier build that
      // persisted terra-draw's selection/midpoint helpers — never re-add
      // them to the store as if they were user geometry.
      stored = stripGuidanceFeatures(stored);
      if (stored.length === 0) return;
      const draw = drawRef.current;
      if (!draw) return;
      try {
        draw.addFeatures(stored as GeoJSONStoreFeatures[]);
      } catch (e) {
        console.warn("[carma-measurements] hydrate addFeatures failed", e);
        return;
      }
      // Re-seed P/L counters from restored titles so the next finish
      // doesn't emit a duplicate "P1" / "L1".
      for (const feature of stored as GeoJSONStoreFeatures[]) {
        const title = feature.properties?.title;
        if (typeof title !== "string") continue;
        const match = /^([PL])(\d+)$/.exec(title);
        if (!match) continue;
        const n = Number(match[2]);
        if (match[1] === "P") {
          pointCounterRef.current = Math.max(pointCounterRef.current, n);
        } else {
          lineCounterRef.current = Math.max(lineCounterRef.current, n);
        }
      }
      refreshLabels();
      publishSnapshot();
    };

    const createDraw = () => {
      const draw = new TerraDraw({
        adapter: new TerraDrawMapLibreGLAdapter({ map }),
        modes: [
          new TerraDrawPointMode(),
          new TerraDrawLineStringMode({
            // Host-tunable click-to-finish tolerance. Omitted entirely when the
            // host doesn't set it, so terra-draw keeps its native default (40);
            // hosts that draw short segments near snapped corners pass a smaller
            // value to stop the line closing prematurely.
            ...(closePointerDistancePxRef.current !== undefined && {
              pointerDistance: closePointerDistancePxRef.current,
            }),
            // toLine + toCoordinate snap to terra-draw's OWN draft features
            // (e.g. the in-progress line itself); toCustom snaps to layers
            // outside terra-draw's store via `snapToCustom`.
            snapping: {
              toLine: true,
              toCoordinate: true,
              toCustom: snapToCustom,
            },
          }),
          new TerraDrawPolygonMode({
            ...(closePointerDistancePxRef.current !== undefined && {
              pointerDistance: closePointerDistancePxRef.current,
            }),
            snapping: {
              toLine: true,
              toCoordinate: true,
              toCustom: snapToCustom,
            },
          }),
          new TerraDrawSelectMode({
            // Fully editable: drag features, drag/delete vertices, insert
            // midpoints. `coordinates.snappable.toCustom` makes vertex
            // drags actually snap to host-map features (not just visually
            // — the released vertex lands on the snap target).
            flags: {
              point: {
                feature: {
                  draggable: true,
                  coordinates: {
                    // Routing the point's single coord through coord-drag
                    // (instead of feature-drag) is what gives us a snap
                    // hook — terra-draw's feature-drag has no snapping
                    // config, but coord-drag does. The drag start logic
                    // prefers coord-drag whenever coordinates.draggable is
                    // truthy and a coord is in pointer range.
                    snappable: { toCustom: snapToCustom },
                    draggable: true,
                  },
                },
              },
              linestring: {
                feature: {
                  draggable: true,
                  coordinates: {
                    snappable: { toCustom: snapToCustom },
                    midpoints: true,
                    draggable: true,
                    deletable: true,
                  },
                },
              },
              polygon: {
                feature: {
                  draggable: true,
                  coordinates: {
                    snappable: { toCustom: snapToCustom },
                    midpoints: true,
                    draggable: true,
                    deletable: true,
                  },
                },
              },
            },
            // Make the selected feature actually pop — defaults are too
            // subtle to read at a glance. Only the SIZE is bumped (~2×
            // terra-draw's defaults); colors are left at terra-draw's
            // own defaults.
            styles: {
              selectedLineStringWidth: 8,
              selectedPointWidth: 12,
              selectionPointWidth: 12,
            },
          }),
        ],
      });
      draw.start();
      draw.setMode(toTerraDrawMode(modeRef.current));
      // `change` runs at cursor speed during drawing — keep it cheap (label
      // FC rebuild + map.setData) and don't dispatch into the consumer.
      // Persistence is driven by the provider on every published snapshot,
      // so we only publish here for "delete" — a stable, instantaneous
      // moment that terra-draw doesn't follow up with a `finish`. Vertex
      // drags coalesce into `finish` at drag-end and are covered there.
      draw.on("change", (_ids, type) => {
        refreshLabels();
        if (type === "delete") {
          publishSnapshot();
        }
      });
      // `finish` is terra-draw's "feature is now committed" event (line
      // double-clicked, point dropped). Stable enough to push into redux /
      // app state. See the prop docstring for the trade-off (edits and
      // deletes don't currently propagate; will need extra listeners).
      draw.on("finish", (id) => {
        // Assign a stable per-feature title (P1, L1, ...) on first finish.
        // `finish` also fires for select-mode drag-end, so we must NOT
        // re-number features that already have a title; the guard below
        // covers that case.
        //
        // We pass ONLY the new key to updateFeatureProperties — terra-draw
        // reserves `mode` (and other internal keys) and rejects the call
        // outright if any reserved key is present in the patch object.
        // Spreading the snapshot's properties would include `mode` and
        // throw. terra-draw merges the patch with existing properties
        // internally, so other custom keys are preserved.
        try {
          const snap = draw.getSnapshotFeature(id);
          if (snap) {
            const existingTitle =
              typeof snap.properties?.title === "string"
                ? snap.properties.title
                : null;
            if (!existingTitle) {
              let nextTitle: string | null = null;
              if (snap.geometry.type === "Point") {
                pointCounterRef.current += 1;
                nextTitle = `P${pointCounterRef.current}`;
              } else if (snap.geometry.type === "LineString") {
                lineCounterRef.current += 1;
                nextTitle = `L${lineCounterRef.current}`;
              }
              if (nextTitle) {
                draw.updateFeatureProperties(id, { title: nextTitle });
              }
            }
          }
        } catch (e) {
          console.warn(
            "[carma-measurements] could not assign feature title",
            e
          );
        }
        // Post-hoc snap for points: TerraDrawPointMode has no snapping
        // config at construction (LineString / Polygon do, Point does
        // not), and TerraDrawSelectMode's coord-drag path is geometry-
        // gated to LineString / Polygon — its `getClosestCoordinate`
        // bails out for Point. So neither click-to-create nor select-
        // mode-drag of a point goes through terra-draw's own snap path.
        //
        // We fire a synchronous post-hoc check on every finish: if the
        // just-finished feature is a Point and a snap target is within
        // pointer range of its committed position, mutate. Covers both
        // create (modeRef === "point") and drag-end in select mode
        // (modeRef === "none"). Lines / polygons don't need this — their
        // snap was already applied by terra-draw at commit time.
        if (snappingEnabledRef.current) {
          try {
            const snapshot = draw.getSnapshotFeature(id);
            if (snapshot && snapshot.geometry.type === "Point") {
              const [lng, lat] = snapshot.geometry.coordinates as [
                number,
                number
              ];
              const screen = map.project([lng, lat]);
              const hit = findSnapTarget(
                map,
                { x: screen.x, y: screen.y },
                snapRadiusPxRef.current,
                getCachedSnappableLayerIds(),
                // Exclude the point we just dropped — its own coord sits at
                // distance 0 and would always "win", blocking a snap onto a
                // nearby existing measurement point.
                getMeasurementSnapFeatures(String(id))
              );
              if (hit) {
                // Terra-draw validates `coordinatePrecision` on every
                // updateFeatureGeometry call; raw vector-tile coords can
                // exceed it ("Feature has coordinates with excessive
                // precision"). Rounding to 9 decimals = sub-mm globally
                // and fits comfortably under any default.
                const round9 = (n: number) => Math.round(n * 1e9) / 1e9;
                draw.updateFeatureGeometry(id, {
                  type: "Point",
                  coordinates: [
                    round9(hit.position[0]),
                    round9(hit.position[1]),
                  ],
                });
              }
            }
          } catch (e) {
            console.warn("[carma-measurements] post-hoc point snap failed", e);
          }
        }
        refreshLabels();
        publishSnapshot();
        // Hide the snap preview dot at the moment of commit so it doesn't
        // sit on top of the just-placed feature (the dot and the new point
        // overlap by design — they share the same coord). The next
        // mousemove will repaint the dot if the cursor is still in range
        // of a snap target.
        setSnapPreview(null);
      });
      // Track select-mode selection so the snap preview's render gate can
      // include "select mode + something selected" — vertex drags benefit
      // from the dot too, not just new-line drawing.
      draw.on("select", (id) => {
        hasSelectionRef.current = true;
        const next = id != null ? String(id) : null;
        selectedIdRef.current = next;
        if (!suppressSelectionCallbackRef.current) {
          onSelectionChangeRef.current?.(next);
          registryRef.current.publishSelection(next);
        }
      });
      draw.on("deselect", () => {
        hasSelectionRef.current = false;
        selectedIdRef.current = null;
        if (!suppressSelectionCallbackRef.current) {
          onSelectionChangeRef.current?.(null);
          registryRef.current.publishSelection(null);
        }
        // No selection means no expected vertex drag in the immediate
        // future; clear any stale preview so it doesn't hang at the last
        // hovered position. ("select" and "none" share the same gate —
        // both keep terra-draw in select mode internally.)
        if (modeRef.current === "none" || modeRef.current === "select") {
          setSnapPreview(null);
        }
      });
      return draw;
    };

    // Idempotent attach — handles initial setup AND recovery after a basemap
    // style swap. After setStyle() the new style is empty of terra-draw's
    // sources/layers AND of our label source/layer, and the adapter does
    // not re-bootstrap itself, so we rebuild the whole picture here.
    const attach = () => {
      const previousDraw = drawRef.current;
      if (previousDraw) {
        let snapshot: GeoJSONStoreFeatures[] = [];
        try {
          // Drop terra-draw's selection/midpoint helpers before carrying
          // the snapshot across a basemap swap, otherwise they'd be
          // re-added to the fresh store as standalone point features.
          snapshot = stripGuidanceFeatures(
            previousDraw.getSnapshot() as unknown as Feature[]
          ) as unknown as GeoJSONStoreFeatures[];
        } catch (e) {
          console.warn(
            "[carma-measurements] snapshot before reattach failed",
            e
          );
        }
        // The adapter's unregister() iterates the td-* layer ids it remembers
        // and calls map.removeLayer on each — those ids were wiped by the
        // style swap so the call throws. Canvas event listeners are unbound
        // before the throw, so swallowing here is safe and lets the rebuild
        // proceed.
        try {
          previousDraw.stop();
        } catch (e) {
          console.warn(
            "[carma-measurements] terra-draw stop() threw during style.load reattach",
            e
          );
        }
        drawRef.current = createDraw();
        if (snapshot.length > 0) {
          try {
            drawRef.current.addFeatures(snapshot);
          } catch (e) {
            console.warn(
              "[carma-measurements] could not restore drawn features",
              e
            );
          }
          // Re-seed title counters so the next P/L number continues past
          // any restored feature's title. Without this, the second run
          // would emit duplicate "P1" / "L1" after a basemap swap.
          for (const feature of snapshot) {
            const title = feature.properties?.title;
            if (typeof title !== "string") continue;
            const match = /^([PL])(\d+)$/.exec(title);
            if (!match) continue;
            const n = Number(match[2]);
            if (match[1] === "P") {
              pointCounterRef.current = Math.max(pointCounterRef.current, n);
            } else {
              lineCounterRef.current = Math.max(lineCounterRef.current, n);
            }
          }
        }
      } else {
        drawRef.current = createDraw();
        // FIRST attach: seed from initialFeatures if the host passed any.
        // This is the redux-persist rehydration path — features come back
        // from localForage and need to land in terra-draw so they actually
        // render. The consumed flag prevents a later basemap swap from
        // re-seeding (that path already preserves via previousDraw's own
        // snapshot, see the `if (previousDraw)` branch above).
        if (!initialFeaturesConsumedRef.current) {
          initialFeaturesConsumedRef.current = true;
          const seed = initialFeaturesRef.current;
          if (seed && seed.length > 0) {
            try {
              drawRef.current.addFeatures(seed as GeoJSONStoreFeatures[]);
            } catch (e) {
              console.warn(
                "[carma-measurements] could not seed initialFeatures",
                e
              );
            }
            // Mirror the title-counter re-seed from the basemap-swap branch
            // so the next finish-created P/L number continues past the
            // restored set.
            for (const feature of seed) {
              const title = feature.properties?.title;
              if (typeof title !== "string") continue;
              const match = /^([PL])(\d+)$/.exec(title);
              if (!match) continue;
              const n = Number(match[2]);
              if (match[1] === "P") {
                pointCounterRef.current = Math.max(pointCounterRef.current, n);
              } else {
                lineCounterRef.current = Math.max(lineCounterRef.current, n);
              }
            }
          }
        }
      }
      ensureLabelLayer();
      ensureSnapPreviewLayer();
      ensureSnapRadiusLayer();
      refreshLabels();
      // Apply current label visibility — the layer is created with maplibre's
      // default ("visible"), so this only matters when the host has the
      // labels-off prop set at attach time (initial mount or basemap swap).
      if (map.getLayer(LABEL_LAYER_ID)) {
        map.setLayoutProperty(
          LABEL_LAYER_ID,
          "visibility",
          labelsVisible ? "visible" : "none"
        );
      }
      // Wipe any stale dot / radius left over from the previous style; the
      // next mousemove will paint them back if appropriate.
      setSnapPreview(null);
      setRadiusCircle(null);
      // Kick off storage hydration on the first attach. Fires once per
      // mount; basemap-swap reattach is no-op'd by the flag inside the
      // function (snapshot+addFeatures already carried features across).
      // Fire-and-forget; the async addFeatures call will refreshLabels
      // and publish the snapshot once the store is populated.
      void hydrateFromStorage();
      // Self-register imperative commands with the surrounding
      // MeasurementsProvider. Re-registers on basemap-swap reattach so the
      // closures always point at the live draw instance.
      registryRef.current.setCommands({
        clearAll: () => {
          const draw = drawRef.current;
          if (!draw) return;
          try {
            draw.clear();
          } catch (e) {
            console.warn("[carma-measurements] clearAll failed", e);
            return;
          }
          // Reset title counters so the next P/L numbering starts at 1
          // again — a user "delete all" is the right moment to wipe the
          // monotonic sequence, otherwise the next point lands as e.g.
          // P7 with no peers in sight.
          pointCounterRef.current = 0;
          lineCounterRef.current = 0;
          // Push the empty snapshot to context synchronously. The provider
          // writes the empty array back to localforage on the resulting
          // features state change; the `change` event also fires here and
          // takes care of refreshing labels.
          publishSnapshot();
        },
        deleteById: (id) => {
          const draw = drawRef.current;
          if (!draw) return;
          try {
            draw.removeFeatures([String(id)]);
          } catch (e) {
            console.warn("[carma-measurements] deleteById failed", e);
            return;
          }
          publishSnapshot();
        },
        selectFeature: (id) => {
          const draw = drawRef.current;
          if (!draw) return;
          if (selectedIdRef.current === id) return; // idempotent
          // The provider already set its selectedId state; suppress the
          // terra-draw select callback so we don't echo back through
          // publishSelection / onSelectionChange.
          suppressSelectionCallbackRef.current = true;
          try {
            if (selectedIdRef.current && selectedIdRef.current !== id) {
              try {
                draw.deselectFeature(selectedIdRef.current);
              } catch {
                // stale id or already gone — ignore
              }
            }
            draw.selectFeature(id);
            selectedIdRef.current = id;
            hasSelectionRef.current = true;
          } catch (e) {
            console.warn(
              "[carma-measurements] commands.selectFeature failed for id",
              id,
              e
            );
          } finally {
            suppressSelectionCallbackRef.current = false;
          }
        },
        deselectAll: () => {
          const draw = drawRef.current;
          if (!draw) return;
          const current = selectedIdRef.current;
          if (!current) return; // idempotent
          // See selectFeature above — provider state already updated.
          suppressSelectionCallbackRef.current = true;
          try {
            draw.deselectFeature(current);
            selectedIdRef.current = null;
            hasSelectionRef.current = false;
          } catch (e) {
            console.warn(
              "[carma-measurements] commands.deselectAll failed for id",
              current,
              e
            );
          } finally {
            suppressSelectionCallbackRef.current = false;
          }
        },
        updateTitle: (id, customTitle) => {
          const draw = drawRef.current;
          if (!draw) return;
          try {
            draw.updateFeatureProperties(String(id), { customTitle });
          } catch (e) {
            console.warn("[carma-measurements] updateTitle failed", e);
            return;
          }
          publishSnapshot();
        },
      });
    };

    // rAF-throttled snap-preview mousemove handler. Even at 120-200 Hz the
    // pointer can't outpace the screen's repaint, so coalescing to one
    // findSnapTarget per frame is both correct and cheaper.
    let pendingFrame: number | null = null;
    let pendingEvent: {
      containerX: number;
      containerY: number;
      lng: number;
      lat: number;
    } | null = null;
    // Preview dot is meaningful while drawing (point, line, polygon) AND
    // while a measurement is selected in the resting "none" state — vertex
    // drags benefit from snap feedback just as much as new-line drawing.
    // We intentionally don't show it on bare hover in select mode (cursor
    // cruising the map) because that's visually noisy.
    const previewActive = () =>
      snappingEnabledRef.current &&
      (modeRef.current === "point" ||
        modeRef.current === "line" ||
        modeRef.current === "polygon" ||
        ((modeRef.current === "none" || modeRef.current === "select") &&
          hasSelectionRef.current));

    const handleMouseMove = (e: {
      point: { x: number; y: number };
      lngLat: { lng: number; lat: number };
    }) => {
      // Cheap early exit when neither overlay wants this frame — keeps belis
      // (and any host with radiusDebugVisible=false out of a draw mode) at
      // its pre-Phase-2 cost: zero per-frame work in the resting state.
      if (!previewActive() && !radiusLayerVisible()) return;
      pendingEvent = {
        containerX: e.point.x,
        containerY: e.point.y,
        lng: e.lngLat.lng,
        lat: e.lngLat.lat,
      };
      if (pendingFrame !== null) return;
      pendingFrame = requestAnimationFrame(() => {
        pendingFrame = null;
        const ev = pendingEvent;
        pendingEvent = null;
        if (!ev) return;
        // Radius debug circle is independent of `previewActive` — it
        // tracks the cursor whenever snapping is on AND the debug toggle
        // is set, even outside a draw mode.
        if (radiusLayerVisible()) {
          setRadiusCircle([ev.lng, ev.lat]);
        }
        if (!previewActive()) {
          setSnapPreview(null);
          return;
        }
        const hit = findSnapTarget(
          map,
          { x: ev.containerX, y: ev.containerY },
          snapRadiusPxRef.current,
          getCachedSnappableLayerIds(),
          getMeasurementSnapFeatures()
        );
        setSnapPreview(hit ? hit.position : null);
      });
    };
    const handleMouseLeave = () => {
      setSnapPreview(null);
      setRadiusCircle(null);
    };

    // styledata fires whenever the map's style mutates — including the
    // deferred addLayer calls that styleComposer makes after fetching
    // each libreLayer's style URL. Invalidating lazily (set to null)
    // means we don't walk the layer list during pan/zoom tile loads;
    // the next snap query rebuilds it.
    const invalidateSnappableCache = () => {
      snappableLayerIdsRef.current = null;
    };

    // INITIAL ATTACH — robust against MapLibre's "Style is not done loading,
    // rebuilding from scratch" path.
    //
    // When the host app fires `setStyle()` before the initial style finishes
    // loading (which CARMA's LibreMap does in its `updateMapStyle` effect),
    // MapLibre rebuilds the style from scratch and — in that rebuild path —
    // `style.load` does not fire for our listener. Without the safety net
    // below, terra-draw was never created and clicks landed on a bare
    // canvas: "no measurements can be created" on a raster-only basemap
    // (e.g. belis with rvrLight / Liegenschaftskarte / trueOrtho selected).
    //
    // We listen on every event that can mark the style as ready
    // (`style.load`, `load`, `idle`, `styledata`); whichever fires first with
    // a parsed style wins. Subsequent `style.load` events (basemap swap)
    // still trigger a full re-attach via the same `attach()` path.
    //
    // CRITICAL: the readiness check is `isStyleParsed()`, NOT
    // `map.isStyleLoaded()`. The latter additionally requires every source's
    // tiles to have finished loading, which means it stays false during
    // ordinary overlay-layer streaming (geoportal adds layers via
    // styleComposer one-by-one). Gating attach on it caused measurement
    // clicks to be silently dropped until the entire map went idle — the
    // user had to wait for all requests to settle before drawing worked.
    // Terra-draw's adapter only needs the style itself to be parsed
    // (style._loaded === true) to safely register its sources and layers;
    // tiles can keep streaming around it.
    const isStyleParsed = (): boolean => {
      // Fast path: if isStyleLoaded() is true we're definitely good.
      if (map.isStyleLoaded()) return true;
      // Slow path: no public MapLibre API exposes "style is parsed but
      // tiles still loading", so peek at the internal flag. Stable across
      // MapLibre 3.x and 4.x. style._loaded flips to true right before
      // `style.load` fires.
      const internalStyle = (
        map as unknown as { style?: { _loaded?: boolean } }
      ).style;
      return Boolean(internalStyle?._loaded);
    };

    let initialAttachDone = false;
    const tryInitialAttach = () => {
      if (initialAttachDone) return;
      if (!isStyleParsed()) return;
      initialAttachDone = true;
      attach();
    };
    const onStyleLoad = () => {
      // style.load IS the canonical "style is parsed" signal; no gate
      // needed. Always attach (initial) or reattach (basemap swap).
      if (!initialAttachDone) {
        initialAttachDone = true;
      }
      attach();
    };
    const onStyleData = () => {
      invalidateSnappableCache();
      tryInitialAttach();
    };

    tryInitialAttach();
    map.on("style.load", onStyleLoad);
    map.on("load", tryInitialAttach);
    map.on("idle", tryInitialAttach);
    map.on("styledata", onStyleData);
    map.on("mousemove", handleMouseMove);
    map.on("mouseout", handleMouseLeave);

    return () => {
      map.off("style.load", onStyleLoad);
      map.off("load", tryInitialAttach);
      map.off("idle", tryInitialAttach);
      map.off("styledata", onStyleData);
      map.off("mousemove", handleMouseMove);
      map.off("mouseout", handleMouseLeave);
      if (pendingFrame !== null) {
        cancelAnimationFrame(pendingFrame);
        pendingFrame = null;
        pendingEvent = null;
      }
      if (drawRef.current) {
        try {
          drawRef.current.stop();
        } catch {
          // unmount during a stale-style state — same swallow as in attach()
        }
        drawRef.current = null;
      }
      // Unregister from the provider so consumers don't invoke callbacks
      // over a stopped terra-draw instance.
      registryRef.current.setCommands(null);
      // Remove the host-owned render layers and their sources. Without
      // this, conditionally-mounted consumers (geoportal toggles the
      // host on measurement-mode enter/exit) would leak labels and a
      // stale snap dot onto the map after every exit — the source's
      // last data lingers and the layer keeps rendering it. terra-draw
      // cleans up its own `td-*` layers/sources inside stop() above,
      // so we only handle our own ids here.
      for (const layerId of [
        LABEL_LAYER_ID,
        SNAP_PREVIEW_LAYER_ID,
        SNAP_RADIUS_LAYER_ID,
      ]) {
        if (map.getLayer(layerId)) {
          try {
            map.removeLayer(layerId);
          } catch (e) {
            console.warn(
              "[carma-measurements] could not remove layer on unmount",
              layerId,
              e
            );
          }
        }
      }
      for (const sourceId of [
        LABEL_SOURCE_ID,
        SNAP_PREVIEW_SOURCE_ID,
        SNAP_RADIUS_SOURCE_ID,
      ]) {
        if (map.getSource(sourceId)) {
          try {
            map.removeSource(sourceId);
          } catch (e) {
            console.warn(
              "[carma-measurements] could not remove source on unmount",
              sourceId,
              e
            );
          }
        }
      }
    };
  }, [map]);

  // Forward mode changes to the running terra-draw instance after init,
  // and mirror the prop into the provider so consumers can `useMeasurements()`
  // and react to the current draw mode without threading the prop separately.
  useEffect(() => {
    registryRef.current.publishMode(mode);
    const draw = drawRef.current;
    if (!draw) return;
    draw.setMode(toTerraDrawMode(mode));
  }, [mode]);

  // Clear the snap-preview dot the instant snapping is toggled off OR the
  // user leaves a draw mode (back to "none") AND nothing is selected. The
  // selection branch is also covered by the deselect listener inside
  // createDraw, but this effect catches the snapping-off case immediately
  // even without a mousemove.
  useEffect(() => {
    if (!map) return;
    const previewShouldRender =
      snapping &&
      (mode === "point" ||
        mode === "line" ||
        mode === "polygon" ||
        ((mode === "none" || mode === "select") && hasSelectionRef.current));
    if (previewShouldRender) return;
    const source = map.getSource(SNAP_PREVIEW_SOURCE_ID) as
      | GeoJSONSource
      | undefined;
    if (source) source.setData(EMPTY_FC);
  }, [map, snapping, mode]);

  // React to label visibility toggle. The label source is always populated
  // (refreshLabels still runs); only the symbol layer's visibility flips.
  useEffect(() => {
    if (!map) return;
    if (!map.getLayer(LABEL_LAYER_ID)) return;
    map.setLayoutProperty(
      LABEL_LAYER_ID,
      "visibility",
      labelsVisible ? "visible" : "none"
    );
  }, [map, labelsVisible]);

  // React to the snap-radius slider: update the rendered debug circle's
  // pixel size. The actual snap-search radius is read live from
  // snapRadiusPxRef by handleMouseMove and snapToCustom, so changes are
  // picked up on the next pointer event without rebinding anything.
  useEffect(() => {
    if (!map) return;
    if (!map.getLayer(SNAP_RADIUS_LAYER_ID)) return;
    map.setPaintProperty(SNAP_RADIUS_LAYER_ID, "circle-radius", snapRadiusPx);
  }, [map, snapRadiusPx]);

  // React to snap toggle and radius-debug toggle: flip the radius layer's
  // visibility and wipe its source if either is off, so a stale circle
  // doesn't linger.
  useEffect(() => {
    if (!map) return;
    const visible = snapping && radiusDebugVisible;
    if (map.getLayer(SNAP_RADIUS_LAYER_ID)) {
      map.setLayoutProperty(
        SNAP_RADIUS_LAYER_ID,
        "visibility",
        visible ? "visible" : "none"
      );
    }
    if (!visible) {
      const src = map.getSource(SNAP_RADIUS_SOURCE_ID) as
        | GeoJSONSource
        | undefined;
      if (src) src.setData(EMPTY_FC);
    }
  }, [map, snapping, radiusDebugVisible]);

  // React to any snap-target input flip (mode, per-libreLayer opt-ins,
  // background flag): mark the cached layer-id list dirty so the next
  // snap query rebuilds it with the new policy. The walk itself happens
  // lazily inside getCachedSnappableLayerIds.
  useEffect(() => {
    snappableLayerIdsRef.current = null;
  }, [snapMode, optedInLayerIds, backgroundSnapping]);

  // Publish a remove-by-id handle to the module-level slot so external
  // callers (save handlers, helpers) can drop markers. drawRef.current
  // can swap on basemap-driven re-attach, so close over the ref, not the
  // current draw.
  useEffect(() => {
    setActiveRemoveFeatures((ids) => {
      const draw = drawRef.current;
      if (!draw) return;
      try {
        draw.removeFeatures(ids);
      } catch (e) {
        // Unknown id or terra-draw not currently running — non-fatal.
        console.warn("[carma-measurements] removeFeatures failed", e);
      }
    });
    setActiveAddFeatures((features) => {
      const draw = drawRef.current;
      if (!draw) return;
      try {
        draw.addFeatures(features as GeoJSONStoreFeatures[]);
      } catch (e) {
        // Duplicate id or terra-draw not currently running — non-fatal.
        console.warn("[carma-measurements] addFeatures failed", e);
      }
    });
    return () => {
      setActiveRemoveFeatures(null);
      setActiveAddFeatures(null);
    };
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      deleteFeature: (id: string) => {
        const draw = drawRef.current;
        if (!draw) return;
        // Suppress the synchronous `deselect` callback terra-draw fires
        // when removing its currently-selected feature — otherwise the
        // consumer's selection is cleared *before* the onChange snapshot
        // lands, denying any "advance to next item" logic the chance to
        // run against an intact selection.
        suppressSelectionCallbackRef.current = true;
        try {
          draw.removeFeatures([id]);
          // terra-draw's `removeFeatures` fires only the `change` event,
          // and the `change` listener above is deliberately lightweight
          // (no consumer dispatch — would fire 60×/s during drawing).
          // Push the post-delete snapshot to BOTH consumer surfaces here so
          // legacy redux/sidebar (via onChange) AND context consumers (via
          // useMeasurements()) see the removal. Hand-rolled instead of
          // calling publishSnapshot — that function lives in the [map]
          // effect's closure and isn't reachable from this useImperativeHandle.
          try {
            const userFeatures = stripGuidanceFeatures(
              draw.getSnapshot() as Feature[]
            );
            onChangeRef.current?.(userFeatures);
            registryRef.current.publishFeatures(userFeatures);
          } catch (e) {
            console.warn(
              "[carma-measurements] onChange after delete failed",
              e
            );
          }
        } catch (e) {
          console.warn(
            "[carma-measurements] deleteFeature failed for id",
            id,
            e
          );
        } finally {
          suppressSelectionCallbackRef.current = false;
        }
      },
      selectFeature: (id: string) => {
        const draw = drawRef.current;
        if (!draw) return;
        if (selectedIdRef.current === id) return; // idempotent
        suppressSelectionCallbackRef.current = true;
        try {
          // If a different feature is currently selected, deselect it
          // first — terra-draw's selectFeature does not auto-replace.
          if (selectedIdRef.current && selectedIdRef.current !== id) {
            try {
              draw.deselectFeature(selectedIdRef.current);
            } catch {
              // ignore — stale id or already gone
            }
          }
          draw.selectFeature(id);
        } catch (e) {
          console.warn(
            "[carma-measurements] selectFeature failed for id",
            id,
            e
          );
        } finally {
          suppressSelectionCallbackRef.current = false;
        }
      },
      deselectAll: () => {
        const draw = drawRef.current;
        if (!draw) return;
        const current = selectedIdRef.current;
        if (!current) return; // idempotent
        suppressSelectionCallbackRef.current = true;
        try {
          draw.deselectFeature(current);
        } catch (e) {
          console.warn(
            "[carma-measurements] deselectAll failed for id",
            current,
            e
          );
        } finally {
          suppressSelectionCallbackRef.current = false;
        }
      },
      clearAll: () => {
        const draw = drawRef.current;
        if (!draw) return;
        // Skip the empty-store case so we don't fire a spurious onChange
        // that would round-trip an empty `replaceMeasurements` dispatch.
        let hadFeatures = false;
        try {
          hadFeatures =
            (draw.getSnapshot() as Feature[]).filter(isUserFeature).length > 0;
        } catch (e) {
          console.warn(
            "[carma-measurements] clearAll snapshot check failed",
            e
          );
        }
        if (!hadFeatures) return;
        try {
          draw.clear();
        } catch (e) {
          console.warn("[carma-measurements] clearAll failed", e);
          return;
        }
        // terra-draw's `clear()` fires only `change`, not `finish`, so the
        // consumer-facing onChange (which is plumbed to `finish` for noise
        // control) never sees the wipe. Push the post-clear snapshot to
        // BOTH legacy onChange and the context registry here.
        try {
          onChangeRef.current?.([]);
          registryRef.current.publishFeatures([]);
        } catch (e) {
          console.warn(
            "[carma-measurements] onChange after clearAll failed",
            e
          );
        }
      },
    }),
    []
  );

  return null;
});
