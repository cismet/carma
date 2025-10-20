import { createContext } from "react";
import type { CameraStateDegrees } from "../adapters/cesiumAdapter";
import type { LeafletMapState } from "../adapters/leafletAdapter";

export type MapMode = "2d" | "3d";

export type MapViewStateContextType = {
  /**
   * Current map mode
   */
  mode: MapMode;

  /**
   * Switch between 2D and 3D mode
   */
  setMode: (mode: MapMode) => void;

  /**
   * Decoded Cesium camera state (3D position) in degrees
   * Available when mode is "3d" or when hash contains Cesium params
   */
  cesiumState: CameraStateDegrees | null;

  /**
   * Decoded Leaflet map state (2D position)
   * Available when mode is "2d" or when hash contains Leaflet params
   */
  leafletState: LeafletMapState | null;

  /**
   * Update Cesium position and sync to URL hash
   */
  updateCesiumPosition: (state: CameraStateDegrees) => void;

  /**
   * Update Leaflet position and sync to URL hash
   */
  updateLeafletPosition: (state: LeafletMapState) => void;

  /**
   * Raw hash parameters for advanced use cases
   */
  hashParams: Record<string, string>;
};

export const MapViewStateContext =
  createContext<MapViewStateContextType | null>(null);
