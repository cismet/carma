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
  layout?: Record<string, unknown>;
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

const LOCATION_LABEL_HINT =
  /(?:^|[-_:])(place|settlement|locality|city|town|village|municipality|district|borough|suburb|neighbou?rhood|quarter|ort|stadt|gemeinde|bezirk)(?:$|[-_:])/i;

// The layer signature joins id, source and source-layer with ":", so a name
// that ends a layer id is followed by ":" rather than by "_" or the end.
const BASEMAP_DE_LOCATION_LABEL_HINT =
  /(?:^|[-_:])Name_(?:Staat(?:_DE)?|Bundesland|Landeshauptstadt|Stadtgemeinde(?:[-_:]|$)|Landgemeinde(?:[-_:]|$)|Ortsteil_(?:Gemeindeteil|Stadtteil)(?:[-_:]|$)|Wohnplatz(?:[-_:]|$))/i;

const ROAD_LABEL_HINT =
  /(?:road|street|strasse|stra(?:ss|ß)e|highway|motorway|transport|route|autobahn|verkehr|fahrbahn|fernverkehr|bundesstra)/i;

/**
 * Point-anchored MapLibre symbols can be redrawn after the shared Three layer
 * without duplicating the draped line labels. This includes place names,
 * house numbers, POIs, and point road shields. Only a literal or omitted
 * `symbol-placement` counts as point-anchored: a zoom function or expression
 * (basemap.de street names switch between `line` and `line-center`) follows
 * line features at some zoom and stays in the draped style.
 */
export const isMapStylePointLabelLayer = (
  layer: RuntimeStyleLayer
): boolean => {
  if (layer.type !== "symbol") return false;
  const placement = layer.layout?.["symbol-placement"];
  return placement === undefined || placement === "point";
};

/** Identify road and route shields whose authored text/icon colors stay intact. */
export const isMapStyleRoadLabelLayer = (layer: RuntimeStyleLayer): boolean => {
  if (layer.type !== "symbol") return false;
  const signature = [
    layer.id,
    layer.source,
    layer.sourceLayer ?? layer["source-layer"],
    layer.metadata?.["layer-id"],
  ].join(":");
  return ROAD_LABEL_HINT.test(signature);
};

const WATER_LABEL_HINT =
  /(?:gewaesser|gewässer|wasser|water|river|fluss|bach|see(?:n|$|[-_:])|lake|teich|kanal|hafen)/i;

const HOUSE_NUMBER_LABEL_HINT =
  /(?:hausnummer|hauskoordinate|house[-_ ]?number|housenumber|housenum|addr)/i;

const getLayerHintSignature = (layer: RuntimeStyleLayer): string =>
  [
    layer.id,
    layer.source,
    layer.sourceLayer ?? layer["source-layer"],
    layer.metadata?.["layer-id"],
  ].join(":");

const ROAD_SHIELD_HINT = /(?:^|[-_:])(?:nummer|shield|route[-_ ]?ref)/i;

/**
 * Road shields: point-anchored route numbers on their own icon backdrop.
 * Their authored text and fill stay untouched in every mode. Station and
 * stop names also live in `Verkehrspunkt`, but they are plain labels.
 */
export const isMapStyleRoadShieldLayer = (layer: RuntimeStyleLayer): boolean =>
  isMapStylePointLabelLayer(layer) &&
  ROAD_SHIELD_HINT.test(getLayerHintSignature(layer));

const ELEVATION_HINT =
  /(?:hoehenlinie|hoehenzahl|hoehenpunkt|höhenlinie|contour|isohypse|elevation)/i;

/** Contour lines stay in the mesh drape; every other line or fill is hidden. */
export const isMapStyleContourLineLayer = (layer: RuntimeStyleLayer): boolean =>
  layer.type === "line" && ELEVATION_HINT.test(getLayerHintSignature(layer));

/** Contour and spot-height labels: sun colored without a halo on the mesh. */
export const isMapStyleElevationLabelLayer = (
  layer: RuntimeStyleLayer
): boolean =>
  layer.type === "symbol" && ELEVATION_HINT.test(getLayerHintSignature(layer));

