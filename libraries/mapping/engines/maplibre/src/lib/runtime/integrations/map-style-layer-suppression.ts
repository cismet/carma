import type { Map as MaplibreMap } from "maplibre-gl";

const MAPLIBRE_LAYER_OPACITY_PROPERTIES = {
  background: ["background-opacity"],
  circle: ["circle-opacity", "circle-stroke-opacity"],
  "color-relief": ["color-relief-opacity"],
  fill: ["fill-opacity"],
  "fill-extrusion": ["fill-extrusion-opacity"],
  heatmap: ["heatmap-opacity"],
  line: ["line-opacity"],
  raster: ["raster-opacity"],
  symbol: ["icon-opacity", "text-opacity"],
} as const satisfies Record<string, readonly string[]>;

type SavedLayerRendering =
  | {
      mode: "paint";
      signature: string;
      properties: Array<[name: string, value: unknown]>;
    }
  | {
      mode: "layout";
      signature: string;
      visibility: unknown;
    };

type SuppressedStyleLayersEntry = {
  references: number;
  savedLayers: Map<string, SavedLayerRendering>;
  suppressLayers: () => void;
  prepareForStyleLoad: () => void;
};

type RuntimeStyleLayer = {
  id: string;
  type: string;
  source?: unknown;
  "source-layer"?: unknown;
  sourceLayer?: unknown;
};

const suppressedStyleLayers = new WeakMap<
  MaplibreMap,
  SuppressedStyleLayersEntry
>();

export const getMapLibreLayerOpacityProperties = (
  layerType: string
): readonly string[] => MAPLIBRE_LAYER_OPACITY_PROPERTIES[layerType] ?? [];

const getLayerSignature = (layer: {
  type: string;
  source?: unknown;
  "source-layer"?: unknown;
  sourceLayer?: unknown;
}) =>
  `${layer.type}:${String(layer.source)}:${String(
    layer.sourceLayer ?? layer["source-layer"]
  )}`;

/**
 * Temporarily hides regular MapLibre style rendering without hiding custom
 * layers. Paint opacity is preferred because source layers must remain
 * logically visible for custom Three.js layers that consume their features.
 */
export const suppressMapLibreRegularStyleLayers = (
  map: MaplibreMap
): (() => void) => {
  const existing = suppressedStyleLayers.get(map);
  if (existing) {
    existing.references += 1;
  } else {
    const savedLayers = new Map<string, SavedLayerRendering>();
    let resetOnNextStyleData = false;

    const suppressLayers = () => {
      let layers: RuntimeStyleLayer[];
      try {
        layers = (map.getStyle()?.layers ?? []) as RuntimeStyleLayer[];
      } catch {
        return;
      }
      if (resetOnNextStyleData) {
        savedLayers.clear();
        resetOnNextStyleData = false;
      }

      const currentLayerIds = new Set(layers.map((layer) => layer.id));
      for (const layerId of savedLayers.keys()) {
        if (!currentLayerIds.has(layerId)) savedLayers.delete(layerId);
      }

      for (const layer of layers) {
        if (layer.type === "custom") continue;
        const signature = getLayerSignature(layer);
        const saved = savedLayers.get(layer.id);
        if (saved && saved.signature !== signature)
          savedLayers.delete(layer.id);

        const opacityProperties = getMapLibreLayerOpacityProperties(layer.type);
        if (opacityProperties.length > 0) {
          let paintSaved = savedLayers.get(layer.id);
          if (!paintSaved) {
            try {
              paintSaved = {
                mode: "paint",
                signature,
                properties: opacityProperties.map((property) => [
                  property,
                  map.getPaintProperty(layer.id, property),
                ]),
              };
              savedLayers.set(layer.id, paintSaved);
            } catch {
              continue;
            }
          }
          if (paintSaved.mode !== "paint") continue;
          for (const [property] of paintSaved.properties) {
            try {
              if (map.getPaintProperty(layer.id, property) !== 0) {
                map.setPaintProperty(layer.id, property, 0);
              }
            } catch {
              // The layer may disappear during a style rebuild.
            }
          }
          continue;
        }

        let layoutSaved = savedLayers.get(layer.id);
        if (!layoutSaved) {
          try {
            layoutSaved = {
              mode: "layout",
              signature,
              visibility: map.getLayoutProperty(layer.id, "visibility"),
            };
            savedLayers.set(layer.id, layoutSaved);
          } catch {
            continue;
          }
        }
        if (layoutSaved.mode !== "layout") continue;
        try {
          if (map.getLayoutProperty(layer.id, "visibility") !== "none") {
            map.setLayoutProperty(layer.id, "visibility", "none");
          }
        } catch {
          // The layer may disappear during a style rebuild.
        }
      }
    };

    const prepareForStyleLoad = () => {
      resetOnNextStyleData = true;
    };
    const entry = {
      references: 1,
      savedLayers,
      suppressLayers,
      prepareForStyleLoad,
    };
    suppressedStyleLayers.set(map, entry);
    map.on("styledataloading", prepareForStyleLoad);
    map.on("styledata", suppressLayers);
    suppressLayers();
  }

  let restored = false;
  return () => {
    if (restored) return;
    restored = true;
    const entry = suppressedStyleLayers.get(map);
    if (!entry) return;
    entry.references -= 1;
    if (entry.references > 0) return;

    map.off("styledataloading", entry.prepareForStyleLoad);
    map.off("styledata", entry.suppressLayers);
    suppressedStyleLayers.delete(map);
    for (const [layerId, saved] of entry.savedLayers) {
      try {
        const layer = map.getLayer(layerId);
        if (!layer || getLayerSignature(layer) !== saved.signature) continue;
        if (saved.mode === "paint") {
          for (const [property, value] of saved.properties) {
            map.setPaintProperty(
              layerId,
              property,
              value === undefined ? null : value
            );
          }
        } else {
          map.setLayoutProperty(
            layerId,
            "visibility",
            saved.visibility === undefined ? null : saved.visibility
          );
        }
      } catch {
        // Nothing remains to restore after map/style teardown.
      }
    }
  };
};
