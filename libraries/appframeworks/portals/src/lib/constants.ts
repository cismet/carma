export const defaultHashKeyAliases = {
  mapStyle: "m",
  isOblique: "oblq",
} as const;

export const MapStyleKeys = {
  TOPO: "karte",
  AERIAL: "luftbild",
} as const;

export type MapStyleKey = (typeof MapStyleKeys)[keyof typeof MapStyleKeys];

export const isMapStyleKey = (value: unknown): value is MapStyleKey => {
  return (
    typeof value === "string" &&
    (Object.values(MapStyleKeys) as readonly MapStyleKey[]).includes(
      value as MapStyleKey
    )
  );
};

export const mapStyleShortNames: Record<MapStyleKey, string> = {
  [MapStyleKeys.TOPO]: "0",
  [MapStyleKeys.AERIAL]: "1",
} as const;

export const ManagedCesiumStyleKeys = {
  LOD2: "secondary",
  MESH: "primary",
} as const;

export type ManagedCesiumStyleKey =
  (typeof ManagedCesiumStyleKeys)[keyof typeof ManagedCesiumStyleKeys];

/**
 * Default tileset identifiers for Cesium 3D content
 * Used by CesiumContext to manage tileset visibility
 */
export const DEFAULT_TILESET_IDS = {
  PRIMARY: "primary",
  SECONDARY: "secondary",
} as const;

export type TilesetId =
  (typeof DEFAULT_TILESET_IDS)[keyof typeof DEFAULT_TILESET_IDS];

/**
 * Default marker asset keys for 3D markers
 */
export const DEFAULT_MARKER_KEYS = {
  MARKER_GLOW_LINE: "MarkerGlowLine",
} as const;

export type MarkerKey =
  (typeof DEFAULT_MARKER_KEYS)[keyof typeof DEFAULT_MARKER_KEYS];

// mapping of 2d map styles to cesium styles
export const MapStyleMapping: Record<MapStyleKey, ManagedCesiumStyleKey> = {
  [MapStyleKeys.AERIAL]: ManagedCesiumStyleKeys.MESH,
  [MapStyleKeys.TOPO]: ManagedCesiumStyleKeys.LOD2,
} as const;

export type MapStyleShortName =
  (typeof mapStyleShortNames)[keyof typeof mapStyleShortNames];

type PrecisionOptions = {
  latitude: number;
  longitude: number;
  zoom: number;
  heading: number;
  bearing: number;
  pitch: number;
};

export const defaultPrecisions: PrecisionOptions = {
  latitude: 7,
  longitude: 7,
  zoom: 2,
  heading: 2,
  bearing: 2,
  pitch: 2,
} as const;
