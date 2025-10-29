export declare const ManagedEngineKeys: {
  readonly LEAFLET_2D: "leaflet2d";
  readonly MAPLIBRE_2D: "maplibre2d";
  readonly CESIUM_3D: "cesium3d";
};
export type ManagedEngineKey =
  (typeof ManagedEngineKeys)[keyof typeof ManagedEngineKeys];
export declare const MapStyleKeys: {
  readonly TOPO: "karte";
  readonly AERIAL: "luftbild";
};
export type MapStyleKey = (typeof MapStyleKeys)[keyof typeof MapStyleKeys];
export declare const isMapStyleKey: (value: unknown) => value is MapStyleKey;
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
export declare const mapStyleShortNames: Record<MapStyleKey, string>;
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
export declare const defaultPrecisions: PrecisionOptions;
export declare const SELECTED_LAYER_INDEX: {
  readonly NO_SELECTION: -2;
  readonly BACKGROUND_LAYER: -1;
};
export type SelectedLayerIndex =
  (typeof SELECTED_LAYER_INDEX)[keyof typeof SELECTED_LAYER_INDEX];
export {};
