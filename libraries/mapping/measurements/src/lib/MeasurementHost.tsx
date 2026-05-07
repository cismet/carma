import { useEffect, useRef } from "react";
import { useLibreContext } from "@carma-mapping/engines/maplibre";
import {
  TerraDraw,
  TerraDrawPointMode,
  TerraDrawLineStringMode,
  TerraDrawSelectMode,
} from "terra-draw";
import type { GeoJSONStoreFeatures } from "terra-draw";
import { TerraDrawMapLibreGLAdapter } from "terra-draw-maplibre-gl-adapter";
import type { Feature } from "geojson";
import type { GeoJSONSource } from "maplibre-gl";

import type { DrawMode } from "./MeasurementControls";
import {
  LABEL_LAYER_ID,
  LABEL_SOURCE_ID,
  buildLabelFeatures,
} from "./labels";
import {
  findSnapTarget,
  getOptOutSnappableLayerIds,
} from "./snapping";

const DEFAULT_SNAP_RADIUS_PX = 20;
const SNAP_PREVIEW_SOURCE_ID = "carma-measurements-snap-preview";
const SNAP_PREVIEW_LAYER_ID = "carma-measurements-snap-preview-circle";

const EMPTY_FC = { type: "FeatureCollection" as const, features: [] };

type TerraDrawMode = "select" | "point" | "linestring" | "static";

