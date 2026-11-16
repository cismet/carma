export type MapMode = "2d" | "3d";

export type Position2D = {
  lat: number;
  lng: number;
  zoom: number;
};

export type CameraPosition3D = {
  lon: number;
  lat: number;
  height: number;
  heading: number;
  pitch: number;
  roll: number;
};

export type HomeView = {
  lat: number;
  lng: number;
  zoom?: number;
  /** ground altitude in meters at that position, for the 3d camera */
  altitude?: number;
  /** camera pitch in degrees, 3d only */
  pitch?: number;
  /** camera bearing in degrees, 3d only */
  bearing?: number;
  pitch2D?: number;
  bearing2D?: number;
  tooltip?: string;
  overlayLabel?: string;
  overlayDestination?: string;
};

/**
 * A switchable base map, as returned by `getBackgroundLayers`. `id` is what you
 * pass to `setBackgroundLayer`; `group` is the base-map group it belongs to
 * ("karte" | "luftbild").
 */
export type BackgroundLayerInfo = {
  id: string;
  title: string;
  group: string;
};

/** property values an object must have; compared as trimmed strings */
export type FeatureWhere = Record<string, string | number>;

/** what `mapping2D.selectFeature` is to select */
export type SelectFeatureRequest = {
  lat: number;
  lng: number;
  /**
   * Leaflet scale; the map moves to the point first when given, or when the
   * point is out of view
   */
  zoom?: number;
  /** catalog id of the object's layer; the layer has to be on the map */
  layerId?: string;
  where?: FeatureWhere;
};

/** what `mapping2D.selectFeature` selected */
export type FeatureSelection = {
  /** where the click went */
  clicked: { lat: number; lng: number };
  /** catalog id of the clicked object's layer, when the page could tell */
  layerId: string | null;
  /** the object the info box shows; null when nothing was selected in time */
  selected: {
    header?: string;
    title: string;
    subtitle?: string;
    properties?: Record<string, unknown>;
  } | null;
  /** further entries the info box offers for the same click */
  more: number;
};

/**
 * Carries out `mapping2D.selectFeature`. Registered by the app on its own,
 * apart from the `MapAdapter`: what a selection shows is the app's info box,
 * which only the app can wait for.
 */
export type FeatureSelector2D = (
  request: SelectFeatureRequest
) => Promise<FeatureSelection>;

/**
 * Raw injection point. The bridge (in the app layer) provides these closures.
 * Primitive-only on purpose — carma-api never imports leaflet, cesium, redux,
 * or any @carma-* package. Optional methods may be left unimplemented; the
 * facade no-ops and returns a sensible default.
 */
export interface MapAdapter {
  // mode (cross-cutting) ---------------------------------------------------
  getMode: () => MapMode | null;
  setMode: (mode: MapMode) => void;
  setHomeOverride?: (view: HomeView | null) => void;

  // 2d (leaflet) -----------------------------------------------------------
  getPosition2D: () => Position2D | null;
  zoomIn2D?: () => void;
  zoomOut2D?: () => void;
  flyTo2D?: (lat: number, lng: number, zoom?: number) => void;
  fitBounds2D?: (
    minLng: number,
    minLat: number,
    maxLng: number,
    maxLat: number,
    padding?: number
  ) => boolean;
  hasLayer?: (id: string) => boolean;
  addLayer?: (id: string) => Promise<boolean>;
  removeLayer?: (id: string) => boolean;
  setLayerVisibility?: (id: string, visible: boolean) => boolean;
  getLayerVisibility?: (id: string) => boolean | null;
  getLayerIDs?: () => string[];
  setBackgroundLayer?: (id: string) => boolean;
  getBackgroundLayers?: () => BackgroundLayerInfo[];

  // 3d (cesium) ------------------------------------------------------------
  getCameraPosition3D: () => CameraPosition3D | null;
  zoomIn3D?: () => void;
  zoomOut3D?: () => void;
  flyTo3D?: (lon: number, lat: number, height?: number) => void;
}

/** Public shape seen by callers of `carma.mapping`. */
export interface MappingFacade {
  getMode: () => MapMode | null;
  setHomeOverride: (view: HomeView | null) => void;
}

