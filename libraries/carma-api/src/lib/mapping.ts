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
    maxLat: number
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
    maxLat: number
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
  fitBounds: (minLng, minLat, maxLng, maxLat) =>
    getAdapter()?.fitBounds2D?.(minLng, minLat, maxLng, maxLat) ?? false,
  hasLayer: (id) => getAdapter()?.hasLayer?.(id) ?? false,
  addLayer: (id) => getAdapter()?.addLayer?.(id) ?? Promise.resolve(false),
  removeLayer: (id) => getAdapter()?.removeLayer?.(id) ?? false,
  setLayerVisibility: (id, visible) =>
    getAdapter()?.setLayerVisibility?.(id, visible) ?? false,
  getLayerVisibility: (id) => getAdapter()?.getLayerVisibility?.(id) ?? null,
  getLayerIDs: () => getAdapter()?.getLayerIDs?.() ?? [],
  setBackgroundLayer: (id) => getAdapter()?.setBackgroundLayer?.(id) ?? false,
  getBackgroundLayers: () => getAdapter()?.getBackgroundLayers?.() ?? [],
};

export const mapping3D: Mapping3DFacade = {
  activate: () => getAdapter()?.setMode("3d"),
  getCameraPosition: () => getAdapter()?.getCameraPosition3D() ?? null,
  zoomIn: () => getAdapter()?.zoomIn3D?.(),
  zoomOut: () => getAdapter()?.zoomOut3D?.(),
  flyTo: (lon, lat, height) => getAdapter()?.flyTo3D?.(lon, lat, height),
};
