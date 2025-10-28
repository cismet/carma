import type { MapStyleKey } from "../constants";
import { isMapStyleKey, ManagedEngineKeys } from "../constants";
import type { HashValues } from "../types";

/**
 * Parses initial portal state from URL hash values.
 * Uses the hashConfig codecs for proper parsing instead of manual parseFloat.
 *
 * This centralizes all URL → State parsing logic for the portal.
 *
 * @param hashValues - Decoded hash values from HashStateProvider (latitude, longitude, zoom, etc.)
 * @param styleConfig - Map style configuration
 * @param defaultPosition - Default 2D map position
 * @param defaultCameraLocation - Default 3D camera location
 * @returns Parsed initial state for portal
 */
export function getInitialPortalState(
  config: PortalConfig,
  hashValues: HashValues,
  enginesRef: MutableRefObject<MapEngineRecord[]>,
  mapStyleRef: MutableRefObject<MapStyleKey>,
  viewRef: MutableRefObject<MapView | null>,
  homeViewRef: MutableRefObject<MapView | null>,
  cameraRef: MutableRefObject<CameraPrimitive | null>,
  homeCameraRef: MutableRefObject<CameraPrimitive | null>
) {

  // settle map style
  if (mapStyleRef.current === null) {
    const hashStyle = hashValues.mapStyle;
    const isHashValidMapStyle =
      typeof hashStyle === "string" && isMapStyleKey(hashStyle);
    if (isHashValidMapStyle) {
      // use style from hash
      mapStyleRef.current = hashStyle;
    } else {
      // fallback to default style
      mapStyleRef.current = config.styleConfig.defaultStyle;
    }
  } else {
    console.log("[getInitialPortalState] Style already set, skipping");
  }

  // settle engines
  if (hashValues.engine === ManagedEngineKeys.CESIUM_3D) {
    console.log("[getInitialPortalState] Setting initial engine to 3D");
    for (const engine of enginesRef.current) {
      if (engine.engine === ManagedEngineKeys.LEAFLET_2D) {
        engine.isSuspended = true;
      } else if (engine.engine === ManagedEngineKeys.CESIUM_3D) {
        engine.isSuspended = false;
      }
    }
  } else {
    // default to 2D
    console.log("[getInitialPortalState] Setting initial engine to 2D");
    for (const engine of enginesRef.current) {
      if (engine.engine === ManagedEngineKeys.LEAFLET_2D) {
        engine.isSuspended = false;
      } else {
        engine.isSuspended = true;
      }
    }
  }

  // settle home view
  if (homeViewRef.current === null) {
    homeViewRef.current = config.homeView;
    console.log("[getInitialPortalState] Setting home view", homeViewRef.current);
  } else {
    console.log("[getInitialPortalState] Home view already set, skipping");
  }

  // settle initial camera to mapView
  
  if (mapViewRef.current === null) {
    const hasHashPosition =
      typeof hashValues.latitude === "number" &&
      typeof hashValues.longitude === "number";
    if (hasHashPosition) {
      mapViewRef.current = {
        latitude: hashValues.latitude as number,
        longitude: hashValues.longitude as number,
        zoom:
          typeof hashValues.zoom === "number"
            ? hashValues.zoom
            : config.view.zoom,
      };
      console.log("[getInitialPortalState] Setting initial view from hash", mapViewRef.current);
    } else {
      viewRef.current = config.view;
      console.log("[getInitialPortalState] Setting initial view from config", viewRef.current);
    }
  } else {
    console.log("[getInitialPortalState] Map view already set, skipping");
  }

  //settle home camera
  if (homeCameraRef.current === null) {
    homeCameraRef.current = config.homeCamera;
    console.log("[getInitialPortalState] Setting home camera", homeCameraRef.current);
  } else {
    console.log("[getInitialPortalState] Home camera already set, skipping");
  }

 

  if (cameraRef.current === null) {
    

  // 3D camera location (absolute positioning: lat/lng/h/heading/pitch/(roll)/fov)
  // Required: lat AND lng must both be present in URL
  // Optional: altitude, heading, pitch, fov (all fall back to defaults if missing)
  const cameraLocation = hasPosition
    ? {
        latitude: hashValues.latitude as number,
        longitude: hashValues.longitude as number,
        altitude:
          typeof hashValues.altitude === "number"
            ? hashValues.altitude
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

  console.log("[parseInitialPortalState] Result:", result);
  return result;
}
