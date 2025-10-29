import { Camera } from "../../../../../cesium/src/index.ts";
/**
 * Camera state for portal app - all angles in degrees (plain numbers)
 * This is the external API for the portal app state
 */
export type CameraStateDegrees = {
  longitude: number;
  latitude: number;
  height: number;
  heading?: number;
  pitch?: number;
  fov?: number;
};
/**
 * Leaflet map position state
 */
export type LeafletMapState = {
  lat: number;
  lng: number;
  zoom: number;
};
/**
 * URL parameter keys used by Cesium camera state
 */
export declare const cesiumCameraParamKeys: string[];
/**
 * Parameter keys that should be cleared when switching from 3D to 2D
 * Keeps lng/lat as they're used in 2D mode too
 */
export declare const cesiumClearParamKeys: string[];
/**
 * URL parameter keys used by Leaflet map state
 */
export declare const leafletMapParamKeys: string[];
/**
 * Convert Cesium Camera to CameraStateDegrees (portal app state)
 * Returns all angles in degrees for external consumption
 */
export declare const cameraToState: (camera: Camera) => CameraStateDegrees;
/**
 * Encode CameraStateDegrees to URL hash parameters (stringified)
 * Note: Codecs expect radians internally, but we format as degrees in the URL
 */
export declare const encodeCameraState: (
  state: CameraStateDegrees
) => Record<string, string>;
/**
 * Decode URL hash parameters to CameraStateDegrees (portal app state)
 * Returns all angles in degrees for external consumption
 */
export declare const decodeCesiumCamera: (
  hashParams: Record<string, string>
) => CameraStateDegrees | null;
/**
 * Encode Leaflet map state to URL hash parameters
 */
export declare const encodeLeafletMap: (
  state: LeafletMapState
) => Record<string, string>;
/**
 * Decode URL hash parameters to Leaflet map state
 */
export declare const decodeLeafletMap: (
  hashParams: Record<string, string>
) => LeafletMapState | null;
