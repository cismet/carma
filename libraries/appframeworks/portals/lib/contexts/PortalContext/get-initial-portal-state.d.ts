import { MutableRefObject } from "react";
import { MapStyleKey } from "../../constants";
import { HashValues } from "../../types";
import { MapView } from "../../../../../../mapping/engines/leaflet/src/index.ts";
import { CameraPrimitive } from "../../../../../../cesium/src/index.ts";
import { MapEngineRecord, PortalConfig } from "../../types/portal";
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
export declare function getInitialPortalState(
  config: PortalConfig,
  hashValues: HashValues,
  enginesRef: MutableRefObject<MapEngineRecord[]>,
  mapStyleRef: MutableRefObject<MapStyleKey>,
  viewRef: MutableRefObject<MapView | null>,
  homeViewRef: MutableRefObject<MapView | null>,
  cameraRef: MutableRefObject<CameraPrimitive | null>,
  homeCameraRef: MutableRefObject<CameraPrimitive | null>
): void;
