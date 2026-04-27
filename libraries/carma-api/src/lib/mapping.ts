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
  getMode: () => MapMode | null;
  getPosition2D: () => Position2D | null;
  getCameraPosition3D: () => CameraPosition3D | null;
  setMode: (mode: MapMode) => void;
  removeLayer?: (id: string) => boolean;
  getLayerIDs?: () => string[];
}

/** Public shape seen by callers of `carma.mapping`. */
export interface MappingFacade {
  getMode: () => MapMode | null;
  removeLayer: (id: string) => boolean;
  getLayerIDs: () => string[];
}

/** Public shape seen by callers of `carma.mapping2d`. */
export interface Mapping2DFacade {
  getPosition: () => Position2D | null;
  activate: () => void;
}

/** Public shape seen by callers of `carma.mapping3d`. */
export interface Mapping3DFacade {
  getCameraPosition: () => CameraPosition3D | null;
  activate: () => void;
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
  removeLayer: (id) => getAdapter()?.removeLayer?.(id) ?? false,
  getLayerIDs: () => getAdapter()?.getLayerIDs?.() ?? [],
};

export const mapping2D: Mapping2DFacade = {
  getPosition: () => getAdapter()?.getPosition2D() ?? null,
  activate: () => getAdapter()?.setMode("2d"),
};

export const mapping3D: Mapping3DFacade = {
  getCameraPosition: () => getAdapter()?.getCameraPosition3D() ?? null,
  activate: () => getAdapter()?.setMode("3d"),
};
