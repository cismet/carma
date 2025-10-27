import type { MapStyleKey } from "../constants";
import { isMapStyleKey, ManagedEngineKeys } from "../constants";

/**
 * Parses initial portal state from URL hash values.
 * Uses the hashConfig codecs for proper parsing instead of manual parseFloat.
 *
 * This centralizes all URL → State parsing logic for the portal.
 *
 * @param hashValues - Raw hash values from HashStateProvider
 * @param styleConfig - Map style configuration
 * @param defaultPosition - Default 2D map position
 * @param defaultCameraLocation - Default 3D camera location
 * @returns Parsed initial state for portal
 */
export function parseInitialPortalState({
  hashValues,
  styleConfig,
  defaultPosition,
  defaultCameraLocation,
}: {
  hashValues: Record<string, unknown>;
  styleConfig: {
    defaultStyle: MapStyleKey;
    availableStyles: readonly MapStyleKey[];
  };
  defaultPosition: {
    latitude: number;
    longitude: number;
    zoom: number;
  };
  defaultCameraLocation?: {
    latitude?: number;
    longitude?: number;
    altitude?: number;
    heading?: number;
    pitch?: number;
    range?: number;
  };
}) {
  console.log("[parseInitialPortalState] Input:", {
    hashValues,
    defaultStyle: styleConfig.defaultStyle,
    defaultPosition,
    defaultCameraLocation,
  });

  const { defaultStyle } = styleConfig;

  // Map style - validate against available styles
  const mapStyle =
    isMapStyleKey(hashValues.mapStyle) &&
    styleConfig.availableStyles.includes(hashValues.mapStyle)
      ? hashValues.mapStyle
      : defaultStyle;

  // Engine (2D vs 3D)
  const engine =
    hashValues.engine === ManagedEngineKeys.CESIUM_3D
      ? ManagedEngineKeys.CESIUM_3D
      : ManagedEngineKeys.LEAFLET_2D;

  // 2D position format (lat/lng/zoom) - for Leaflet, MapLibre
  // Required: lat AND lng must both be present in URL
  // Optional: zoom (falls back to default if missing)
  const hasPosition =
    typeof hashValues.lat === "number" && typeof hashValues.lng === "number";

  const mapPosition = hasPosition
    ? {
        latitude: hashValues.lat as number,
        longitude: hashValues.lng as number,
        zoom:
          typeof hashValues.zoom === "number"
            ? hashValues.zoom
            : defaultPosition.zoom,
      }
    : defaultPosition;

  // 3D camera location (absolute positioning: lat/lng/h/heading/pitch/fov)
  // Required: lat AND lng must both be present in URL
  // Optional: h (altitude), heading, pitch, fov (all fall back to defaults if missing)
  const cameraLocation = hasPosition
    ? {
        latitude: hashValues.lat as number,
        longitude: hashValues.lng as number,
        altitude:
          typeof hashValues.h === "number"
            ? hashValues.h
            : defaultCameraLocation?.altitude,
        heading:
          typeof hashValues.heading === "number"
            ? hashValues.heading
            : defaultCameraLocation?.heading,
        pitch:
          typeof hashValues.pitch === "number"
            ? hashValues.pitch
            : defaultCameraLocation?.pitch,
        fov:
          typeof hashValues.fov === "number"
            ? hashValues.fov
            : defaultCameraLocation?.fov,
        roll: 0,
      }
    : {
        latitude: defaultCameraLocation?.latitude ?? defaultPosition.latitude,
        longitude:
          defaultCameraLocation?.longitude ?? defaultPosition.longitude,
        altitude: defaultCameraLocation?.altitude,
        heading: defaultCameraLocation?.heading,
        pitch: defaultCameraLocation?.pitch,
        fov: defaultCameraLocation?.fov,
        roll: 0,
      };

  const result = {
    initialMapStyle: mapStyle,
    initialEngine: engine,
    initialMapPosition: mapPosition,
    initialCameraLocation: cameraLocation,
  };

  console.log("[parseInitialPortalState] Result:", result);
  return result;
}