/** Water names keep their authored blue and lose their halo on the mesh drape. */
export const isMapStyleWaterLabelLayer = (layer: RuntimeStyleLayer): boolean =>
  layer.type === "symbol" &&
  WATER_LABEL_HINT.test(getLayerHintSignature(layer));

/** House numbers are styled like street names on the mesh drape. */
export const isMapStyleHouseNumberLabelLayer = (
  layer: RuntimeStyleLayer
): boolean =>
  layer.type === "symbol" &&
  HOUSE_NUMBER_LABEL_HINT.test(getLayerHintSignature(layer));

/** Point-based place names that may remain crisp above the shaded scene. */
export const isMapStyleLocationLabelLayer = (
  layer: RuntimeStyleLayer
): boolean => {
  if (!isMapStylePointLabelLayer(layer)) return false;
  const signature = [
    layer.id,
    layer.source,
    layer.sourceLayer ?? layer["source-layer"],
    layer.metadata?.["layer-id"],
  ].join(":");
  if (ROAD_LABEL_HINT.test(signature)) return false;
  return (
    BASEMAP_DE_LOCATION_LABEL_HINT.test(signature) ||
    LOCATION_LABEL_HINT.test(signature)
  );
};

export type MapStyleLocationLabelFlatOffset = readonly [
  horizontalEm: number,
  verticalEm: number
];

/** Flat screen-space lift for point labels, ranked by place prominence. */
export const getMapStyleLocationLabelFlatOffset = (
  layer: RuntimeStyleLayer
): MapStyleLocationLabelFlatOffset | null => {
  if (!isMapStyleLocationLabelLayer(layer)) return null;
  const signature = [layer.id, layer.metadata?.["layer-id"]].join(":");

  if (
    /Name_(?:Staat(?:_DE)?|Bundesland|Landeshauptstadt|Stadtgemeinde_(?:groesser_1Mio|bis_1Mio))/i.test(
      signature
    )
  ) {
    return [0, -3];
  }
  if (/Name_Stadtgemeinde_(?:bis_500000|bis_200000)/i.test(signature)) {
    return [0, -2.5];
  }
  if (/Name_Stadtgemeinde_/i.test(signature)) return [0, -2];
  if (/Name_Landgemeinde_/i.test(signature)) return [0, -1.5];
  if (/Name_Ortsteil_(?:Gemeindeteil|Stadtteil)_/i.test(signature)) {
    return [0, -1];
  }
  if (/Name_Wohnplatz_/i.test(signature)) return [0, -0.65];
  return [0, -1.5];
};

/**
 * Height above the ground at which a place name floats over the 3D scene,
 * ranked by place prominence. `null` for anything but place names.
 */
export const getMapStyleLocationLabelLiftMeters = (
  layer: RuntimeStyleLayer
): number | null => {
  if (!isMapStyleLocationLabelLayer(layer)) return null;
  const signature = [layer.id, layer.metadata?.["layer-id"]].join(":");
  if (
    /Name_(?:Staat(?:_DE)?|Bundesland|Landeshauptstadt|Stadtgemeinde_(?:groesser_1Mio|bis_1Mio))/i.test(
      signature
    )
  ) {
    return 600;
  }
  if (/Name_Stadtgemeinde_(?:bis_500000|bis_200000)/i.test(signature)) {
    return 500;
  }
  if (/Name_Stadtgemeinde_/i.test(signature)) return 400;
  if (/Name_Landgemeinde_/i.test(signature)) return 350;
  if (/Name_Wohnplatz_/i.test(signature)) return 150;
  return 300;
};

/** Small lift that keeps house numbers and POI names just above the mesh. */
export const POINT_LABEL_LIFT_METERS = 10;

/**
 * Height above the ground for any point-anchored label: place names by
 * prominence, shields not at all, everything else (house numbers, POIs,
 * stations) a few meters so the text clears the mesh surface.
 */
export const getMapStylePointLabelLiftMeters = (
  layer: RuntimeStyleLayer
): number | null => {
  if (!isMapStylePointLabelLayer(layer)) return null;
  if (isMapStyleRoadShieldLayer(layer)) return null;
  return getMapStyleLocationLabelLiftMeters(layer) ?? POINT_LABEL_LIFT_METERS;
};

/** @deprecated Prefer the explicit location-label classifier. */
export const isMapStyleLabelLayer = isMapStyleLocationLabelLayer;

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
