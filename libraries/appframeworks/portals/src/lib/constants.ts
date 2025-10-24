export const ManagedEngineKeys = {
  LEAFLET_2D: "leaflet2d",
  CESIUM_3D: "cesium3d",
} as const;

export type ManagedEngineKey =
  (typeof ManagedEngineKeys)[keyof typeof ManagedEngineKeys];

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

/**
 * Short names for URL hash encoding of map styles.
 * Used by defaultHashCodecs.mapStyle to compress URLs.
 *
 * Mapping:
 * - "karte" (TOPO) → "0" in URL
 * - "luftbild" (AERIAL) → "1" in URL
 *
 * @see hashState.ts - getStringLookupCodec creates bidirectional codec
 */
export const mapStyleShortNames: Record<MapStyleKey, string> = {
  [MapStyleKeys.TOPO]: "0",
  [MapStyleKeys.AERIAL]: "1",
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

export const SELECTED_LAYER_INDEX = {
  NO_SELECTION: -2,
  BACKGROUND_LAYER: -1,
} as const;

export type SelectedLayerIndex =
  (typeof SELECTED_LAYER_INDEX)[keyof typeof SELECTED_LAYER_INDEX];