/** Public shape seen by callers of `carma.mapping2D`. */
export interface Mapping2DFacade {
  activate: () => void;
  getPosition: () => Position2D | null;
  zoomIn: () => void;
  zoomOut: () => void;
  flyTo: (lat: number, lng: number, zoom?: number) => void;
  fitBounds: (
    minLng: number,
    minLat: number,
    maxLng: number,
    maxLat: number,
    padding?: number
  ) => boolean;
  hasLayer: (id: string) => boolean;
  addLayer: (id: string) => Promise<boolean>;
  removeLayer: (id: string) => boolean;
  setLayerVisibility: (id: string, visible: boolean) => boolean;
  /** Whether a layer on the map is shown; `null` when it is not on the map. */
  getLayerVisibility: (id: string) => boolean | null;
  getLayerIDs: () => string[];
  setBackgroundLayer: (id: string) => boolean;
  /**
   * List the switchable base maps. Use the returned `id`s with
   * `setBackgroundLayer`. Returns `[]` when no catalog is registered.
   */
  getBackgroundLayers: () => BackgroundLayerInfo[];
  /**
   * Select an object the way a click on it does: highlighted, with the info
   * box. Without `layerId` and `where` the click goes to the point itself;
   * with them, to the matching object nearest to the point, also where other
   * layers are drawn over it. Rejects when nothing in view matches. Resolves
   * `null` when the app registered no selector (`registerFeatureSelector2D`).
   */
  selectFeature: (
    request: SelectFeatureRequest
  ) => Promise<FeatureSelection | null>;
}

/** Public shape seen by callers of `carma.mapping3D`. */
export interface Mapping3DFacade {
  activate: () => void;
  getCameraPosition: () => CameraPosition3D | null;
  zoomIn: () => void;
  zoomOut: () => void;
  flyTo: (lon: number, lat: number, height?: number) => void;
}

// Single adapter ref shared across the three mapping facades so the bridge
// only has to register one MapAdapter. Facade identities are stable for the
// lifetime of the module; only this ref mutates when `registerMapping` runs.
const adapterRef: { current: MapAdapter | null } = { current: null };
const getAdapter = (): MapAdapter | null => adapterRef.current;

export const registerMapping = (adapter: MapAdapter | null): void => {
  adapterRef.current = adapter;
};

const featureSelectorRef: { current: FeatureSelector2D | null } = {
  current: null,
};

export const registerFeatureSelector2D = (
  selector: FeatureSelector2D | null
): void => {
  featureSelectorRef.current = selector;
};

export const mapping: MappingFacade = {
  getMode: () => getAdapter()?.getMode() ?? null,
  setHomeOverride: (view) => getAdapter()?.setHomeOverride?.(view),
};

export const mapping2D: Mapping2DFacade = {
  activate: () => getAdapter()?.setMode("2d"),
  getPosition: () => getAdapter()?.getPosition2D() ?? null,
  zoomIn: () => getAdapter()?.zoomIn2D?.(),
  zoomOut: () => getAdapter()?.zoomOut2D?.(),
  flyTo: (lat, lng, zoom) => getAdapter()?.flyTo2D?.(lat, lng, zoom),
  fitBounds: (minLng, minLat, maxLng, maxLat, padding) =>
    getAdapter()?.fitBounds2D?.(minLng, minLat, maxLng, maxLat, padding) ??
    false,
  hasLayer: (id) => getAdapter()?.hasLayer?.(id) ?? false,
  addLayer: (id) => getAdapter()?.addLayer?.(id) ?? Promise.resolve(false),
  removeLayer: (id) => getAdapter()?.removeLayer?.(id) ?? false,
  setLayerVisibility: (id, visible) =>
    getAdapter()?.setLayerVisibility?.(id, visible) ?? false,
  getLayerVisibility: (id) => getAdapter()?.getLayerVisibility?.(id) ?? null,
  getLayerIDs: () => getAdapter()?.getLayerIDs?.() ?? [],
  setBackgroundLayer: (id) => getAdapter()?.setBackgroundLayer?.(id) ?? false,
  getBackgroundLayers: () => getAdapter()?.getBackgroundLayers?.() ?? [],
  selectFeature: (request) =>
    featureSelectorRef.current?.(request) ?? Promise.resolve(null),
};

export const mapping3D: Mapping3DFacade = {
  activate: () => getAdapter()?.setMode("3d"),
  getCameraPosition: () => getAdapter()?.getCameraPosition3D() ?? null,
  zoomIn: () => getAdapter()?.zoomIn3D?.(),
  zoomOut: () => getAdapter()?.zoomOut3D?.(),
  flyTo: (lon, lat, height) => getAdapter()?.flyTo3D?.(lon, lat, height),
};
