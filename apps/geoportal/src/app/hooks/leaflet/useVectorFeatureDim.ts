import { useEffect } from "react";
import type { MutableRefObject } from "react";
import { useSelector } from "react-redux";
import type { Map as MaplibreMap } from "maplibre-gl";

import { getLayersIdle } from "../../store/slices/mapping";

/**
 * Generic per-feature dimming for ALL Geoportal vector layers — the BELIS
 * desktop mechanism (a paint expression keyed on a feature-state), installed
 * at the map level so it needs no per-layer style config and works for any
 * vector layer that gets added.
 *
 * PAINT (dim-by-default): wrap each layer's opacity paint property with
 * `["case", ["boolean", ["feature-state","keepBright"], false], <orig>, DIM]`,
 * so EVERY feature renders dimmed by default and only a feature with
 * `keepBright=true` renders at full opacity. The else-branch covers all
 * non-highlighted features automatically — no enumeration needed.
 *
 * CLICK SIGNAL: in Geoportal the MapLibre canvases are non-interactive
 * overlays inside Leaflet panes, so a raw `map.on("click")` never fires —
 * clicks flow through Leaflet → cismap, which (via `manualSelectionManagement`)
 * calls `map.setFeatureState({...}, { selected: true })` on the clicked
 * feature. We wrap `map.setFeatureState`: whenever cismap flips a feature to
 * `selected:true` we stamp a persistent `keepBright:true` on it, and we never
 * clear it — so every clicked feature becomes (and stays) normal, and they
 * accumulate.
 *
 * WMS/raster layers are unaffected (no per-feature model); this covers the
 * vector case, which is what BELIS-style highlighting targets.
 */

const DIM_OPACITY = 0.25;
const STATE_KEY = "keepBright";
const INSTALLED = "__carmaVectorDimInstalled";

// Opacity paint props per MapLibre layer type.
const OPACITY_PROPS: Record<string, string[]> = {
  fill: ["fill-opacity"],
  line: ["line-opacity"],
  circle: ["circle-opacity", "circle-stroke-opacity"],
  symbol: ["icon-opacity", "text-opacity"],
  "fill-extrusion": ["fill-extrusion-opacity"],
};

const dimBranch = (original: unknown) => [
  "case",
  ["boolean", ["feature-state", STATE_KEY], false],
  original == null ? 1 : original,
  DIM_OPACITY,
];

const installDim = (map: MaplibreMap) => {
  // First-seen original opacity per "<layerId>::<prop>" so re-applies on
  // styledata rebuild from the true original, never from our own wrapper.
  const originals = new Map<string, unknown>();

  const applyPaint = () => {
    for (const layer of map.getStyle()?.layers ?? []) {
      // cismap draws the selection border/highlight in a dedicated style layer
      // whose id contains "selection" — hide it so no border shows.
      if (layer.id.toLowerCase().includes("selection")) {
        try {
          if (map.getLayoutProperty(layer.id, "visibility") !== "none") {
            map.setLayoutProperty(layer.id, "visibility", "none");
          }
        } catch {
          /* ignore */
        }
        continue;
      }
      const props = OPACITY_PROPS[layer.type];
      if (!props) continue;
      for (const prop of props) {
        const key = `${layer.id}::${prop}`;
        if (!originals.has(key)) {
          try {
            originals.set(key, map.getPaintProperty(layer.id, prop) ?? null);
          } catch {
            continue;
          }
        }
        const desired = dimBranch(originals.get(key));
        try {
          // Skip if already our wrapper — avoids a setPaintProperty ->
          // styledata -> applyPaint feedback loop.
          if (
            JSON.stringify(map.getPaintProperty(layer.id, prop)) !==
            JSON.stringify(desired)
          ) {
            map.setPaintProperty(layer.id, prop, desired as never);
          }
        } catch {
          /* paint prop not settable on this layer — ignore */
        }
      }
    }
  };

  applyPaint();
  map.on("styledata", applyPaint);

  // Piggyback on cismap's selection signal: every time it selects a feature,
  // stamp a persistent `keepBright` so all clicked features become normal
  // (un-dimmed) and accumulate.
  const notDimmed = new Map<
    string,
    {
      source: string;
      sourceLayer?: string;
      id: string | number;
      feature?: GeoJSON.Feature;
    }
  >();
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const originalSetFeatureState = map.setFeatureState.bind(map);
  map.setFeatureState = ((
    target: Parameters<MaplibreMap["setFeatureState"]>[0],
    state: Parameters<MaplibreMap["setFeatureState"]>[1]
  ) => {
    originalSetFeatureState(target, state);
    if (state && (state as { selected?: unknown }).selected === true) {
      originalSetFeatureState(target, { [STATE_KEY]: true });
      const t = target as { source: string; sourceLayer?: string; id: string | number };
      // Resolve the real feature (geometry + properties) from the source.
      // Only finds features in currently-loaded tiles/viewport.
      let feature: GeoJSON.Feature | undefined;
      try {
        const isGeojson = map.getSource(t.source)?.type === "geojson";
        feature = map.querySourceFeatures(t.source, {
          ...(isGeojson ? {} : { sourceLayer: t.sourceLayer }),
          filter: ["==", ["id"], t.id],
        } as never)[0] as unknown as GeoJSON.Feature | undefined;
      } catch {
        /* ignore */
      }
      notDimmed.set(`${t.source}::${t.sourceLayer ?? ""}::${t.id}`, {
        source: t.source,
        sourceLayer: t.sourceLayer,
        id: t.id,
        feature,
      });
      // Collected non-dimmed (kept-bright) features so far.
      console.log("xxx [VectorFeatureDim] not dimmed:", [...notDimmed.values()]);
    }
  }) as MaplibreMap["setFeatureState"];
};

const useVectorFeatureDim = (
  maplibreMapsRef: MutableRefObject<Map<string, MaplibreMap>>
) => {
  // `maplibreMapsRef` is a ref (not reactive); `layersIdle` flips once maps
  // are ready, which is our cue to (idempotently) install on new maps.
  const layersIdle = useSelector(getLayersIdle);

  useEffect(() => {
    maplibreMapsRef.current.forEach((map) => {
      const flagged = map as MaplibreMap & { [INSTALLED]?: boolean };
      if (flagged[INSTALLED]) return;
      flagged[INSTALLED] = true;
      installDim(map);
    });
  }, [layersIdle, maplibreMapsRef]);
};

export default useVectorFeatureDim;
