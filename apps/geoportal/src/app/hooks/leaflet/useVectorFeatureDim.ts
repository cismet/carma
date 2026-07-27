import { useEffect } from "react";
import type { MutableRefObject } from "react";
import { useSelector } from "react-redux";
import type { Map as MaplibreMap } from "maplibre-gl";

import { useMapHighlight } from "@carma-mapping/engines/maplibre";

import { getLayersIdle } from "../../store/slices/mapping";

/**
 * Installs the dim paint expression on every Geoportal vector layer map — but
 * only while highlighting is actually on.
 *
 * BELIS ships this expression in its style config (`fachobjekteLayers.ts`) and
 * gates it with `["global-state", "highlightingEnabled"]`. Geoportal can't do
 * either: each visible vector layer is its own MapLibre instance with a style
 * fetched from the layer catalog at runtime, so there is no config file to
 * edit — and a `global-state` reference injected after layer creation via
 * `setPaintProperty` is not reliably registered as a repaint trigger.
 *
 * So instead of gating inside the expression, we gate by installing it:
 *
 *   highlighting off -> paint properties are the layer's originals (untouched)
 *   highlighting on  -> ["case", ["boolean", ["feature-state","highlighted"], false],
 *                          <original>,   // highlighted -> normal
 *                          DIM]          // everything else -> dimmed
 *
 * `originals` is captured on first sight per "<layerId>::<prop>", so toggling
 * off restores the true original and toggling on never wraps a wrapper.
 *
 * Applying the state is NOT this hook's job: `useMapHighlighting` (bound per
 * map by `VectorHighlightBindings`) owns the `highlighted` feature-state,
 * including re-applying it to features from newly loaded tiles.
 */

const DIM_OPACITY = 0.25;
const STATE_KEY = "highlighted";
const CONTROLLER = "__carmaVectorDimController";

// Opacity paint props per MapLibre layer type.
const OPACITY_PROPS: Record<string, string[]> = {
  fill: ["fill-opacity"],
  line: ["line-opacity"],
  circle: ["circle-opacity", "circle-stroke-opacity"],
  symbol: ["icon-opacity", "text-opacity"],
  "fill-extrusion": ["fill-extrusion-opacity"],
};

// Layers we must not dim: cismap's selection border and the basemap.
const isExcludedLayer = (layerId: string) => {
  const id = layerId.toLowerCase();
  return id.includes("selection") || id.includes("background");
};

const dimBranch = (original: unknown) => [
  "case",
  ["boolean", ["feature-state", STATE_KEY], false],
  original == null ? 1 : original,
  DIM_OPACITY,
];

interface DimController {
  setActive: (active: boolean) => void;
}

const createController = (map: MaplibreMap): DimController => {
  // First-seen original opacity per "<layerId>::<prop>", so we always wrap and
  // unwrap from the true original, never from our own expression.
  const originals = new Map<string, unknown>();
  let active = false;

  const apply = () => {
    let changed = 0;
    for (const layer of map.getStyle()?.layers ?? []) {
      if (isExcludedLayer(layer.id)) continue;
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
        const original = originals.get(key);
        const desired = active ? dimBranch(original) : original;
        try {
          // Skip if already applied — avoids a setPaintProperty -> styledata
          // -> apply feedback loop.
          if (
            JSON.stringify(map.getPaintProperty(layer.id, prop)) !==
            JSON.stringify(desired)
          ) {
            map.setPaintProperty(
              layer.id,
              prop,
              (desired ?? undefined) as never
            );
            changed++;
          }
        } catch (e) {
          console.log("xxx [dim] setPaintProperty failed", layer.id, prop, e);
        }
      }
    }
    console.log("xxx [dim] apply", { active, changed });
  };

  // Style rebuilds (a layer added/removed) drop our expression — reinstall.
  map.on("styledata", () => {
    if (active) apply();
  });

  return {
    setActive: (next: boolean) => {
      if (next === active) return;
      active = next;
      apply();
    },
  };
};

const useVectorFeatureDim = (
  maplibreMapsRef: MutableRefObject<Map<string, MaplibreMap>>
) => {
  // `maplibreMapsRef` is a ref (not reactive); `layersIdle` flips once maps
  // are ready, which is our cue to pick up newly created maps.
  const layersIdle = useSelector(getLayersIdle);
  const { highlightingActive } = useMapHighlight();

  useEffect(() => {
    maplibreMapsRef.current.forEach((map) => {
      const holder = map as MaplibreMap & { [CONTROLLER]?: DimController };
      if (!holder[CONTROLLER]) holder[CONTROLLER] = createController(map);
      holder[CONTROLLER].setActive(highlightingActive);
    });
  }, [layersIdle, highlightingActive, maplibreMapsRef]);
};

export default useVectorFeatureDim;
