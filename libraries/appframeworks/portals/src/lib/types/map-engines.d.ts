import type { Map as LeafletMap } from "leaflet";
import type { CesiumWidget } from "@carma/cesium";

/**
 * MapEngineRecord Array Ordering and Stacking
 * 
 * DESIGN DECISION: Array order MAY represent visual stacking order in the future
 * (later elements = higher z-index = on top of earlier elements).
 * 
 * CURRENT STATE: z-index is hardcoded in engine wrappers:
 * - Leaflet (2D): z-index not specified (defaults to auto/0)
 * - Cesium (3D): z-index 400 (always on top)
 * 
 * This means 3D is ALWAYS rendered above 2D by definition for now.
 * Array order is not currently used for stacking, but is reserved for future use
 * if we need dynamic z-index management or multiple simultaneous engines.
 */

// Base type for uninitialized engines
type BaseEngineRecord = {
  engine: MapEngine;
  isReady: false;
  isSuspended: true;
};

// Leaflet engine record (initialized)
type LeafletEngineRecord = {
  engine: "leaflet2d";
  isReady: true;
  isSuspended: boolean;
  instance: LeafletMap;
  zoomOut: (onComplete?: () => void) => void;
  zoomIn: (onComplete?: () => void) => void;
  flyHome: (onComplete?: () => void) => void;
  setView: (position: MapView) => void;
  id: string;
  // debug
  config: LeafletConfig;
  timestamp: number;
};

// Cesium engine record (initialized)
type CesiumEngineRecord = {
  engine: "cesium3d";
  isReady: true;
  isSuspended: boolean;
  instance: CesiumWidget;
  zoomOut: (onComplete?: () => void) => void;
  zoomIn: (onComplete?: () => void) => void;
  fovZoomOut?: (onComplete?: () => void) => void;
  fovZoomIn?: (onComplete?: () => void) => void;
  flyHome: (onComplete?: () => void) => void;
  setCamera: (camera: CameraState) => void;
  setStyle: (styleId: string) => void;
  triggerFadeIn?: () => void;
  // debug
  config: CesiumConfig;
  timestamp: number;
};

// All possible engine records (including uninitialized)
export type MapEngineRecord =
  | BaseEngineRecord
  | LeafletEngineRecord
  | CesiumEngineRecord;

// Helper type for active engines (ready and not suspended)
export type ManagedEngineRecord = LeafletEngineRecord | CesiumEngineRecord;

/**
 * Array of engine records
 * 
 * Order semantics: See documentation at top of file.
 * Currently, array order is not used for z-index stacking (hardcoded in wrappers),
 * but is reserved for future use if dynamic stacking is needed.
 */
export type EngineRecords = MapEngineRecord[];
