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
}

// Side-effect-only component. Lives as a sibling of <CarmaMap> inside the
// same LibreContextProvider; it pulls the maplibre map instance from
// useLibreContext(), creates a TerraDraw instance once the style is ready,
// re-creates it after every basemap swap (terra-draw's adapter has no
// auto-recovery), and renders an in-map label layer with German segment
// lengths for any drawn LineString.
export function MeasurementHost({ mode, onChange }: MeasurementHostProps) {
  const { map } = useLibreContext();
  const drawRef = useRef<TerraDraw | null>(null);
  const modeRef = useRef(mode);
  modeRef.current = mode;
  // Read live so we don't have to rebuild the terra-draw instance every time
  // the consumer hands in a new closure.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!map) return;

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

    const createDraw = () => {
      const draw = new TerraDraw({
        adapter: new TerraDrawMapLibreGLAdapter({ map }),
        modes: [
          new TerraDrawPointMode(),
          new TerraDrawLineStringMode(),
          new TerraDrawSelectMode({
            // Fully editable: drag features, drag/delete vertices, insert
            // midpoints. Polygon flag omitted — polygon mode isn't
            // registered yet so terra-draw never sees a polygon to select.
            flags: {
              point: { feature: { draggable: true } },
              linestring: {
                feature: {
                  draggable: true,
                  coordinates: {
                    midpoints: true,
                    draggable: true,
                    deletable: true,
                  },
                },
              },
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
      draw.on("finish", () => {
        refreshLabels();
        fireOnChange();
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
      refreshLabels();
    };

    if (map.isStyleLoaded()) {
      attach();
    }
    map.on("style.load", attach);

    return () => {
      map.off("style.load", attach);
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

  return null;
}
