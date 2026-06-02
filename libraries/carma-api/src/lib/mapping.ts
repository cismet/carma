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

  // 2d (leaflet) -----------------------------------------------------------
  getPosition2D: () => Position2D | null;
  zoomIn2D?: () => void;
  zoomOut2D?: () => void;
  flyTo2D?: (lat: number, lng: number, zoom?: number) => void;
  hasLayer?: (id: string) => boolean;
  addLayer?: (id: string) => Promise<boolean>;
  removeLayer?: (id: string) => boolean;
  getLayerIDs?: () => string[];
  setBackgroundLayer?: (id: string) => boolean;

  // 3d (cesium) ------------------------------------------------------------
  getCameraPosition3D: () => CameraPosition3D | null;
  zoomIn3D?: () => void;
  zoomOut3D?: () => void;
  flyTo3D?: (lon: number, lat: number, height?: number) => void;
}

/** Public shape seen by callers of `carma.mapping`. */
export interface MappingFacade {
  getMode: () => MapMode | null;
}

/** Public shape seen by callers of `carma.mapping2D`. */
export interface Mapping2DFacade {
  activate: () => void;
  getPosition: () => Position2D | null;
  zoomIn: () => void;
  zoomOut: () => void;
  flyTo: (lat: number, lng: number, zoom?: number) => void;
  hasLayer: (id: string) => boolean;
  addLayer: (id: string) => Promise<boolean>;
  removeLayer: (id: string) => boolean;
  getLayerIDs: () => string[];
  setBackgroundLayer: (id: string) => boolean;
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
};

export const mapping2D: Mapping2DFacade = {
  activate: () => getAdapter()?.setMode("2d"),
  getPosition: () => getAdapter()?.getPosition2D() ?? null,
  zoomIn: () => getAdapter()?.zoomIn2D?.(),
  zoomOut: () => getAdapter()?.zoomOut2D?.(),
  flyTo: (lat, lng, zoom) => getAdapter()?.flyTo2D?.(lat, lng, zoom),
  hasLayer: (id) => getAdapter()?.hasLayer?.(id) ?? false,
  addLayer: (id) => getAdapter()?.addLayer?.(id) ?? Promise.resolve(false),
  removeLayer: (id) => getAdapter()?.removeLayer?.(id) ?? false,
  getLayerIDs: () => getAdapter()?.getLayerIDs?.() ?? [],
  setBackgroundLayer: (id) => getAdapter()?.setBackgroundLayer?.(id) ?? false,
};

export const mapping3D: Mapping3DFacade = {
  activate: () => getAdapter()?.setMode("3d"),
  getCameraPosition: () => getAdapter()?.getCameraPosition3D() ?? null,
  zoomIn: () => getAdapter()?.zoomIn3D?.(),
  zoomOut: () => getAdapter()?.zoomOut3D?.(),
  flyTo: (lon, lat, height) => getAdapter()?.flyTo3D?.(lon, lat, height),
};
