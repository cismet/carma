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
 * PAINT: wrap each layer's opacity paint property with
 * `["case", ["boolean", ["feature-state","dimmed"], false], DIM, <orig>]`,
 * so any feature with `dimmed=true` renders at reduced opacity.
 *
 * CLICK SIGNAL: in Geoportal the MapLibre canvases are non-interactive
 * overlays inside Leaflet panes, so a raw `map.on("click")` never fires —
 * clicks flow through Leaflet → cismap, which (via `manualSelectionManagement`)
 * calls `map.setFeatureState({...}, { selected: true })` on the clicked
 * feature. But cismap keeps only ONE feature selected (it resets the previous
 * one), so we cannot reuse `selected` to dim ALL clicked features. Instead we
 * wrap `map.setFeatureState`: whenever cismap flips a feature to
 * `selected:true` we also stamp a persistent `dimmed:true` on it, and we never
 * clear `dimmed` — so every clicked feature stays dimmed and they accumulate.
 *
 * WMS/raster layers are unaffected (no per-feature model); this covers the
 * vector case, which is what BELIS-style highlighting targets.
 */

const DIM_OPACITY = 0.25;
const STATE_KEY = "dimmed";
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
  DIM_OPACITY,
  original == null ? 1 : original,
];

const installDim = (map: MaplibreMap) => {
  // First-seen original opacity per "<layerId>::<prop>" so re-applies on
  // styledata rebuild from the true original, never from our own wrapper.
  const originals = new Map<string, unknown>();

  const applyPaint = () => {
    for (const layer of map.getStyle()?.layers ?? []) {
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
  // also stamp a persistent `dimmed` so all clicked features accumulate.
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const originalSetFeatureState = map.setFeatureState.bind(map);
  map.setFeatureState = ((
    target: Parameters<MaplibreMap["setFeatureState"]>[0],
    state: Parameters<MaplibreMap["setFeatureState"]>[1]
  ) => {
    originalSetFeatureState(target, state);
    if (state && (state as { selected?: unknown }).selected === true) {
      originalSetFeatureState(target, { [STATE_KEY]: true });
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
