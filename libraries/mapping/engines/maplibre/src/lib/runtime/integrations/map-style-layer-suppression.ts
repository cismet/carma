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

export type RuntimeStyleLayer = {
  id: string;
  type: string;
  source?: unknown;
  "source-layer"?: unknown;
  sourceLayer?: unknown;
  metadata?: Record<string, unknown>;
};

const MAPLIBRE_BASE_SURFACE_LAYER_TYPES = new Set([
  "background",
  "color-relief",
  "fill",
  "fill-extrusion",
  "hillshade",
  "raster",
]);

const MAPLIBRE_LIVE_OVERLAY_LAYER_TYPES = new Set([
  "circle",
  "heatmap",
  "line",
  "symbol",
]);

const OVERLAY_LAYER_HINT =
  /(?:dop[-_:]?overlay|label|road|route|schrift|street|transport)/i;

export const isMapStyleOverlayLayer = (layer: RuntimeStyleLayer): boolean => {
  if (layer.type === "custom") return false;
  if (MAPLIBRE_LIVE_OVERLAY_LAYER_TYPES.has(layer.type)) return true;
  if (!MAPLIBRE_BASE_SURFACE_LAYER_TYPES.has(layer.type)) return true;
  return OVERLAY_LAYER_HINT.test(
    [
      layer.id,
      layer.source,
      layer.sourceLayer ?? layer["source-layer"],
      layer.metadata?.["layer-id"],
    ].join(":")
  );
};

const suppressedStyleLayers = new WeakMap<
  MaplibreMap,
  SuppressedStyleLayersEntry
>();

export const MAPLIBRE_TERRAIN_MESH_BASE_OPACITY = 0;

type MeshCompositionProperty = {
  original: unknown;
  applied: unknown;
};

type MeshCompositionLayer = {
  signature: string;
  properties: Map<string, MeshCompositionProperty>;
};

type MeshCompositionEntry = {
  references: number;
  savedLayers: Map<string, MeshCompositionLayer>;
  apply: () => void;
  unsubscribeStyleReady: () => void;
};

const meshCompositions = new WeakMap<MaplibreMap, MeshCompositionEntry>();

type StyleReadyEntry = {
  revision: number;
  composing: boolean;
  listeners: Set<() => void>;
};

const styleReadyEntries = new WeakMap<MaplibreMap, StyleReadyEntry>();

const getStyleReadyEntry = (map: MaplibreMap): StyleReadyEntry => {
  let entry = styleReadyEntries.get(map);
  if (!entry) {
    entry = { revision: 0, composing: false, listeners: new Set() };
    styleReadyEntries.set(map, entry);
  }
  return entry;
};

/** Mark the interval in which StyleComposer replaces and rebuilds the style. */
export const notifyMapLibreStyleCompositionStarted = (
  map: MaplibreMap
): void => {
  getStyleReadyEntry(map).composing = true;
};

/** Notify integrations after StyleComposer has finished one coherent update. */
export const notifyMapLibreStyleCompositionReady = (map: MaplibreMap): void => {
  const entry = getStyleReadyEntry(map);
  entry.composing = false;
  entry.revision += 1;
  for (const listener of entry.listeners) listener();
};

const getTerrainMeshBaseOpacity = (value: unknown): number =>
  typeof value === "number" && Number.isFinite(value)
    ? Math.min(value, MAPLIBRE_TERRAIN_MESH_BASE_OPACITY)
    : MAPLIBRE_TERRAIN_MESH_BASE_OPACITY;

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
 * Keep MapLibre terrain enabled as the draping surface for the host style,
 * while a Three.js terrain mesh supplies the visible ground. Base rasters and
 * land-cover fills become fully transparent; roads, linework, labels,
 * and explicitly named overlay rasters retain their authored opacity.
 */
export const acquireMapLibreTerrainMeshComposition = (
  map: MaplibreMap
): (() => void) => {
  const existing = meshCompositions.get(map);
  if (existing) {
    existing.references += 1;
  } else {
    const savedLayers = new Map<string, MeshCompositionLayer>();
    let applying = false;

    const apply = () => {
      if (applying) return;
      applying = true;
      try {
        let layers: RuntimeStyleLayer[];
        try {
          layers = (map.getStyle()?.layers ?? []) as RuntimeStyleLayer[];
        } catch {
          return;
        }

        const currentLayerIds = new Set(layers.map(({ id }) => id));
        for (const layerId of savedLayers.keys()) {
          if (!currentLayerIds.has(layerId)) savedLayers.delete(layerId);
        }

        for (const layer of layers) {
          if (layer.type === "custom" || isMapStyleOverlayLayer(layer)) {
            continue;
          }
          const opacityProperties = getMapLibreLayerOpacityProperties(
            layer.type
          );
          if (opacityProperties.length === 0) continue;

          const signature = getLayerSignature(layer);
          let savedLayer = savedLayers.get(layer.id);
          if (!savedLayer || savedLayer.signature !== signature) {
            savedLayer = { signature, properties: new Map() };
            savedLayers.set(layer.id, savedLayer);
          }

          for (const property of opacityProperties) {
            try {
              const current = map.getPaintProperty(layer.id, property);
              let savedProperty = savedLayer.properties.get(property);
              // A style composer or opacity slider may legitimately replace
              // the authored value while the mesh is mounted. Adopt it as the
              // new restore value, then immediately re-apply composition.
              if (!savedProperty || current !== savedProperty.applied) {
                savedProperty = {
                  original: current,
                  applied: getTerrainMeshBaseOpacity(current),
                };
                savedLayer.properties.set(property, savedProperty);
              }
              if (current !== savedProperty.applied) {
                map.setPaintProperty(layer.id, property, savedProperty.applied);
              }
            } catch {
              // A style rebuild can remove a layer between inspection and set.
            }
          }
        }
      } finally {
        applying = false;
      }
    };

    const styleReadyEntry = getStyleReadyEntry(map);
    const onStyleReady = () => apply();
    styleReadyEntry.listeners.add(onStyleReady);
    const entry = {
      references: 1,
      savedLayers,
      apply,
      unsubscribeStyleReady: () =>
        styleReadyEntry.listeners.delete(onStyleReady),
    };
    meshCompositions.set(map, entry);
    // If the base style was already fully composed before this mesh mounted,
    // one application is sufficient. Otherwise StyleComposer notifies us at
    // the end of its current update.
    if (styleReadyEntry.revision > 0 && !styleReadyEntry.composing) apply();
  }

  let released = false;
  return () => {
    if (released) return;
    released = true;
    const entry = meshCompositions.get(map);
    if (!entry) return;
    entry.references -= 1;
    if (entry.references > 0) return;

    entry.unsubscribeStyleReady();
    meshCompositions.delete(map);
    for (const [layerId, savedLayer] of entry.savedLayers) {
      let runtimeLayer: unknown;
      try {
        runtimeLayer = map.getLayer(layerId);
      } catch {
        continue;
      }
      if (
        !runtimeLayer ||
        getLayerSignature(runtimeLayer as RuntimeStyleLayer) !==
          savedLayer.signature
      ) {
        continue;
      }
      for (const [property, savedProperty] of savedLayer.properties) {
        try {
          if (
            map.getPaintProperty(layerId, property) === savedProperty.applied
          ) {
            map.setPaintProperty(
              layerId,
              property,
              savedProperty.original === undefined
                ? null
                : savedProperty.original
            );
          }
        } catch {
          // The map or style may already be gone during React cleanup.
        }
      }
    }
  };
};

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
