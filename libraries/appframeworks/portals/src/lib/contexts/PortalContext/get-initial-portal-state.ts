import type { MutableRefObject } from "react";
import {
  isMapStyleKey,
  ManagedEngineKeys,
  type MapStyleKey,
} from "../../constants";
import type { HashValues } from "../../types";
import type { MapView } from "@carma-mapping/engines/leaflet";
import { validateMapView } from "@carma-mapping/engines/leaflet";
import type { CameraPrimitive } from "@carma/cesium";
import {
  validateCameraStateHeadingPitchRoll,
  transformHeadingPitchRollToPrimitive,
} from "@carma/cesium/core";
import type { MapEngineRecord, PortalConfig } from "./types.d";

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

  const hasHomeView = validateMapView(config.homeView);
  if (!hasHomeView) {
    throw new Error(
      `No valid home view in config: ${JSON.stringify(config.homeView)}`
    );
  }

  // settle home view
  if (homeViewRef.current === null) {
    homeViewRef.current = config.homeView;
    console.log(
      "[getInitialPortalState] Setting home view",
      homeViewRef.current
    );
  } else {
    console.log("[getInitialPortalState] Home view already set, skipping");
  }

  const hasDefaultView = validateMapView(config.defaultView);
  if (!hasDefaultView) {
    throw new Error("No valid default view in config");
  }

  // settle initial camera to mapView
  if (viewRef.current === null) {
    const hasHashPosition =
      typeof hashValues.latitude === "number" &&
      typeof hashValues.longitude === "number";
    if (hasHashPosition) {
      viewRef.current = {
        center: {
          lat: hashValues.latitude as number,
          lng: hashValues.longitude as number,
        },
        zoom:
          typeof hashValues.zoom === "number"
            ? hashValues.zoom
            : config.defaultView.zoom,
      };
      console.debug(
        "[getInitialPortalState] Setting initial view from hash",
        viewRef.current
      );
    } else {
      viewRef.current = config.defaultView;
      console.debug(
        "[getInitialPortalState] Setting initial view from config",
        viewRef.current
      );
    }
  } else {
    console.debug("[getInitialPortalState] Map view already set, skipping");
  }

  const hasHomeCamera = validateCameraStateHeadingPitchRoll(config.homeCamera);
  if (!hasHomeCamera) {
    throw new Error("No valid home camera in config");
  }

  //settle home camera
  if (homeCameraRef.current === null) {
    const homeCameraPrimitive = transformHeadingPitchRollToPrimitive(
      config.homeCamera
    );
    homeCameraRef.current = homeCameraPrimitive;
    console.debug(
      "[getInitialPortalState] Setting home camera",
      homeCameraRef.current
    );
  } else {
    console.debug("[getInitialPortalState] Home camera already set, skipping");
  }

  const hasDefaultCamera = validateCameraStateHeadingPitchRoll(
    config.defaultCamera
  );
  if (!hasDefaultCamera) {
    throw new Error("No valid default camera in config");
  }

  // settle initial camera
  if (cameraRef.current === null) {
    const hasHashCamera = validateCameraStateHeadingPitchRoll(hashValues);
    if (hasHashCamera) {
      const cameraPrimitive = transformHeadingPitchRollToPrimitive(hashValues);
      cameraRef.current = cameraPrimitive;
      console.debug(
        "[getInitialPortalState] Setting initial camera from hash",
        cameraRef.current
      );
    } else {
      const cameraPrimitive = transformHeadingPitchRollToPrimitive(
        config.defaultCamera
      );
      cameraRef.current = cameraPrimitive;
      console.debug(
        "[getInitialPortalState] Setting initial camera from config",
        cameraRef.current
      );
    }
  } else {
    console.debug("[getInitialPortalState] Camera already set, skipping");
  }
}