function toTerraDrawMode(mode: DrawMode): TerraDrawMode {
  switch (mode) {
    case "point":
      return "point";
    case "line":
      return "linestring";
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
  /** Notified with the current terra-draw snapshot at "stable" moments —
   * specifically on terra-draw's `finish` event (line completed via
   * double-click, point dropped, etc.). It does NOT fire on every per-cursor
   * `change` (those storm at 60+/sec during drawing and would create a
   * dispatch flood for any redux-backed consumer); it also does not yet
   * fire on select-mode edits or deletes — see the lib's PLANNING doc for
   * the follow-up that wires those in.
   *
   * Consumers typically dispatch the snapshot into app-level state for
   * sidebar listing, persistence, or hand-off into another form. */
  onChange?: (features: Feature[]) => void;
  /** When true, line drawing snaps to nearby vertices (and falls back to
   * the closest point on a segment) of the host map's rendered features.
   * Snap-target layers are determined by the "opt-out" rule: every line /
   * fill / circle layer is in unless it explicitly carries
   * `metadata.carmaConf.skipSnapping = true`. Toggling this prop is cheap
   * — terra-draw is not rebuilt; the snap callback reads the live value
   * via a ref. */
  snapping?: boolean;
}

// Side-effect-only component. Lives as a sibling of <CarmaMap> inside the
// same LibreContextProvider; it pulls the maplibre map instance from
// useLibreContext(), creates a TerraDraw instance once the style is ready,
// re-creates it after every basemap swap (terra-draw's adapter has no
// auto-recovery), and renders an in-map label layer with German segment
// lengths for any drawn LineString.
export function MeasurementHost({
  mode,
  onChange,
  snapping = false,
}: MeasurementHostProps) {
  const { map } = useLibreContext();
  const drawRef = useRef<TerraDraw | null>(null);
  const modeRef = useRef(mode);
  modeRef.current = mode;
  // Read live so we don't have to rebuild the terra-draw instance every time
  // the consumer hands in a new closure.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  // Snapping state is mirrored into refs so the snap callback baked into
  // terra-draw at construction time always sees the current value without
  // requiring a rebuild on toggle.
  const snappingEnabledRef = useRef(snapping);
  snappingEnabledRef.current = snapping;
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
  // The most recently computed snap target (or null when nothing is in
  // range). Mirrors what the preview dot shows; read at finish-time to
  // post-hoc snap a freshly-created point. Necessary because
  // TerraDrawPointMode does not accept a snapping config the way
  // LineString and Polygon modes do — there's no mode-level hook to
  // adjust the click position before the point is committed, so we
  // mutate the geometry afterwards.
  const lastSnapTargetRef = useRef<[number, number] | null>(null);

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
            // Works against the cismet glyphs server (overrideGlyphs is set
            // by every CARMA app at the CarmaMap level).
            "text-font": ["Noto Sans Regular"],
            "text-size": 12,
            "text-anchor": "center",
            // Lift segment labels just above the line so the stroke doesn't
            // bisect the text. Single offset works fine across orientations
            // — per-segment normals would be over-engineering for now.
            "text-offset": [
              "case",
              ["==", ["get", "kind"], "segment"],
              ["literal", [0, -0.8]],
              ["literal", [0, 0]],
            ],
            "text-allow-overlap": false,
            "text-ignore-placement": false,
          },
          paint: {
            "text-color": "#111",
            "text-halo-color": "#fff",
            "text-halo-width": 2,
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
        source.setData(
          buildLabelFeatures(draw.getSnapshot() as Feature[])
        );
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

    const fireOnChange = () => {
      const draw = drawRef.current;
      if (!draw) return;
      const cb = onChangeRef.current;
      if (!cb) return;
      try {
        cb(draw.getSnapshot() as Feature[]);
      } catch (e) {
        console.warn("[carma-measurements] onChange callback failed", e);
      }
    };

    // Lazy cache reader: rebuild only when the styledata listener has
    // marked the cache dirty. The walk itself is cheap (~50 layers) but
    // we'd rather not do it 60+/sec while drawing.
    const getCachedSnappableLayerIds = (): string[] => {
      if (snappableLayerIdsRef.current === null) {
        snappableLayerIdsRef.current = getOptOutSnappableLayerIds(map);
      }
      return snappableLayerIdsRef.current;
    };

    // Same callback shape used by both LineString and (future) Polygon
    // modes. terra-draw treats `undefined` as "no snap, use raw cursor".
    const snapToCustom = (event: {
      containerX: number;
      containerY: number;
    }) => {
      if (!snappingEnabledRef.current) return undefined;
      const hit = findSnapTarget(
        map,
        { x: event.containerX, y: event.containerY },
        DEFAULT_SNAP_RADIUS_PX,
        getCachedSnappableLayerIds()
      );
      return hit?.position;
    };

    const createDraw = () => {
      const draw = new TerraDraw({
        adapter: new TerraDrawMapLibreGLAdapter({ map }),
        modes: [
          new TerraDrawPointMode(),
          new TerraDrawLineStringMode({
            // toLine + toCoordinate snap to terra-draw's OWN draft features
            // (e.g. the in-progress line itself); toCustom snaps to layers
            // outside terra-draw's store via `snapToCustom`.
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
            // — the released vertex lands on the snap target). Polygon
            // flag omitted; polygon mode isn't registered yet so terra-
            // draw never sees a polygon to select.
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
      draw.on("change", refreshLabels);
      // `finish` is terra-draw's "feature is now committed" event (line
      // double-clicked, point dropped). Stable enough to push into redux /
      // app state. See the prop docstring for the trade-off (edits and
      // deletes don't currently propagate; will need extra listeners).
      draw.on("finish", (id) => {
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
                number,
              ];
              const screen = map.project([lng, lat]);
              const hit = findSnapTarget(
                map,
                { x: screen.x, y: screen.y },
                DEFAULT_SNAP_RADIUS_PX,
                getCachedSnappableLayerIds()
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
            console.warn(
              "[carma-measurements] post-hoc point snap failed",
              e
            );
          }
        }
        refreshLabels();
        fireOnChange();
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
      draw.on("select", () => {
        hasSelectionRef.current = true;
      });
      draw.on("deselect", () => {
        hasSelectionRef.current = false;
        // No selection means no expected vertex drag in the immediate
        // future; clear any stale preview so it doesn't hang at the last
        // hovered position.
        if (modeRef.current === "none") {
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
          snapshot = previousDraw.getSnapshot();
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
        }
      } else {
        drawRef.current = createDraw();
      }
      ensureLabelLayer();
      ensureSnapPreviewLayer();
      refreshLabels();
      // Wipe any stale dot left over from the previous style; the next
      // mousemove will paint it back if a snap target is in range.
      setSnapPreview(null);
    };

    // rAF-throttled snap-preview mousemove handler. Even at 120-200 Hz the
    // pointer can't outpace the screen's repaint, so coalescing to one
    // findSnapTarget per frame is both correct and cheaper.
    let pendingFrame: number | null = null;
    let pendingEvent: { containerX: number; containerY: number } | null = null;
    // Preview dot is meaningful while drawing (point or line) AND while a
    // measurement is selected in the resting "none" state — vertex drags
    // benefit from snap feedback just as much as new-line drawing. We
    // intentionally don't show it on bare hover in select mode (cursor
    // cruising the map) because that's visually noisy.
    const previewActive = () =>
      snappingEnabledRef.current &&
      (modeRef.current === "point" ||
        modeRef.current === "line" ||
        (modeRef.current === "none" && hasSelectionRef.current));

    const handleMouseMove = (e: { point: { x: number; y: number } }) => {
      if (!previewActive()) return;
      pendingEvent = { containerX: e.point.x, containerY: e.point.y };
      if (pendingFrame !== null) return;
      pendingFrame = requestAnimationFrame(() => {
        pendingFrame = null;
        const ev = pendingEvent;
        pendingEvent = null;
        if (!ev) return;
        if (!previewActive()) {
          setSnapPreview(null);
          return;
        }
        const hit = findSnapTarget(
          map,
          { x: ev.containerX, y: ev.containerY },
          DEFAULT_SNAP_RADIUS_PX,
          getCachedSnappableLayerIds()
        );
        setSnapPreview(hit ? hit.position : null);
      });
    };
    const handleMouseLeave = () => {
      setSnapPreview(null);
    };

    // styledata fires whenever the map's style mutates — including the
    // deferred addLayer calls that styleComposer makes after fetching
    // each libreLayer's style URL. Invalidating lazily (set to null)
    // means we don't walk the layer list during pan/zoom tile loads;
    // the next snap query rebuilds it.
    const invalidateSnappableCache = () => {
      snappableLayerIdsRef.current = null;
    };

    if (map.isStyleLoaded()) {
      attach();
    }
    map.on("style.load", attach);
    map.on("styledata", invalidateSnappableCache);
    map.on("mousemove", handleMouseMove);
    map.on("mouseout", handleMouseLeave);

    return () => {
      map.off("style.load", attach);
      map.off("styledata", invalidateSnappableCache);
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
    };
  }, [map]);

  // Forward mode changes to the running terra-draw instance after init.
  useEffect(() => {
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
        (mode === "none" && hasSelectionRef.current));
    if (previewShouldRender) return;
    const source = map.getSource(SNAP_PREVIEW_SOURCE_ID) as
      | GeoJSONSource
      | undefined;
    if (source) source.setData(EMPTY_FC);
  }, [map, snapping, mode]);

  return null;
}
